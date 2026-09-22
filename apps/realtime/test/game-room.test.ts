import { env } from "cloudflare:workers";
import { ServerMessageSchema, type ServerMessage } from "@bubble-semble/shared";
import { describe, expect, it } from "vitest";
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
});
