import { DurableObject } from "cloudflare:workers";
import {
  FLOOR_Y,
  SNAPSHOT_RATE,
  TICK_RATE,
  RoomRoster,
  selectMapTier,
  stepPlayer,
  type MapTier,
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
  updatedAt: number;
};

const TICK_INTERVAL_MS = 1_000 / TICK_RATE;
const SNAPSHOT_EVERY_TICKS = TICK_RATE / SNAPSHOT_RATE;

async function digestReconnectToken(token: string): Promise<string> {
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
  #serverTick = 0;
  #fixedMapTier: MapTier | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as ConnectionAttachment | null;
      if (!attachment) continue;
      this.#connections.set(socket, { ...attachment, limiter: new InputRateLimiter() });
    }

    this.ctx.blockConcurrencyWhile(async () => {
      const checkpoint = await this.ctx.storage.get<Checkpoint>("checkpoint");
      if (!checkpoint) return;
      this.#serverTick = checkpoint.serverTick;
      this.#fixedMapTier = checkpoint.fixedMapTier;
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
      const issuedReconnectToken = await digestReconnectToken(issuedToken);
      const reconnectToken =
        message.reconnectToken === undefined
          ? undefined
          : await digestReconnectToken(message.reconnectToken);
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
      this.#send(socket, {
        type: "joined",
        playerId: joined.player.id,
        reconnectToken: joined.reconnected ? message.reconnectToken! : issuedToken,
        tickRate: TICK_RATE,
        snapshotRate: SNAPSHOT_RATE,
      });
      await this.#persistCheckpoint();
      this.#startLoop();
      return;
    }

    if (!connection.playerId) {
      this.#sendError(socket, "INVALID_MESSAGE", "입장 완료 뒤에만 이동할 수 있습니다.");
      return;
    }

    if (!connection.limiter.allow(Date.now())) {
      this.#sendError(socket, "RATE_LIMITED", "이동 입력이 너무 빠릅니다.");
      return;
    }

    if (this.#fixedMapTier === null) {
      this.#fixedMapTier = selectMapTier(this.#connectedPlayerCount());
      await this.#persistCheckpoint();
    }
    this.#inputs.set(connection.playerId, message);
  }

  async webSocketClose(
    socket: WebSocket,
    code: number,
    reason: string,
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

    socket.close(code, reason);
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.webSocketClose(socket, 1011, "socket error", false);
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
    for (const player of this.#roster.players()) {
      if (!player.connected) continue;
      const state = this.#playerStates.get(player.id);
      const input = this.#inputs.get(player.id);
      if (!state || !input) continue;

      this.#playerStates.set(player.id, stepPlayer(state, input, 1 / TICK_RATE));
      this.#inputs.set(player.id, { ...input, jump: false });
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

    for (const [socket, connection] of this.#connections) {
      if (connection.playerId) this.#send(socket, snapshot);
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
    }
  }

  async #persistCheckpoint(): Promise<void> {
    const checkpoint: Checkpoint = {
      serverTick: this.#serverTick,
      roster: this.#roster.players(),
      players: [...this.#playerStates].map(([id, state]) => ({ id, ...state })),
      fixedMapTier: this.#fixedMapTier,
      updatedAt: Date.now(),
    };
    await this.ctx.storage.put("checkpoint", checkpoint);
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
