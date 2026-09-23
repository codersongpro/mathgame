import { env } from "cloudflare:workers";
import { ServerMessageSchema, type ServerMessage } from "@bubble-semble/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InputRateLimiter } from "../src/rateLimit";

function waitForMessage(
  socket: WebSocket,
  predicate: (message: ServerMessage) => boolean,
): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error("WebSocket 응답 시간이 초과됐습니다."));
    }, 2_000);

    function onMessage(event: MessageEvent) {
      const parsed = ServerMessageSchema.safeParse(JSON.parse(String(event.data)));
      if (!parsed.success || !predicate(parsed.data)) return;
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      resolve(parsed.data);
    }

    socket.addEventListener("message", onMessage);
  });
}

async function openSocket(roomName: string): Promise<WebSocket> {
  const id = env.GAME_ROOM.idFromName(roomName);
  const response = await env.GAME_ROOM.get(id).fetch("https://room.internal", {
    headers: { Upgrade: "websocket" },
  });
  if (!response.webSocket) throw new Error("WebSocket 업그레이드에 실패했습니다.");
  response.webSocket.accept();
  return response.webSocket;
}

async function joinSocket(roomName: string, nickname: string, reconnectToken?: string) {
  const socket = await openSocket(roomName);
  const joinedMessage = waitForMessage(socket, (message) => message.type === "joined");
  socket.send(
    JSON.stringify({
      type: "join",
      nickname,
      ...(reconnectToken ? { reconnectToken } : {}),
    }),
  );
  const joined = await joinedMessage;
  if (joined.type !== "joined") throw new Error("입장 응답이 아닙니다.");
  return { socket, joined };
}

afterEach(() => vi.restoreAllMocks());

