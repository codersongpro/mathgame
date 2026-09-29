import { DurableObject } from "cloudflare:workers";
import {
  FLOOR_Y,
  bossHealthForPlayers,
  HIT_PROTECTION_TICKS,
  CORRECT_ANSWER_SCORE,
  MONSTER_CAPTURE_SCORE,
  SNAPSHOT_RATE,
  TICK_RATE,
  RoomRoster,
  createMathQuestion,
  createMonster,
  fireBubble,
  gateFragmentGoal,
  hitBoss,
  stageMonsterLimit,
  nearestFriendToRescue,
  popTrappedBubble,
  readyToRecover,
  scoreGoalForSet,
  selectMapTier,
  shouldOpenTeamGate,
  stageElapsedSeconds,
  stageGoalReached,
  stageOneGoals,
  stepCombat,
  stepPlayer,
  touchedMonster,
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
  RoomStageSettingsSchema,
  type PublicPlayerState,
  type RoomStageSettings,
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
  stageNumber?: 1 | 2 | 3 | 4;
  stageScore?: number;
  teamSolvedCount?: number;
  downedPlayers?: Array<{ id: string; downedAtTick: number }>;
  protectedPlayers?: Array<{ id: string; untilTick: number }>;
  rescueCount?: number;
  stageSurvivalTicks?: number;
  gateOpened?: boolean;
  gateSolvedCount?: number;
  bossHealth?: number;
  bossMaxHealth?: number;
  setNumber?: number;
  bossRuns?: Array<{ setNumber: number; playerCount: number; elapsedSeconds: number }>;
  updatedAt: number;
};

