import { describe, expect, it, vi } from "vitest";
import { GameSocket, type GameSocketOptions } from "../src/realtime/GameSocket";

class FakeStorage implements Storage {
  readonly #items = new Map<string, string>();
  get length() {
    return this.#items.size;
  }
  clear() {
    this.#items.clear();
  }
  getItem(key: string) {
    return this.#items.get(key) ?? null;
  }
  key(index: number) {
    return [...this.#items.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.#items.delete(key);
  }
  setItem(key: string, value: string) {
    this.#items.set(key, value);
  }
}

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readyState = 0;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  receive(message: unknown) {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(message) }));
  }

  send(message: string) {
    this.sent.push(message);
  }

  close() {
    this.readyState = 3;
  }

  serverClose() {
    this.readyState = 3;
    this.onclose?.(new CloseEvent("close"));
  }
}

function createOptions(overrides: Partial<GameSocketOptions> = {}): GameSocketOptions {
  return {
    url: "ws://127.0.0.1:8787",
    room: "B7K9Q2",
    nickname: "별빛토끼",
    WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    storage: new FakeStorage(),
    ...overrides,
  };
}

describe("GameSocket", () => {
  it("연결 직후 join을 첫 메시지로 보낸다", () => {
    FakeWebSocket.instances = [];
    const socket = new GameSocket(createOptions());

    socket.connect();
    FakeWebSocket.instances[0]?.open();

    expect(FakeWebSocket.instances[0]?.sent).toEqual([
      JSON.stringify({ type: "join", nickname: "별빛토끼" }),
    ]);
  });

  it("스키마를 통과한 서버 메시지만 구독자에게 전달한다", () => {
    FakeWebSocket.instances = [];
    const socket = new GameSocket(createOptions());
    const listener = vi.fn();
    socket.subscribe(listener);
    socket.connect();
    const webSocket = FakeWebSocket.instances[0];
    webSocket?.open();

    webSocket?.receive({ type: "snapshot", serverTick: "wrong" });
    webSocket?.receive({
      type: "joined",
      playerId: "player-1",
      reconnectToken: "token-1",
      tickRate: 20,
      snapshotRate: 10,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "joined" }));
  });

  it("1·2·4·8초로 재접속하고 30초를 넘기지 않는다", () => {
    FakeWebSocket.instances = [];
    const scheduled: Array<{ callback: () => void; delay: number }> = [];
    const socket = new GameSocket(
      createOptions({
        schedule: (callback, delay) => {
          scheduled.push({ callback, delay });
          return scheduled.length;
        },
        cancelSchedule: vi.fn(),
      }),
    );

    socket.connect();
    for (let attempt = 0; attempt < 7; attempt += 1) {
      FakeWebSocket.instances.at(-1)?.serverClose();
      scheduled.at(-1)?.callback();
    }

    expect(scheduled.filter(({ delay }) => delay < 60_000).map(({ delay }) => delay)).toEqual([
      1_000,
      2_000,
      4_000,
      8_000,
      16_000,
      30_000,
      30_000,
    ]);
  });

  it("disconnect가 예약된 재접속을 취소한다", () => {
    FakeWebSocket.instances = [];
    const scheduled: Array<{ callback: () => void; delay: number }> = [];
    const cancelSchedule = vi.fn();
    const socket = new GameSocket(
      createOptions({
        schedule: (callback, delay) => {
          scheduled.push({ callback, delay });
          return 77;
        },
        cancelSchedule,
      }),
    );

    socket.connect();
    FakeWebSocket.instances[0]?.serverClose();
    socket.disconnect();
    scheduled[0]?.callback();

    expect(cancelSchedule).toHaveBeenCalledWith(77);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(socket.state).toBe("offline");
  });

  it("연결 복구가 60초를 넘으면 자동 재시도를 멈춘다", () => {
    FakeWebSocket.instances = [];
    const reconnects: Array<{ callback: () => void; delay: number }> = [];
    const expirations: Array<{ callback: () => void; delay: number }> = [];
    const socket = new GameSocket(
      createOptions({
        schedule: (callback, delay) => {
          reconnects.push({ callback, delay });
          return reconnects.length;
        },
        scheduleExpiry: (callback, delay) => {
          expirations.push({ callback, delay });
          return 99;
        },
      }),
    );

    socket.connect();
    FakeWebSocket.instances[0]?.serverClose();
    expect(expirations[0]?.delay).toBe(60_000);

    expirations[0]?.callback();
    reconnects[0]?.callback();

    expect(socket.state).toBe("expired");
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
