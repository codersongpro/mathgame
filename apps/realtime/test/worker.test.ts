import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";

function createFakeEnv(createCollisions = 0) {
  const requestedNames: string[] = [];
  const forwardedUrls: string[] = [];
  let createAttempts = 0;
  const env = {
    TEACHER_CREATE_KEY: "teacher-test-secret-at-least-32-chars",
    GAME_ROOM: {
      idFromName(name: string) {
        requestedNames.push(name);
        return { name };
      },
      get() {
        return {
          async fetch(request: Request) {
            forwardedUrls.push(request.url);
            if (new URL(request.url).pathname === "/internal/create") {
              createAttempts += 1;
              if (createAttempts <= createCollisions) {
                return Response.json({ code: "ROOM_EXISTS" }, { status: 409 });
              }
              return Response.json({ expiresAt: Date.now() + 4 * 60 * 60 * 1_000 }, { status: 201 });
            }
            return new Response("forwarded");
          },
        };
      },
    },
  } as unknown as Env;

  return { env, requestedNames, forwardedUrls };
}

describe("실시간 Worker 라우팅", () => {
  it("교사 접속키가 없거나 틀리면 방을 발급하지 않는다", async () => {
    const fake = createFakeEnv();
    const request = new Request("https://realtime.example/teacher/rooms", { method: "POST" });
    expect((await worker.fetch(request, { GAME_ROOM: fake.env.GAME_ROOM })).status).toBe(503);
    expect((await worker.fetch(request, { ...fake.env, TEACHER_CREATE_KEY: "weak" })).status).toBe(503);
    expect((await worker.fetch(request, fake.env)).status).toBe(401);
    expect(fake.requestedNames).toEqual([]);
  });

  it("교사 접속키를 확인한 뒤 6자리 방과 별도 모니터 토큰을 발급한다", async () => {
    const fake = createFakeEnv();
    const response = await worker.fetch(new Request("https://realtime.example/teacher/rooms", {
      method: "POST",
      headers: { Authorization: "Bearer teacher-test-secret-at-least-32-chars" },
    }), fake.env);
    const created = (await response.json()) as { roomCode: string; teacherToken: string };

    expect(response.status).toBe(201);
    expect(created.roomCode).toMatch(/^[0-9]{6}$/);
    expect(created.teacherToken).toMatch(/^[a-f0-9]{64}$/);
    expect(fake.requestedNames).toEqual([created.roomCode]);
    expect(fake.forwardedUrls).toEqual(["https://room.internal/internal/create"]);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("이미 사용 중인 숫자가 나오면 새 방 번호를 다시 시도한다", async () => {
    const fake = createFakeEnv(1);
    const response = await worker.fetch(new Request("https://realtime.example/teacher/rooms", {
      method: "POST",
      headers: { Authorization: "Bearer teacher-test-secret-at-least-32-chars" },
    }), fake.env);
    expect(response.status).toBe(201);
    expect(fake.requestedNames).toHaveLength(2);
  });

  it("유효한 WebSocket 경로를 방 코드 Durable Object로 전달한다", async () => {
    const fake = createFakeEnv();
    const request = new Request("https://realtime.example/room/012345", {
      headers: { Upgrade: "websocket" },
    });

    const response = await worker.fetch(request, fake.env);

    expect(await response.text()).toBe("forwarded");
    expect(fake.requestedNames).toEqual(["012345"]);
    expect(fake.forwardedUrls).toEqual([request.url]);
  });

  it("앞의 0이 붙은 방 코드를 그대로 사용한다", async () => {
    const fake = createFakeEnv();
    await worker.fetch(
      new Request("https://realtime.example/room/000001", {
        headers: { Upgrade: "websocket" },
      }),
      fake.env,
    );

    expect(fake.requestedNames).toEqual(["000001"]);
  });

  it.each(["12345", "1234567", "12A456", "12-456"])("잘못된 방 코드 %s를 거절한다", async (roomCode) => {
    const fake = createFakeEnv();
    const response = await worker.fetch(
      new Request(`https://realtime.example/room/${roomCode}`, {
        headers: { Upgrade: "websocket" },
      }),
      fake.env,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_ROOM" });
    expect(fake.requestedNames).toEqual([]);
  });

  it("일반 HTTP 요청에는 WebSocket 업그레이드 필요 상태를 반환한다", async () => {
    const fake = createFakeEnv();
    const response = await worker.fetch(
      new Request("https://realtime.example/room/012345"),
      fake.env,
    );

    expect(response.status).toBe(426);
  });
});