describe("GameRoom", () => {
  it("열 명을 입장시키고 열한 번째를 거절하며 위조 좌표를 반영하지 않는다", async () => {
    const roomName = `room-${crypto.randomUUID()}`;
    const sockets: WebSocket[] = [];
    const playerIds = new Set<string>();

    try {
      for (let index = 1; index <= 10; index += 1) {
        const socket = await openSocket(roomName);
        sockets.push(socket);
        const joinedMessage = waitForMessage(socket, (message) => message.type === "joined");
        socket.send(JSON.stringify({ type: "join", nickname: `학생${index}` }));
        const joined = await joinedMessage;
        if (joined.type !== "joined") throw new Error("입장 응답이 아닙니다.");
        playerIds.add(joined.playerId);
      }

      expect(playerIds.size).toBe(10);

      const eleventh = await openSocket(roomName);
      sockets.push(eleventh);
      const fullMessage = waitForMessage(
        eleventh,
        (message) => message.type === "error" && message.code === "ROOM_FULL",
      );
      eleventh.send(JSON.stringify({ type: "join", nickname: "학생11" }));
      await expect(fullMessage).resolves.toMatchObject({ type: "error", code: "ROOM_FULL" });

      const firstSocket = sockets[0];
      if (!firstSocket) throw new Error("첫 번째 소켓이 없습니다.");
      const beforeMessage = await waitForMessage(firstSocket, (message) => message.type === "snapshot");
      if (beforeMessage.type !== "snapshot") throw new Error("스냅샷이 아닙니다.");
      const firstPlayerId = [...playerIds][0];
      const beforeX = beforeMessage.players.find((player) => player.id === firstPlayerId)?.x;

      const invalidMessage = waitForMessage(
        firstSocket,
        (message) => message.type === "error" && message.code === "INVALID_MESSAGE",
      );
      firstSocket.send(
        JSON.stringify({ type: "input", sequence: 1, axis: 1, jump: false, x: 9999 }),
      );
      await expect(invalidMessage).resolves.toMatchObject({
        type: "error",
        code: "INVALID_MESSAGE",
      });

      const afterMessage = await waitForMessage(firstSocket, (message) => message.type === "snapshot");
      if (afterMessage.type !== "snapshot") throw new Error("스냅샷이 아닙니다.");
      expect(afterMessage.players.find((player) => player.id === firstPlayerId)?.x).toBe(beforeX);
    } finally {
      for (const socket of sockets) socket.close(1000, "test complete");
    }
  });

  it("1초에 입력 30개만 허용하고 초과 시 5초 동안 차단한다", () => {
    const limiter = new InputRateLimiter();
    for (let index = 0; index < 30; index += 1) {
      expect(limiter.allow(index * 10)).toBe(true);
    }
    expect(limiter.allow(300)).toBe(false);
    expect(limiter.allow(5_299)).toBe(false);
    expect(limiter.allow(5_300)).toBe(true);
  });

  it("59초 안에는 같은 ID와 마지막 위치로 재접속한다", async () => {
    const roomName = `reconnect-${crypto.randomUUID()}`;
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const first = await joinSocket(roomName, "별빛토끼");
    const movingSnapshot = waitForMessage(
      first.socket,
      (message) =>
        message.type === "snapshot" &&
        (message.players.find((player) => player.id === first.joined.playerId)?.x ?? 0) > 80,
    );
    first.socket.send(JSON.stringify({ type: "input", sequence: 1, axis: 1, jump: false }));
    const before = await movingSnapshot;
    if (before.type !== "snapshot") throw new Error("이동 스냅샷이 아닙니다.");
    const beforeX = before.players.find((player) => player.id === first.joined.playerId)?.x;
    first.socket.close(1000, "temporary disconnect");
    await new Promise((resolve) => setTimeout(resolve, 30));

    now.mockReturnValue(1_059_000);
    const restored = await joinSocket(roomName, "별빛토끼", first.joined.reconnectToken);
    const restoredSnapshot = await waitForMessage(
      restored.socket,
      (message) => message.type === "snapshot",
    );

    expect(restored.joined.playerId).toBe(first.joined.playerId);
    const restoredX =
      restoredSnapshot.type === "snapshot"
        ? restoredSnapshot.players.find((player) => player.id === first.joined.playerId)?.x
        : null;
    expect(restoredX).toBeGreaterThanOrEqual(beforeX ?? 0);
    expect(restoredX).not.toBe(80);
    restored.socket.close(1000, "test complete");
  });

  it("61초가 지난 토큰은 새 ID를 발급한다", async () => {
    const roomName = `expired-${crypto.randomUUID()}`;
    const now = vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const first = await joinSocket(roomName, "달빛여우");
    first.socket.close(1000, "expired disconnect");
    await new Promise((resolve) => setTimeout(resolve, 30));

    now.mockReturnValue(2_061_000);
    const replacement = await joinSocket(roomName, "달빛여우", first.joined.reconnectToken);

    expect(replacement.joined.playerId).not.toBe(first.joined.playerId);
    replacement.socket.close(1000, "test complete");
  });

  it.each([
    [2, "small"],
    [3, "medium"],
    [6, "large"],
    [9, "xlarge"],
  ] as const)("%i명으로 시작하면 %s 맵을 고정한다", async (playerCount, expectedTier) => {
    const roomName = `map-${playerCount}-${crypto.randomUUID()}`;
    const joined = [];
    try {
      for (let index = 1; index <= playerCount; index += 1) {
        joined.push(await joinSocket(roomName, `학생${index}`));
      }

      const observer = joined[0]?.socket;
      if (!observer) throw new Error("관찰 소켓이 없습니다.");
      observer.send(JSON.stringify({ type: "input", sequence: 1, axis: 1, jump: false }));
      const started = await waitForMessage(
        observer,
        (message) => message.type === "snapshot" && message.mapTier === expectedTier,
      );
      expect(started).toMatchObject({ type: "snapshot", mapTier: expectedTier });

      joined.at(-1)?.socket.close(1000, "leave after start");
      const afterLeave = await waitForMessage(observer, (message) => message.type === "snapshot");
      expect(afterLeave).toMatchObject({ type: "snapshot", mapTier: expectedTier });
    } finally {
      for (const player of joined) player.socket.close(1000, "test complete");
    }
  });

  it("만료된 슬롯을 제거해도 시작한 맵 크기는 바뀌지 않는다", async () => {
    const roomName = `fixed-map-${crypto.randomUUID()}`;
    const now = vi.spyOn(Date, "now").mockReturnValue(3_000_000);
    const first = await joinSocket(roomName, "학생1");
    const second = await joinSocket(roomName, "학생2");
    const third = await joinSocket(roomName, "학생3");

    first.socket.send(JSON.stringify({ type: "input", sequence: 1, axis: 0, jump: false }));
    await waitForMessage(
      first.socket,
      (message) => message.type === "snapshot" && message.mapTier === "medium",
    );
    second.socket.close(1000, "leave");
    third.socket.close(1000, "leave");
    await new Promise((resolve) => setTimeout(resolve, 30));

    now.mockReturnValue(3_061_000);
    const replacement = await joinSocket(roomName, "학생4");
    const snapshot = await waitForMessage(
      first.socket,
      (message) => message.type === "snapshot" && message.players.some((player) => player.id === replacement.joined.playerId),
    );
    if (snapshot.type !== "snapshot") throw new Error("스냅샷이 아닙니다.");

    expect(snapshot.mapTier).toBe("medium");
    expect(snapshot.players.map((player) => player.id)).not.toContain(second.joined.playerId);
    expect(snapshot.players.map((player) => player.id)).not.toContain(third.joined.playerId);
    first.socket.close(1000, "test complete");
    replacement.socket.close(1000, "test complete");
  });
});
