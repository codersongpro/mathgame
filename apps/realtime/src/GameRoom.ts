import { DurableObject } from "cloudflare:workers";
import {
  FLOOR_Y,
  SNAPSHOT_RATE,
  STAGE_ONE_TARGET_SECONDS,
  TICK_RATE,
  RoomRoster,
  createMathQuestion,
  createMonster,
  fireBubble,
  monsterLimit,
  popTrappedBubble,
  selectMapTier,
  stageElapsedSeconds,
  stageOneComplete,
  stageOneGoals,
  stepCombat,
  stepPlayer,
  type CombatBubble,
  type CombatMonster,
  type MapTier,
  type MathQuestion,
  type PlayerInput,
  type PlayerSimulationState,
  type RosterPlayer,
} from "@bubble-semble/game-core";
import {
  ClientMessageSchema,
  type PublicPlayerState,
  type ServerMessage,
} from "@bubble-semble/shared";
import type { Env } from "./index";
import { InputRateLimiter } from "./rateLimit";

type ConnectionAttachment = {
  connectionId: string;
  playerId: string | null;
};

type ConnectionState = ConnectionAttachment & {
  limiter: InputRateLimiter;
  lastActionSequence: number;
};

type Checkpoint = {
  serverTick: number;
  roster: RosterPlayer[];
  players: Array<{
    id: string;
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    grounded: boolean;
  }>;
  fixedMapTier: MapTier | null;
  monsters?: CombatMonster[];
  bubbles?: CombatBubble[];
  capturedCount?: number;
  nextMonsterIndex?: number;
  nextBubbleIndex?: number;
  quizSeed?: number;
  nextQuestionIndex?: number;
  stageStartedAtTick?: number | null;
  stageClearedAtTick?: number | null;
  stagePlayerCount?: number | null;
  updatedAt: number;
};

type TeacherRoomRecord = {
  teacherTokenHash: string;
  expiresAt: number;
};

type PersonalQuiz = {
  question: MathQuestion;
  wrongChoices: Set<number>;
  completed: boolean;
  solvedCount: number;
  boostedUntilTick: number;
  lastFeedback: Extract<ServerMessage, { type: "quiz-feedback" }> | null;
};

const ROOM_LIFETIME_MS = 4 * 60 * 60 * 1_000;

const TICK_INTERVAL_MS = 1_000 / TICK_RATE;
const SNAPSHOT_EVERY_TICKS = TICK_RATE / SNAPSHOT_RATE;

async function digestToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function initialPlayerState(index: number): PlayerSimulationState {
  return {
    x: 80 + index * 48,
    y: FLOOR_Y,
    velocityX: 0,
    velocityY: 0,
    grounded: true,
  };
}

