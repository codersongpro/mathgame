import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

describe("교사 방 실제 Worker·Durable Object 연결", () => {
  it("교사만 방을 만들고 학생은 발급된 번호로 입장하며 모니터는 토큰으로 보호한다", async () => {
    const runtimeEnv = { ...env, TEACHER_CREATE_KEY: "local-test-teacher-key-at-least-32" };
    const create = await worker.fetch(new Request("https://worker.test/teacher/rooms", {
      method: "POST",
      headers: { Authorization: "Bearer local-test-teacher-key-at-least-32" },
    }), runtimeEnv);
    expect(create.status).toBe(201);
    const { roomCode, teacherToken } = await create.json() as {
      roomCode: string;
      teacherToken: string;
    };
    expect(roomCode).toMatch(/^[0-9]{6}$/);

    const unprotected = await worker.fetch(new Request(`https://worker.test/teacher/rooms/${roomCode}`), runtimeEnv);
    expect(unprotected.status).toBe(401);

    const upgrade = await worker.fetch(new Request(`https://worker.test/room/${roomCode}`, {
      headers: { Upgrade: "websocket" },
    }), runtimeEnv);
    expect(upgrade.status).toBe(101);
    const socket = upgrade.webSocket;
    if (!socket) throw new Error("학생 WebSocket이 없습니다.");
    socket.accept();
    try {
      const joined = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("학생 입장 응답이 없습니다.")), 2_000);
        socket.addEventListener("message", (event) => {
          if (JSON.parse(String(event.data)).type !== "joined") return;
          clearTimeout(timer);
          resolve();
        });
      });
      socket.send(JSON.stringify({ type: "join", nickname: "별빛토끼" }));
      await joined;

      const monitor = await worker.fetch(new Request(`https://worker.test/teacher/rooms/${roomCode}`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      }), runtimeEnv);
      expect(monitor.status).toBe(200);
      expect(await monitor.json()).toMatchObject({
        players: [{ nickname: "별빛토끼", connected: true }],
      });
    } finally {
      socket.close(1000, "test complete");
    }
  });
});
