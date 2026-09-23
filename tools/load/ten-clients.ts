type JoinedMessage = {
  type: "joined";
  playerId: string;
};

type SnapshotMessage = {
  type: "snapshot";
  players: Array<{ id: string; nickname: string; x: number }>;
};

type ErrorMessage = {
  type: "error";
  code: string;
};

type ServerMessage = JoinedMessage | SnapshotMessage | ErrorMessage | { type: string };

type LoadClient = {
  nickname: string;
  socket: WebSocket;
  playerId: string | null;
  snapshot: SnapshotMessage | null;
  lastSnapshotAt: number;
  largestGapMs: number;
  minX: number;
  maxX: number;
  errorCode: string | null;
};

const ROOM_CODE = process.env.ROOM_CODE || "B7K9Q2";
const REALTIME_BASE_URL = process.env.REALTIME_URL || "ws://127.0.0.1:8787";
const DURATION_MS = Number(process.env.LOAD_DURATION_MS || 20_000);
const ROOM_URL = `${REALTIME_BASE_URL.replace(/\/$/, "")}/room/${ROOM_CODE}`;

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitUntil(
  predicate: () => boolean,
  message: string,
  timeoutMs = 8_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(25);
  }
  throw new Error(message);
}

async function openClient(nickname: string): Promise<LoadClient> {
  const socket = new WebSocket(ROOM_URL);
  const client: LoadClient = {
    nickname,
    socket,
    playerId: null,
    snapshot: null,
    lastSnapshotAt: 0,
    largestGapMs: 0,
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    errorCode: null,
  };

  socket.addEventListener("message", (event) => {
    let message: ServerMessage;
    try {
      message = JSON.parse(String(event.data)) as ServerMessage;
    } catch {
      return;
    }

    if (message.type === "joined" && "playerId" in message) client.playerId = message.playerId;
    if (message.type === "error" && "code" in message) client.errorCode = message.code;
    if (message.type !== "snapshot" || !("players" in message)) return;

    const now = Date.now();
    if (client.lastSnapshotAt > 0) {
      client.largestGapMs = Math.max(client.largestGapMs, now - client.lastSnapshotAt);
    }
    client.lastSnapshotAt = now;
    client.snapshot = message;
    const ownPlayer = message.players.find((player) => player.id === client.playerId);
    if (ownPlayer) {
      client.minX = Math.min(client.minX, ownPlayer.x);
      client.maxX = Math.max(client.maxX, ownPlayer.x);
    }
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${nickname} 연결 시간 초과`)), 5_000);
    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      socket.send(JSON.stringify({ type: "join", nickname }));
      resolve();
    });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error(`${nickname} WebSocket 연결 실패`));
    });
  });

  return client;
}

async function main() {
  if (!Number.isFinite(DURATION_MS) || DURATION_MS < 1_000) {
    throw new Error("LOAD_DURATION_MS는 1000 이상의 숫자여야 합니다.");
  }

  const clients = await Promise.all(
    Array.from({ length: 10 }, (_, index) => openClient(`학생${String(index + 1).padStart(2, "0")}`)),
  );

  try {
    await waitUntil(
      () =>
        clients.every(
          (client) =>
            client.playerId !== null &&
            client.snapshot?.players.length === 10 &&
            new Set(client.snapshot.players.map((player) => player.id)).size === 10,
        ),
      "열 명의 고유 플레이어가 모든 스냅숏에 나타나지 않았습니다.",
    );

    const eleventh = await openClient("학생11");
    try {
      await waitUntil(() => eleventh.errorCode === "ROOM_FULL", "11번째 접속이 거절되지 않았습니다.");
      await waitUntil(
        () => clients.every((client) => client.snapshot?.players.length === 10),
        "11번째 접속 뒤 기존 방 인원이 10명으로 유지되지 않았습니다.",
      );
    } finally {
      eleventh.socket.close(1000, "capacity verified");
    }

    const startedAt = Date.now();
    let sequence = 0;
    while (Date.now() - startedAt < DURATION_MS) {
      sequence += 1;
      clients.forEach((client, index) => {
        const axis = (Math.floor((Date.now() - startedAt) / 1_000) + index) % 2 === 0 ? 1 : -1;
        client.socket.send(JSON.stringify({ type: "input", sequence, axis, jump: sequence % 16 === 0 }));
        if (Date.now() - client.lastSnapshotAt > 2_000) {
          throw new Error(`${client.nickname} 스냅숏이 2초 넘게 끊겼습니다.`);
        }
      });
      await delay(250);
    }

    await waitUntil(
      () => clients.every((client) => client.snapshot?.players.length === 10),
      "부하 테스트 뒤 방 인원이 10명이 아닙니다.",
    );
    if (!clients.some((client) => client.maxX - client.minX >= 10)) {
      throw new Error("20초 동안 확인 가능한 플레이어 이동이 없었습니다.");
    }
    const largestGap = Math.max(...clients.map((client) => client.largestGapMs));
    if (largestGap > 2_000) throw new Error(`최대 스냅숏 공백이 ${largestGap}ms입니다.`);

    console.log(
      `PASS: ${ROOM_CODE} 방에서 10명 동기화, 11번째 거절, ${DURATION_MS}ms 이동, 최대 공백 ${largestGap}ms`,
    );
  } finally {
    for (const client of clients) client.socket.close(1000, "load test complete");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