export class GameRoom extends DurableObject<Env> {
  readonly #roster = new RoomRoster({
    createPlayerId: () => crypto.randomUUID(),
    createReconnectToken: () => crypto.randomUUID(),
  });
  readonly #connections = new Map<WebSocket, ConnectionState>();
  readonly #playerStates = new Map<string, PlayerSimulationState>();
  readonly #inputs = new Map<string, PlayerInput>();
  readonly #lastFireTick = new Map<string, number>();
  readonly #quizzes = new Map<string, PersonalQuiz>();
  #quizSeed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  #nextQuestionIndex = 0;
  #monsters: CombatMonster[] = [];
  #bubbles: CombatBubble[] = [];
  #capturedCount = 0;
  #nextMonsterIndex = 0;
  #nextBubbleIndex = 0;
  #serverTick = 0;
  #fixedMapTier: MapTier | null = null;
  #stageStartedAtTick: number | null = null;
  #stageClearedAtTick: number | null = null;
  #stagePlayerCount: number | null = null;
  #teamSolvedCount = 0;
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as ConnectionAttachment | null;
      if (!attachment) continue;
      this.#connections.set(socket, {
        ...attachment,
        limiter: new InputRateLimiter(),
        lastActionSequence: -1,
      });
    }

    this.ctx.blockConcurrencyWhile(async () => {
      const checkpoint = await this.ctx.storage.get<Checkpoint>("checkpoint");
      if (!checkpoint) return;
      this.#serverTick = checkpoint.serverTick;
      this.#fixedMapTier = checkpoint.fixedMapTier;
      this.#monsters = checkpoint.monsters ?? [];
      this.#bubbles = checkpoint.bubbles ?? [];
      this.#capturedCount = checkpoint.capturedCount ?? 0;
      this.#nextMonsterIndex = checkpoint.nextMonsterIndex ?? 0;
      this.#nextBubbleIndex = checkpoint.nextBubbleIndex ?? 0;
      this.#quizSeed = checkpoint.quizSeed ?? this.#quizSeed;
      this.#nextQuestionIndex = checkpoint.nextQuestionIndex ?? 0;
      this.#stageStartedAtTick = checkpoint.stageStartedAtTick ?? null;
      this.#stageClearedAtTick = checkpoint.stageClearedAtTick ?? null;
      this.#stagePlayerCount = checkpoint.stagePlayerCount ?? null;
      this.#roster.restore(checkpoint.roster);
      for (const player of checkpoint.players) {
        this.#playerStates.set(player.id, {
          x: player.x,
          y: player.y,
          velocityX: player.velocityX,
          velocityY: player.velocityY,
          grounded: player.grounded,
        });
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/internal/create" && request.method === "POST") {
      const token = request.headers.get("X-Teacher-Token");
      if (!token || !/^[a-f0-9]{64}$/.test(token)) {
        return Response.json({ code: "INVALID_TOKEN" }, { status: 400 });
      }
      const now = Date.now();
      const teacherTokenHash = await digestToken(token);
      const created = await this.ctx.storage.transaction(async (storage) => {
        if (await storage.get<TeacherRoomRecord>("teacherRoom")) return false;
        await storage.put("teacherRoom", {
          teacherTokenHash,
          expiresAt: now + ROOM_LIFETIME_MS,
        } satisfies TeacherRoomRecord);
        return true;
      });
      return created
        ? Response.json({ expiresAt: now + ROOM_LIFETIME_MS }, { status: 201 })
        : Response.json({ code: "ROOM_EXISTS" }, { status: 409 });
    }

    const room = await this.ctx.storage.get<TeacherRoomRecord>("teacherRoom");
    if (!room) return Response.json({ code: "ROOM_NOT_FOUND" }, { status: 404 });
    if (room.expiresAt <= Date.now()) {
      return Response.json({ code: "ROOM_EXPIRED" }, { status: 410 });
    }

    if (pathname === "/internal/status" && request.method === "GET") {
      const token = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
      if (!/^[a-f0-9]{64}$/.test(token) || (await digestToken(token)) !== room.teacherTokenHash) {
        return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
      }
      this.#pruneExpiredPlayers(Date.now());
      return Response.json({
        expiresAt: room.expiresAt,
        capturedCount: this.#capturedCount,
        stage: this.#stageMessage(),
        players: this.#roster.players().map(({ id, nickname, connected }) => ({
          id,
          nickname,
          connected,
          solvedCount: this.#quizzes.get(id)?.solvedCount ?? 0,
        })),
      }, { headers: { "Cache-Control": "no-store" } });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return Response.json(
        { code: "UPGRADE_REQUIRED", message: "WebSocket 업그레이드가 필요합니다." },
        { status: 426 },
      );
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    const connection: ConnectionState = {
      connectionId: crypto.randomUUID(),
      playerId: null,
      limiter: new InputRateLimiter(),
      lastActionSequence: -1,
    };

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      connectionId: connection.connectionId,
      playerId: connection.playerId,
    } satisfies ConnectionAttachment);
    this.#connections.set(server, connection);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, rawMessage: string | ArrayBuffer): Promise<void> {
    const connection = this.#connections.get(socket);
    if (!connection || typeof rawMessage !== "string") {
      this.#sendError(socket, "INVALID_MESSAGE", "문자열 JSON 메시지만 허용됩니다.");
      return;
    }

    let unknownMessage: unknown;
    try {
      unknownMessage = JSON.parse(rawMessage);
    } catch {
      this.#sendError(socket, "INVALID_MESSAGE", "올바른 JSON 메시지가 아닙니다.");
      return;
    }

    const parsed = ClientMessageSchema.safeParse(unknownMessage);
    if (!parsed.success) {
      this.#sendError(socket, "INVALID_MESSAGE", "허용되지 않은 메시지 형식입니다.");
      return;
    }

    const message = parsed.data;
    if (message.type === "ping") {
      this.#send(socket, { type: "pong", sentAt: message.sentAt, serverAt: Date.now() });
      return;
    }

    if (message.type === "join") {
      if (connection.playerId) {
        this.#sendError(socket, "INVALID_MESSAGE", "이미 입장한 연결입니다.");
        return;
      }

      this.#pruneExpiredPlayers(Date.now());
      const issuedToken = crypto.randomUUID();
      const issuedReconnectToken = await digestToken(issuedToken);
      const reconnectToken =
        message.reconnectToken === undefined
          ? undefined
          : await digestToken(message.reconnectToken);
      const joinRequest = {
        nickname: message.nickname,
        issuedReconnectToken,
        ...(reconnectToken ? { reconnectToken } : {}),
      };
      const joined = this.#roster.join(joinRequest, Date.now());
      if (!joined.ok) {
        this.#sendError(socket, joined.code, "방 정원은 최대 10명입니다.");
        return;
      }

      connection.playerId = joined.player.id;
      socket.serializeAttachment({
        connectionId: connection.connectionId,
        playerId: connection.playerId,
      } satisfies ConnectionAttachment);

      if (!this.#playerStates.has(joined.player.id)) {
        this.#playerStates.set(joined.player.id, initialPlayerState(this.#playerStates.size));
      }

      this.#inputs.set(joined.player.id, {
        sequence: 0,
        axis: 0,
        jump: false,
      });
      this.#ensureMonsterPopulation();
      this.#send(socket, {
        type: "joined",
        playerId: joined.player.id,
        reconnectToken: joined.reconnected ? message.reconnectToken! : issuedToken,
        tickRate: TICK_RATE,
        snapshotRate: SNAPSHOT_RATE,
      });
      const quiz = this.#quizzes.get(joined.player.id) ?? this.#createQuiz(joined.player.id);
      this.#sendQuestion(socket, quiz);
      if (quiz.lastFeedback) this.#send(socket, quiz.lastFeedback);
      this.#send(socket, this.#stageMessage());
      await this.#persistCheckpoint();
      this.#startLoop();
      return;
    }

    if (!connection.playerId) {
      this.#sendError(socket, "INVALID_MESSAGE", "입장 완료 뒤에만 이동할 수 있습니다.");
      return;
    }

    if (this.#stageClearedAtTick !== null) return;

    if (!connection.limiter.allow(Date.now())) {
      this.#sendError(socket, "RATE_LIMITED", "이동 입력이 너무 빠릅니다.");
      return;
    }

    if (message.type === "answer") {
      const quiz = this.#quizzes.get(connection.playerId);
      if (!quiz || quiz.completed || quiz.question.id !== message.questionId ||
        !quiz.question.choices.includes(message.choice)) {
        this.#sendError(socket, "INVALID_MESSAGE", "현재 문제의 선택지만 제출할 수 있습니다.");
        return;
      }
      // 같은 오답을 다시 눌러 재도전 기회를 소모하지 못하게 합니다.
      if (quiz.wrongChoices.has(message.choice)) return;

      const correct = message.choice === quiz.question.correctAnswer;
      if (correct) {
        quiz.solvedCount += 1;
        this.#teamSolvedCount += 1;
        quiz.completed = true;
        quiz.boostedUntilTick = this.#serverTick + TICK_RATE * 5;
      } else {
        quiz.wrongChoices.add(message.choice);
        quiz.completed = quiz.wrongChoices.size >= 2;
      }
      quiz.lastFeedback = {
        type: "quiz-feedback",
        questionId: quiz.question.id,
        correct,
        completed: quiz.completed,
        solvedCount: quiz.solvedCount,
        boosted: correct,
        ...(!correct && !quiz.completed
          ? { hint: quiz.question.hint, wrongChoice: message.choice }
          : {}),
        ...(!correct && quiz.completed ? { answer: quiz.question.correctAnswer } : {}),
      };
      this.#send(socket, quiz.lastFeedback);
      if (correct) await this.#maybeClearStage();
      return;
    }

    if (message.type === "next-question") {
      const quiz = this.#quizzes.get(connection.playerId);
      if (!quiz?.completed) {
        this.#sendError(socket, "INVALID_MESSAGE", "현재 문제를 먼저 완료해 주세요.");
        return;
      }
      this.#sendQuestion(socket, this.#createQuiz(connection.playerId, quiz.solvedCount, quiz.boostedUntilTick));
      return;
    }

    if (this.#fixedMapTier === null) {
      this.#fixedMapTier = selectMapTier(this.#connectedPlayerCount());
      this.#stageStartedAtTick = this.#serverTick;
      this.#stagePlayerCount = this.#connectedPlayerCount();
      await this.#persistCheckpoint();
    }

    if (message.type === "action") {
      if (message.sequence <= connection.lastActionSequence) return;
      connection.lastActionSequence = message.sequence;
      const player = this.#playerStates.get(connection.playerId);
      if (!player) return;

      if (message.kind === "fire") {
        const lastFireTick = this.#lastFireTick.get(connection.playerId) ?? -TICK_RATE;
        const boosted = (this.#quizzes.get(connection.playerId)?.boostedUntilTick ?? 0) > this.#serverTick;
        if (this.#serverTick - lastFireTick < TICK_RATE / (boosted ? 4 : 2)) return;
        this.#lastFireTick.set(connection.playerId, this.#serverTick);
        this.#nextBubbleIndex += 1;
        this.#bubbles.push(
          fireBubble(
            `bubble-${this.#nextBubbleIndex}`,
            connection.playerId,
            player.x,
            player.y,
            message.direction,
            this.#serverTick,
          ),
        );
      } else {
        const result = popTrappedBubble(this.#monsters, this.#bubbles, player.x, player.y);
        this.#monsters = result.monsters;
        this.#bubbles = result.bubbles;
        if (result.captured) this.#capturedCount += 1;
      }
      await this.#maybeClearStage();
      await this.#persistCheckpoint();
      return;
    }

    this.#inputs.set(connection.playerId, message);
  }

  async webSocketClose(
    socket: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    const connection = this.#connections.get(socket);
    this.#connections.delete(socket);

    if (connection?.playerId) {
      this.#roster.disconnect(connection.playerId, Date.now());
      await this.#persistCheckpoint();
    }

    if (!this.#hasConnectedPlayers()) {
      this.#stopLoop();
      await this.#persistCheckpoint();
    }

    // 종료 이벤트 뒤에는 이미 닫힌 소켓이므로 다시 close(1006)를 호출하지 않습니다.
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.webSocketClose(socket, 1011, "socket error", false);
    if (socket.readyState === WebSocket.OPEN) socket.close(1011, "socket error");
  }

  #startLoop(): void {
    if (this.#timer !== null) return;
    this.#timer = setTimeout(() => void this.#tick(), TICK_INTERVAL_MS);
  }

  #stopLoop(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  async #tick(): Promise<void> {
    this.#timer = null;
    if (!this.#hasConnectedPlayers()) {
      await this.#persistCheckpoint();
      return;
    }

    this.#serverTick += 1;
    if (this.#stageClearedAtTick === null) {
      for (const player of this.#roster.players()) {
        if (!player.connected) continue;
        const state = this.#playerStates.get(player.id);
        const input = this.#inputs.get(player.id);
        if (!state || !input) continue;

        this.#playerStates.set(player.id, stepPlayer(state, input, 1 / TICK_RATE));
        this.#inputs.set(player.id, { ...input, jump: false });
      }

      const combat = stepCombat(this.#monsters, this.#bubbles, this.#serverTick);
      this.#monsters = combat.monsters;
      this.#bubbles = combat.bubbles;
    }

    if (this.#serverTick % SNAPSHOT_EVERY_TICKS === 0) {
      this.#broadcastSnapshot();
    }
    if (this.#serverTick % TICK_RATE === 0) await this.#persistCheckpoint();

    this.#startLoop();
  }

  #broadcastSnapshot(): void {
    const rosterPlayers = this.#roster.players();
    const publicPlayers: PublicPlayerState[] = rosterPlayers
      .map((player) => {
        const state = this.#playerStates.get(player.id);
        if (!state) return null;
        return {
          id: player.id,
          nickname: player.nickname,
          x: state.x,
          y: state.y,
          velocityX: state.velocityX,
          velocityY: state.velocityY,
          connected: player.connected,
        };
      })
      .filter((player): player is PublicPlayerState => player !== null)
      .sort((left, right) => left.id.localeCompare(right.id));

    const snapshot: ServerMessage = {
      type: "snapshot",
      serverTick: this.#serverTick,
      mapTier: this.#fixedMapTier ?? selectMapTier(this.#connectedPlayerCount()),
      players: publicPlayers,
    };

    // 별도 메시지라서 이전 웹 버전도 기존 위치 스냅샷을 계속 읽을 수 있습니다.
    const combat: ServerMessage = {
      type: "combat",
      serverTick: this.#serverTick,
      monsters: this.#monsters.map(({ id, x, y, trapped }) => ({ id, x, y, trapped })),
      bubbles: this.#bubbles.map(({ id, x, y, trappedMonsterId }) => ({
        id,
        x,
        y,
        trappedMonsterId,
      })),
      capturedCount: this.#capturedCount,
    };

    for (const [socket, connection] of this.#connections) {
      if (!connection.playerId) continue;
      this.#send(socket, snapshot);
      this.#send(socket, combat);
      this.#send(socket, this.#stageMessage());
    }
  }

  #ensureMonsterPopulation(): void {
    if (this.#stageClearedAtTick !== null) return;
    const target = monsterLimit(this.#connectedPlayerCount());
    while (this.#nextMonsterIndex < target) {
      this.#monsters.push(createMonster(this.#nextMonsterIndex));
      this.#nextMonsterIndex += 1;
    }
  }

  #hasConnectedPlayers(): boolean {
    return this.#roster.players().some((player) => player.connected);
  }

  #connectedPlayerCount(): number {
    return Math.max(1, this.#roster.players().filter((player) => player.connected).length);
  }

  #pruneExpiredPlayers(now: number): void {
    const beforeIds = this.#roster.players().map((player) => player.id);
    if (this.#roster.pruneExpired(now) === 0) return;
    const remainingIds = new Set(this.#roster.players().map((player) => player.id));
    for (const playerId of beforeIds) {
      if (remainingIds.has(playerId)) continue;
      this.#playerStates.delete(playerId);
      this.#inputs.delete(playerId);
      this.#lastFireTick.delete(playerId);
      this.#quizzes.delete(playerId);
    }
  }

  async #persistCheckpoint(): Promise<void> {
    const checkpoint: Checkpoint = {
      serverTick: this.#serverTick,
      roster: this.#roster.players(),
      players: [...this.#playerStates].map(([id, state]) => ({ id, ...state })),
      fixedMapTier: this.#fixedMapTier,
      monsters: this.#monsters,
      bubbles: this.#bubbles,
      capturedCount: this.#capturedCount,
      nextMonsterIndex: this.#nextMonsterIndex,
      nextBubbleIndex: this.#nextBubbleIndex,
      quizSeed: this.#quizSeed,
      nextQuestionIndex: this.#nextQuestionIndex,
      stageStartedAtTick: this.#stageStartedAtTick,
      stageClearedAtTick: this.#stageClearedAtTick,
      stagePlayerCount: this.#stagePlayerCount,
      updatedAt: Date.now(),
    };
    await this.ctx.storage.put("checkpoint", checkpoint);
  }

  #createQuiz(playerId: string, solvedCount = 0, boostedUntilTick = 0): PersonalQuiz {
    // 개인 정답과 시도 내역은 Durable Object 저장소에 쓰지 않습니다.
    const quiz: PersonalQuiz = {
      question: createMathQuestion(this.#nextQuestionIndex++, crypto.randomUUID(), this.#quizSeed),
      wrongChoices: new Set(),
      completed: false,
      solvedCount,
      boostedUntilTick,
      lastFeedback: null,
    };
    this.#quizzes.set(playerId, quiz);
    return quiz;
  }

  #sendQuestion(socket: WebSocket, quiz: PersonalQuiz): void {
    this.#send(socket, {
      type: "question",
      questionId: quiz.question.id,
      prompt: quiz.question.prompt,
      choices: quiz.question.choices,
      solvedCount: quiz.solvedCount,
    });
  }

  #stageMessage(): Extract<ServerMessage, { type: "stage" }> {
    const goals = stageOneGoals(this.#stagePlayerCount ?? this.#connectedPlayerCount());
    return {
      type: "stage",
      stage: 1,
      status: this.#stageClearedAtTick !== null
        ? "cleared" : this.#stageStartedAtTick !== null ? "active" : "waiting",
      capturedCount: this.#capturedCount,
      captureGoal: goals.captureGoal,
      solvedCount: this.#stageClearedAtTick !== null
        ? Math.max(this.#teamSolvedCount, goals.questionGoal) : this.#teamSolvedCount,
      questionGoal: goals.questionGoal,
      elapsedSeconds: this.#stageStartedAtTick === null ? 0 : stageElapsedSeconds(
        this.#stageStartedAtTick,
        this.#stageClearedAtTick ?? this.#serverTick,
      ),
      targetSeconds: STAGE_ONE_TARGET_SECONDS,
    };
  }

  async #maybeClearStage(): Promise<void> {
    if (this.#stageStartedAtTick === null || this.#stageClearedAtTick !== null) return;
    const goals = stageOneGoals(this.#stagePlayerCount ?? 1);
    if (!stageOneComplete(goals, this.#capturedCount, this.#teamSolvedCount)) return;
    this.#stageClearedAtTick = this.#serverTick;
    await this.#persistCheckpoint();
    for (const [socket, connection] of this.#connections) {
      if (connection.playerId) this.#send(socket, this.#stageMessage());
    }
  }

  #send(socket: WebSocket, message: ServerMessage): void {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      this.#connections.delete(socket);
    }
  }

  #sendError(
    socket: WebSocket,
    code: Extract<ServerMessage, { type: "error" }>["code"],
    message: string,
  ): void {
    this.#send(socket, { type: "error", code, message });
  }
}
