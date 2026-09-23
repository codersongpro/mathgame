import {
  ClientMessageSchema,
  ServerMessageSchema,
  type ClientMessage,
  type ServerMessage,
} from "@bubble-semble/shared";

export type ConnectionState = "connecting" | "online" | "reconnecting" | "expired" | "offline";

type MessageListener = (message: ServerMessage) => void;
type StateListener = (state: ConnectionState) => void;

export type GameSocketOptions = {
  url: string;
  room: string;
  nickname: string;
  WebSocketImpl?: typeof WebSocket;
  storage?: Storage;
  schedule?: (callback: () => void, delay: number) => number;
  cancelSchedule?: (handle: number) => void;
  scheduleExpiry?: (callback: () => void, delay: number) => number;
  cancelExpiry?: (handle: number) => void;
};

const RECONNECT_DELAYS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const;

/**
 * 게임방 WebSocket의 연결·검증·재접속을 한곳에서 관리합니다.
 * 서버 메시지는 공용 스키마를 통과한 경우에만 화면으로 전달합니다.
 */
export class GameSocket {
  readonly #options: GameSocketOptions;
  readonly #WebSocketImpl: typeof WebSocket;
  readonly #storage: Storage | undefined;
  readonly #schedule: (callback: () => void, delay: number) => number;
  readonly #cancelSchedule: (handle: number) => void;
  readonly #scheduleExpiry: (callback: () => void, delay: number) => number;
  readonly #cancelExpiry: (handle: number) => void;
  readonly #messageListeners = new Set<MessageListener>();
  readonly #stateListeners = new Set<StateListener>();

  #socket: WebSocket | null = null;
  #retryHandle: number | null = null;
  #expiryHandle: number | null = null;
  #retryAttempt = 0;
  #expired = false;
  #explicitlyDisconnected = false;
  #state: ConnectionState = "offline";

  constructor(options: GameSocketOptions) {
    this.#options = options;
    this.#WebSocketImpl = options.WebSocketImpl ?? WebSocket;
    this.#storage = options.storage ?? this.#getSessionStorage();
    this.#schedule =
      options.schedule ??
      ((callback, delay) => globalThis.setTimeout(callback, delay) as unknown as number);
    this.#cancelSchedule =
      options.cancelSchedule ??
      ((handle) => globalThis.clearTimeout(handle as unknown as ReturnType<typeof setTimeout>));
    this.#scheduleExpiry = options.scheduleExpiry ?? this.#schedule;
    this.#cancelExpiry = options.cancelExpiry ?? this.#cancelSchedule;
  }

  get state() {
    return this.#state;
  }

  connect() {
    if (this.#expired) return;
    if (this.#socket && this.#socket.readyState !== this.#WebSocketImpl.CLOSED) return;

    this.#explicitlyDisconnected = false;
    this.#setState(this.#retryAttempt === 0 ? "connecting" : "reconnecting");
    const socket = new this.#WebSocketImpl(this.#options.url);
    this.#socket = socket;

    socket.onopen = () => {
      if (socket !== this.#socket || this.#explicitlyDisconnected) return;

      const reconnectToken = this.#storage?.getItem(this.#storageKey()) ?? undefined;
      const joinMessage: ClientMessage = {
        type: "join",
        nickname: this.#options.nickname,
        ...(reconnectToken ? { reconnectToken } : {}),
      };
      socket.send(JSON.stringify(joinMessage));
    };

    socket.onmessage = (event) => {
      if (socket !== this.#socket || typeof event.data !== "string") return;

      try {
        const result = ServerMessageSchema.safeParse(JSON.parse(event.data));
        if (!result.success) return;

        if (result.data.type === "joined") {
          this.#clearExpiryTimer();
          this.#expired = false;
          this.#storage?.setItem(this.#storageKey(), result.data.reconnectToken);
          this.#retryAttempt = 0;
          this.#setState("online");
        }

        for (const listener of this.#messageListeners) listener(result.data);
      } catch {
        // 잘못된 JSON은 게임 상태에 반영하지 않고 안전하게 무시합니다.
      }
    };

    socket.onclose = () => {
      if (socket !== this.#socket) return;
      this.#socket = null;
      if (!this.#explicitlyDisconnected) this.#scheduleReconnect();
    };

    socket.onerror = () => {
      // 종료 이벤트에서 한 번만 재접속을 예약하도록 여기서는 상태를 바꾸지 않습니다.
    };
  }

  disconnect() {
    this.#explicitlyDisconnected = true;
    if (this.#retryHandle !== null) {
      this.#cancelSchedule(this.#retryHandle);
      this.#retryHandle = null;
    }
    this.#clearExpiryTimer();
    this.#socket?.close();
    this.#socket = null;
    this.#retryAttempt = 0;
    this.#expired = false;
    this.#setState("offline");
  }

  sendInput(message: Extract<ClientMessage, { type: "input" }>) {
    const parsed = ClientMessageSchema.safeParse(message);
    if (!parsed.success || this.#socket?.readyState !== this.#WebSocketImpl.OPEN) return false;

    this.#socket.send(JSON.stringify(parsed.data));
    return true;
  }

  subscribe(listener: MessageListener) {
    this.#messageListeners.add(listener);
    return () => this.#messageListeners.delete(listener);
  }

  subscribeState(listener: StateListener) {
    this.#stateListeners.add(listener);
    listener(this.#state);
    return () => this.#stateListeners.delete(listener);
  }

  #scheduleReconnect() {
    if (this.#expiryHandle === null) {
      let expiryHandle = 0;
      expiryHandle = this.#scheduleExpiry(() => {
        if (this.#expiryHandle === expiryHandle) this.#expireReconnectWindow();
      }, 60_000);
      this.#expiryHandle = expiryHandle;
    }
    this.#setState("reconnecting");
    const delay =
      RECONNECT_DELAYS[Math.min(this.#retryAttempt, RECONNECT_DELAYS.length - 1)] ?? 30_000;
    this.#retryAttempt += 1;
    this.#retryHandle = this.#schedule(() => {
      this.#retryHandle = null;
      if (!this.#explicitlyDisconnected) this.connect();
    }, delay);
  }

  #expireReconnectWindow() {
    this.#expiryHandle = null;
    this.#expired = true;
    if (this.#retryHandle !== null) {
      this.#cancelSchedule(this.#retryHandle);
      this.#retryHandle = null;
    }
    const socket = this.#socket;
    this.#socket = null;
    socket?.close();
    this.#setState("expired");
  }

  #clearExpiryTimer() {
    if (this.#expiryHandle === null) return;
    this.#cancelExpiry(this.#expiryHandle);
    this.#expiryHandle = null;
  }

  #setState(state: ConnectionState) {
    if (this.#state === state) return;
    this.#state = state;
    for (const listener of this.#stateListeners) listener(state);
  }

  #storageKey() {
    return `bubble-semble:${this.#options.room}:reconnect-token`;
  }

  #getSessionStorage() {
    try {
      return typeof window === "undefined" ? undefined : window.sessionStorage;
    } catch {
      return undefined;
    }
  }
}
