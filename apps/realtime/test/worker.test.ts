import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";

function createFakeEnv() {
  const requestedNames: string[] = [];
  const forwardedUrls: string[] = [];
  const env = {
    GAME_ROOM: {
      idFromName(name: string) {
        requestedNames.push(name);
        return { name };
      },
      get() {
        return {
          async fetch(request: Request) {
            forwardedUrls.push(request.url);
            return new Response("forwarded");
          },
        };
      },
    },
  } as unknown as Env;

  return { env, requestedNames, forwardedUrls };
}

describe("실시간 Worker 라우팅", () => {
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
