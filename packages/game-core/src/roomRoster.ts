import { RECONNECT_GRACE_MS, ROOM_CAPACITY } from "./playerSimulation";

export type RosterPlayer = {
  id: string;
  nickname: string;
  reconnectToken: string;
  connected: boolean;
  disconnectedAt: number | null;
};

export type JoinRequest = {
  nickname: string;
  reconnectToken?: string;
};

export type JoinResult =
  | { ok: true; player: RosterPlayer; reconnected: boolean }
  | { ok: false; code: "ROOM_FULL" };

export type RoomRosterFactories = {
  createPlayerId: () => string;
  createReconnectToken: () => string;
};

function clonePlayer(player: RosterPlayer): RosterPlayer {
  return { ...player };
}

/** 방 정원과 60초 재접속 슬롯만 관리하는 네트워크 독립 규칙입니다. */
export class RoomRoster {
  readonly #players = new Map<string, RosterPlayer>();

  constructor(private readonly factories: RoomRosterFactories) {}

  join(request: JoinRequest, nowMs: number): JoinResult {
    if (request.reconnectToken) {
      const existing = [...this.#players.values()].find(
        (player) =>
          player.reconnectToken === request.reconnectToken &&
          !player.connected &&
          player.disconnectedAt !== null &&
          nowMs - player.disconnectedAt <= RECONNECT_GRACE_MS,
      );

      if (existing) {
        existing.connected = true;
        existing.disconnectedAt = null;
        existing.nickname = request.nickname;
        return { ok: true, player: clonePlayer(existing), reconnected: true };
      }
    }

    if (this.#players.size >= ROOM_CAPACITY) {
      return { ok: false, code: "ROOM_FULL" };
    }

    const player: RosterPlayer = {
      id: this.factories.createPlayerId(),
      nickname: request.nickname,
      reconnectToken: this.factories.createReconnectToken(),
      connected: true,
      disconnectedAt: null,
    };
    this.#players.set(player.id, player);

    return { ok: true, player: clonePlayer(player), reconnected: false };
  }

  disconnect(playerId: string, nowMs: number): boolean {
    const player = this.#players.get(playerId);
    if (!player) return false;

    player.connected = false;
    player.disconnectedAt = nowMs;
    return true;
  }

  pruneExpired(nowMs: number): number {
    let removed = 0;
    for (const [playerId, player] of this.#players) {
      if (
        !player.connected &&
        player.disconnectedAt !== null &&
        nowMs - player.disconnectedAt > RECONNECT_GRACE_MS
      ) {
        this.#players.delete(playerId);
        removed += 1;
      }
    }
    return removed;
  }

  players(): RosterPlayer[] {
    return [...this.#players.values()].map(clonePlayer);
  }
}