type TeacherRoomRecord = {
  teacherTokenHash: string;
  expiresAt: number;
  settings?: RoomStageSettings;
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
  readonly #downedPlayers = new Map<string, { downedAtTick: number }>();
  readonly #protectedPlayers = new Map<string, number>();
  readonly #gateQuestions = new Map<string, MathQuestion>();
  readonly #gateContributors = new Set<string>();
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
  #stageNumber: 1 | 2 | 3 | 4 = 1;
  // 학생이 보낸 점수 값은 받지 않고 서버가 확인한 정답·포획만 누적합니다.
  #stageScore = 0;
  #settings: RoomStageSettings = RoomStageSettingsSchema.parse({});
  #teamSolvedCount = 0;
  #rescueCount = 0;
  #stageSurvivalTicks = 0;
  #gateOpened = false;
  #gateSolvedCount = 0;
  #bossHealth = 0;
  #bossMaxHealth = 0;
  #setNumber = 1;
  #bossRuns: Array<{ setNumber: number; playerCount: number; elapsedSeconds: number }> = [];
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
      const room = await this.ctx.storage.get<TeacherRoomRecord>("teacherRoom");
      if (room?.settings) this.#settings = RoomStageSettingsSchema.parse(room.settings);
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
      this.#stageNumber = checkpoint.stageNumber ?? 1;
      this.#stageScore = checkpoint.stageScore ?? 0;
      this.#teamSolvedCount = checkpoint.teamSolvedCount ?? 0;
      this.#rescueCount = checkpoint.rescueCount ?? 0;
      this.#stageSurvivalTicks = checkpoint.stageSurvivalTicks ?? (
        this.#stageStartedAtTick === null ? 0 : Math.max(0, this.#serverTick - this.#stageStartedAtTick)
      );
      this.#gateOpened = checkpoint.gateOpened ?? false;
      this.#gateSolvedCount = checkpoint.gateSolvedCount ?? 0;
      this.#bossHealth = checkpoint.bossHealth ?? 0;
      this.#bossMaxHealth = checkpoint.bossMaxHealth ?? 0;
      this.#setNumber = checkpoint.setNumber ?? 1;
      this.#bossRuns = checkpoint.bossRuns ?? [];
      for (const player of checkpoint.downedPlayers ?? []) this.#downedPlayers.set(player.id, player);
      for (const player of checkpoint.protectedPlayers ?? []) this.#protectedPlayers.set(player.id, player.untilTick);
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
      const body = await request.json().catch(() => null) as { settings?: unknown } | null;
      const settings = RoomStageSettingsSchema.safeParse(body?.settings ?? {});
      if (!settings.success) return Response.json({ code: "INVALID_GOALS" }, { status: 400 });
      const now = Date.now();
      const teacherTokenHash = await digestToken(token);
      const created = await this.ctx.storage.transaction(async (storage) => {
        if (await storage.get<TeacherRoomRecord>("teacherRoom")) return false;
        await storage.put("teacherRoom", {
          teacherTokenHash,
          expiresAt: now + ROOM_LIFETIME_MS,
          settings: settings.data,
        } satisfies TeacherRoomRecord);
        return true;
      });
      if (created) this.#settings = settings.data;
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
        settings: this.#settings,
        capturedCount: this.#capturedCount,
        rescueCount: this.#rescueCount,
        downedCount: this.#roster.players().filter((player) => player.connected && this.#downedPlayers.has(player.id)).length,
        stage: this.#stageMessage(),
        gate: this.#stageNumber >= 3 ? this.#gateStateMessage() : null,
        boss: this.#stageNumber === 4 ? this.#bossStateMessage() : null,
        bossRuns: this.#bossRuns,
        players: this.#roster.players().map(({ id, nickname, connected }) => ({
          id,
          nickname,
          connected,
          solvedCount: this.#quizzes.get(id)?.solvedCount ?? 0,
          downed: this.#downedPlayers.has(id),
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
      if (!joined.reconnected && this.#stageStartedAtTick !== null) {
        this.#protectedPlayers.set(joined.player.id, this.#serverTick + HIT_PROTECTION_TICKS);
      }
      this.#ensureMonsterPopulation();
      this.#send(socket, {
        type: "joined",
        playerId: joined.player.id,
        reconnectToken: joined.reconnected ? message.reconnectToken! : issuedToken,
        tickRate: TICK_RATE,
        snapshotRate: SNAPSHOT_RATE,
      });
      if (this.#stageNumber !== 4) {
        const quiz = this.#quizzes.get(joined.player.id) ?? this.#createQuiz(joined.player.id);
        this.#sendQuestion(socket, quiz);
        if (quiz.lastFeedback) this.#send(socket, quiz.lastFeedback);
      }
      this.#send(socket, this.#stageMessage());
      if (this.#stageNumber >= 3) {
        this.#send(socket, this.#gateStateMessage());
        this.#offerGateQuestion(joined.player.id, socket);
      }
      if (this.#stageNumber === 4) this.#send(socket, this.#bossStateMessage());
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

    // 쓰러진 학생은 친구가 구출하거나 자동 복구될 때까지 행동할 수 없습니다.
    if (this.#downedPlayers.has(connection.playerId)) return;

    if (message.type === "gate-answer") {
      const question = this.#gateQuestions.get(connection.playerId);
      if (this.#stageNumber < 3 || !this.#gateOpened ||
        this.#gateStateMessage().status === "cleared" || !question ||
        question.id !== message.questionId || !question.choices.includes(message.choice)) {
        this.#sendError(socket, "INVALID_MESSAGE", "현재 관문 문제의 선택지만 제출할 수 있습니다.");
        return;
      }
      const correct = message.choice === question.correctAnswer;
      this.#send(socket, {
        type: "gate-feedback", questionId: question.id, correct,
        ...(!correct ? { hint: question.hint } : {}),
      });
      if (!correct) return;

      this.#gateQuestions.delete(connection.playerId);
      this.#gateContributors.add(connection.playerId);
      this.#gateSolvedCount += 1;
      this.#teamSolvedCount += 1;
      this.#stageScore += CORRECT_ANSWER_SCORE;
      if (this.#gateStateMessage().status !== "cleared") {
        this.#offerGateQuestions();
      }
      this.#broadcastGateState();
      await this.#maybeClearStage();
      await this.#persistCheckpoint();
      return;
    }

    if (message.type === "answer") {
      if (this.#stageNumber === 4) {
        this.#sendError(socket, "INVALID_MESSAGE", "보스전에서는 팀 관문 문제를 풀어 주세요.");
        return;
      }
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
        this.#startStage();
        quiz.solvedCount += 1;
        this.#teamSolvedCount += 1;
        this.#stageScore += CORRECT_ANSWER_SCORE;
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
      if (correct) {
        await this.#maybeClearStage();
        await this.#persistCheckpoint();
      }
      return;
    }

    if (message.type === "next-question") {
      if (this.#stageNumber === 4) return;
      const quiz = this.#quizzes.get(connection.playerId);
      if (!quiz?.completed) {
        this.#sendError(socket, "INVALID_MESSAGE", "현재 문제를 먼저 완료해 주세요.");
        return;
      }
      this.#sendQuestion(socket, this.#createQuiz(connection.playerId, quiz.solvedCount, quiz.boostedUntilTick));
      return;
    }

    this.#startStage();

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
      } else if (message.kind === "pop") {
        const result = popTrappedBubble(this.#monsters, this.#bubbles, player.x, player.y);
        this.#monsters = result.monsters;
        this.#bubbles = result.bubbles;
        if (result.captured) {
          this.#capturedCount += 1;
          this.#stageScore += MONSTER_CAPTURE_SCORE;
        }
      } else {
        const targetId = nearestFriendToRescue(
          connection.playerId,
          player,
          this.#roster.players().map((friend) => ({
            id: friend.id,
            x: this.#playerStates.get(friend.id)?.x ?? 0,
            y: this.#playerStates.get(friend.id)?.y ?? 0,
            downed: this.#downedPlayers.has(friend.id),
            connected: friend.connected,
          })),
        );
        if (targetId) {
          this.#downedPlayers.delete(targetId);
          this.#protectedPlayers.set(targetId, this.#serverTick + HIT_PROTECTION_TICKS);
          this.#rescueCount += 1;
          this.#broadcastRescueState();
        }
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

        if (this.#downedPlayers.has(player.id)) continue;

        this.#playerStates.set(player.id, stepPlayer(state, input, 1 / TICK_RATE));
        this.#inputs.set(player.id, { ...input, jump: false });
      }

      const combat = stepCombat(this.#monsters, this.#bubbles, this.#serverTick);
      this.#monsters = combat.monsters;
      this.#bubbles = combat.bubbles;
      if (this.#stageNumber === 4 && this.#bossHealth > 0) {
        const hit = hitBoss(this.#bossHealth, this.#bubbles, this.#gateStateMessage().status !== "cleared");
        this.#bossHealth = hit.health;
        this.#bubbles = hit.bubbles;
        this.#stageScore += hit.hits * MONSTER_CAPTURE_SCORE;
        if (hit.health === 0) await this.#maybeClearStage();
      }
      if (this.#stageNumber >= 3 && this.#gateOpened && this.#gateStateMessage().status === "active") {
        this.#offerGateQuestions();
      }

      // 몬스터와의 접촉도 서버 좌표로만 판정합니다. 부활 직후에는 보호 시간을 둡니다.
      if (this.#stageStartedAtTick !== null) {
        for (const player of this.#roster.players()) {
          if (!player.connected || this.#downedPlayers.has(player.id) ||
            (this.#protectedPlayers.get(player.id) ?? 0) > this.#serverTick) continue;
          const state = this.#playerStates.get(player.id);
          if (!state || !touchedMonster(state, this.#monsters)) continue;
          this.#downedPlayers.set(player.id, { downedAtTick: this.#serverTick });
          this.#inputs.set(player.id, { sequence: this.#inputs.get(player.id)?.sequence ?? 0, axis: 0, jump: false });
        }
        const connected = this.#roster.players().filter((player) => player.connected);
        const allDown = connected.length > 0 && connected.every((player) => this.#downedPlayers.has(player.id));
        for (const player of connected) {
          const downed = this.#downedPlayers.get(player.id);
          if (downed && readyToRecover(downed.downedAtTick, this.#serverTick)) {
            this.#downedPlayers.delete(player.id);
            this.#protectedPlayers.set(player.id, this.#serverTick + HIT_PROTECTION_TICKS);
          }
        }
        if (!allDown) this.#stageSurvivalTicks += 1;
      }
    }

    if (this.#serverTick % SNAPSHOT_EVERY_TICKS === 0) {
      this.#broadcastSnapshot();
    }
    if (this.#serverTick % TICK_RATE === 0) await this.#maybeClearStage();
    if (this.#stageClearedAtTick !== null &&
      this.#serverTick - this.#stageClearedAtTick >= TICK_RATE * 3) {
      await this.#advanceStage();
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
      this.#send(socket, this.#rescueStateMessage());
      this.#send(socket, this.#stageMessage());
      if (this.#stageNumber >= 3) this.#send(socket, this.#gateStateMessage());
      if (this.#stageNumber === 4) this.#send(socket, this.#bossStateMessage());
    }
  }

  #rescueStateMessage(): Extract<ServerMessage, { type: "rescue-state" }> {
    return {
      type: "rescue-state",
      players: this.#roster.players().map((player) => ({
        id: player.id,
        downed: this.#downedPlayers.has(player.id),
      })),
      rescueCount: this.#rescueCount,
    };
  }

  #broadcastRescueState(): void {
    const state = this.#rescueStateMessage();
    for (const [socket, connection] of this.#connections) {
      if (connection.playerId) this.#send(socket, state);
    }
  }

  #ensureMonsterPopulation(): void {
    if (this.#stageClearedAtTick !== null) return;
    const target = this.#stageNumber === 4 ? 0
      : stageMonsterLimit(this.#connectedPlayerCount(), this.#stageNumber, this.#setNumber);
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

  #startStage(): void {
    // 첫 유효한 행동 또는 정답 순간을 시작점으로 고정합니다.
    if (this.#stageStartedAtTick !== null) return;
    this.#fixedMapTier ??= selectMapTier(this.#connectedPlayerCount());
    this.#stageStartedAtTick = this.#serverTick;
    this.#stagePlayerCount = this.#connectedPlayerCount();
    for (const player of this.#roster.players()) {
      this.#protectedPlayers.set(player.id, this.#serverTick + HIT_PROTECTION_TICKS);
    }
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
      this.#gateQuestions.delete(playerId);
      this.#gateContributors.delete(playerId);
      this.#downedPlayers.delete(playerId);
      this.#protectedPlayers.delete(playerId);
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
      stageNumber: this.#stageNumber,
      stageScore: this.#stageScore,
      teamSolvedCount: this.#teamSolvedCount,
      downedPlayers: [...this.#downedPlayers].map(([id, state]) => ({ id, ...state })),
      protectedPlayers: [...this.#protectedPlayers].map(([id, untilTick]) => ({ id, untilTick })),
      rescueCount: this.#rescueCount,
      stageSurvivalTicks: this.#stageSurvivalTicks,
      gateOpened: this.#gateOpened,
      gateSolvedCount: this.#gateSolvedCount,
      bossHealth: this.#bossHealth,
      bossMaxHealth: this.#bossMaxHealth,
      setNumber: this.#setNumber,
      bossRuns: this.#bossRuns,
      updatedAt: Date.now(),
    };
    await this.ctx.storage.put("checkpoint", checkpoint);
  }

  #createQuiz(playerId: string, solvedCount = 0, boostedUntilTick = 0): PersonalQuiz {
    // 개인 정답과 시도 내역은 Durable Object 저장소에 쓰지 않습니다.
    const quiz: PersonalQuiz = {
      question: createMathQuestion(this.#nextQuestionIndex++, crypto.randomUUID(), this.#quizSeed,
        this.#settings.multiplicationTables, this.#settings.divisionEnabled, this.#settings.grade),
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

  #gateStateMessage(): Extract<ServerMessage, { type: "gate-state" }> {
    const originalGoal = gateFragmentGoal(this.#stagePlayerCount ?? this.#connectedPlayerCount());
    const required = Math.min(originalGoal, gateFragmentGoal(this.#connectedPlayerCount()));
    return {
      type: "gate-state",
      status: !this.#gateOpened ? "locked" : this.#gateSolvedCount >= required ? "cleared" : "active",
      solved: this.#gateSolvedCount,
      required,
    };
  }

  /** 문제와 정답은 학생별 연결에만 보내고 팀에는 조각 수만 공유합니다. */
  #offerGateQuestion(playerId: string, socket: WebSocket): void {
    if (this.#stageNumber < 3 || this.#gateStateMessage().status !== "active" ||
      this.#gateContributors.has(playerId)) return;
    let question = this.#gateQuestions.get(playerId);
    if (!question) {
      question = createMathQuestion(this.#nextQuestionIndex++, crypto.randomUUID(), this.#quizSeed,
        this.#settings.multiplicationTables, this.#settings.divisionEnabled, this.#settings.grade);
      this.#gateQuestions.set(playerId, question);
    }
    this.#send(socket, {
      type: "gate-question",
      questionId: question.id,
      prompt: question.prompt,
      choices: question.choices,
    });
  }

  #offerGateQuestions(): void {
    if (this.#gateStateMessage().status !== "active") return;
    const connected = this.#roster.players().filter((player) => player.connected);
    if (connected.length > 0 && connected.every((player) => this.#gateContributors.has(player.id))) {
      this.#gateContributors.clear();
    }
    for (const [socket, connection] of this.#connections) {
      if (connection.playerId && !this.#gateQuestions.has(connection.playerId)) {
        this.#offerGateQuestion(connection.playerId, socket);
      }
    }
  }

  #broadcastGateState(): void {
    const state = this.#gateStateMessage();
    for (const [socket, connection] of this.#connections) {
      if (connection.playerId) this.#send(socket, state);
    }
  }

  #stageMessage(): Extract<ServerMessage, { type: "stage" }> {
    const goals = stageOneGoals(this.#stagePlayerCount ?? this.#connectedPlayerCount());
    const baseGoal = this.#stageNumber === 4 ? null : this.#settings[`stage${this.#stageNumber}`];
    const configured = baseGoal === null
      ? { targetSeconds: 240, targetScore: this.#bossMaxHealth * MONSTER_CAPTURE_SCORE, clearMode: "both" as const }
      : { ...baseGoal, targetScore: scoreGoalForSet(baseGoal.targetScore, this.#setNumber) };
    return {
      type: "stage",
      setNumber: this.#setNumber,
      stage: this.#stageNumber,
      status: this.#stageClearedAtTick !== null
        ? "cleared" : this.#stageStartedAtTick !== null ? "active" : "waiting",
      capturedCount: this.#capturedCount,
      captureGoal: goals.captureGoal,
      solvedCount: this.#teamSolvedCount,
      questionGoal: goals.questionGoal,
      elapsedSeconds: this.#stageNumber === 4 ? this.#bossStateMessage().elapsedSeconds
        : stageElapsedSeconds(0, this.#stageSurvivalTicks),
      targetSeconds: configured.targetSeconds,
      score: this.#stageNumber === 4
        ? (this.#bossMaxHealth - this.#bossHealth) * MONSTER_CAPTURE_SCORE : this.#stageScore,
      targetScore: configured.targetScore,
      clearMode: configured.clearMode,
    };
  }

  #bossStateMessage(): Extract<ServerMessage, { type: "boss-state" }> {
    return {
      type: "boss-state",
      setNumber: this.#setNumber,
      status: this.#stageClearedAtTick !== null ? "cleared" : "active",
      health: this.#bossHealth,
      maxHealth: this.#bossMaxHealth,
      shielded: this.#gateStateMessage().status !== "cleared",
      elapsedSeconds: this.#stageStartedAtTick === null ? 0 : stageElapsedSeconds(
        this.#stageStartedAtTick,
        this.#stageClearedAtTick ?? this.#serverTick,
      ),
      playerCount: this.#stagePlayerCount ?? this.#connectedPlayerCount(),
    };
  }

  async #maybeClearStage(): Promise<void> {
    if (this.#stageStartedAtTick === null || this.#stageClearedAtTick !== null) return;
    if (this.#stageNumber === 4) {
      if (this.#bossHealth > 0) return;
      this.#stageClearedAtTick = this.#serverTick;
      this.#bossRuns.push({
        setNumber: this.#setNumber,
        playerCount: this.#stagePlayerCount ?? this.#connectedPlayerCount(),
        elapsedSeconds: this.#bossStateMessage().elapsedSeconds,
      });
      this.#bossRuns = this.#bossRuns.slice(-24);
      await this.#persistCheckpoint();
      for (const [socket, connection] of this.#connections) {
        if (!connection.playerId) continue;
        this.#send(socket, this.#stageMessage());
        this.#send(socket, this.#bossStateMessage());
      }
      return;
    }
    const baseGoal = this.#settings[`stage${this.#stageNumber}`];
    const configured = { ...baseGoal, targetScore: scoreGoalForSet(baseGoal.targetScore, this.#setNumber) };
    const elapsed = stageElapsedSeconds(0, this.#stageSurvivalTicks);
    if (this.#stageNumber === 3) {
      if (!this.#gateOpened && shouldOpenTeamGate(configured, elapsed, this.#stageScore)) {
        this.#gateOpened = true;
        this.#offerGateQuestions();
        this.#broadcastGateState();
      }
      if (this.#gateStateMessage().status !== "cleared") return;
    }
    if (!stageGoalReached(configured, elapsed, this.#stageScore)) return;
    this.#stageClearedAtTick = this.#serverTick;
    await this.#persistCheckpoint();
    for (const [socket, connection] of this.#connections) {
      if (connection.playerId) this.#send(socket, this.#stageMessage());
    }
  }

  /** 전원에게 같은 새 문제와 몬스터 무리를 보내되 방 연결은 유지합니다. */
  async #advanceStage(): Promise<void> {
    if (this.#stageNumber === 4) {
      if (this.#setNumber >= 100) return;
      this.#setNumber += 1;
      this.#stageNumber = 1;
      this.#fixedMapTier = selectMapTier(this.#connectedPlayerCount());
      this.#stageStartedAtTick = null;
      this.#bossHealth = 0;
      this.#bossMaxHealth = 0;
    } else {
      this.#stageNumber = (this.#stageNumber + 1) as 2 | 3 | 4;
      this.#stageStartedAtTick = this.#serverTick;
    }
    this.#stageClearedAtTick = null;
    this.#stagePlayerCount = this.#connectedPlayerCount();
    this.#stageScore = 0;
    this.#gateOpened = this.#stageNumber === 4;
    this.#gateSolvedCount = 0;
    this.#gateContributors.clear();
    this.#gateQuestions.clear();
    this.#stageSurvivalTicks = 0;
    this.#downedPlayers.clear();
    for (const player of this.#roster.players()) {
      this.#protectedPlayers.set(player.id, this.#serverTick + HIT_PROTECTION_TICKS);
    }
    this.#teamSolvedCount = 0;
    this.#capturedCount = 0;
    this.#monsters = [];
    this.#bubbles = [];
    this.#nextMonsterIndex = 0;
    this.#ensureMonsterPopulation();
    if (this.#stageNumber === 4) {
      this.#bossMaxHealth = bossHealthForPlayers(this.#stagePlayerCount, this.#setNumber);
      this.#bossHealth = this.#bossMaxHealth;
    } else {
      for (const player of this.#roster.players()) {
        const previous = this.#quizzes.get(player.id);
        this.#createQuiz(player.id, previous?.solvedCount ?? 0);
      }
    }
    for (const [socket, connection] of this.#connections) {
      if (!connection.playerId) continue;
      const quiz = this.#stageNumber === 4 ? null : this.#quizzes.get(connection.playerId);
      if (quiz) this.#sendQuestion(socket, quiz);
      this.#send(socket, this.#stageMessage());
      if (this.#stageNumber >= 3) this.#send(socket, this.#gateStateMessage());
      if (this.#stageNumber === 4) this.#send(socket, this.#bossStateMessage());
    }
    if (this.#stageNumber === 4) this.#offerGateQuestions();
    await this.#persistCheckpoint();
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
