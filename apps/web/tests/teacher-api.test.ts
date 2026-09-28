import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/teacher/rooms/route";
import { GET } from "../src/app/api/teacher/rooms/[roomCode]/route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("교사 전용 API", () => {
  it("접속키가 없는 방 생성 요청을 거절한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "wss://realtime.example");
    const response = await POST(new Request("https://web.example/api/teacher/rooms", {
      method: "POST",
      body: JSON.stringify({ accessKey: "" }),
    }));
    expect(response.status).toBe(400);
  });

  it("범위를 벗어난 목표값은 Worker에 전달하지 않는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "wss://realtime.example");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(new Request("https://web.example/api/teacher/rooms", {
      method: "POST",
      body: JSON.stringify({ accessKey: "teacher-secret", settings: { stage1: { targetSeconds: 0 } } }),
    }));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("방 발급 토큰을 HttpOnly 쿠키에만 담고 JSON·URL에는 노출하지 않는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "wss://realtime.example");
    const token = "a".repeat(64);
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      roomCode: "012345",
      teacherToken: token,
      expiresAt: Date.now() + 4 * 60 * 60 * 1_000,
    }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("https://web.example/api/teacher/rooms", {
      method: "POST",
      body: JSON.stringify({ accessKey: "teacher-secret" }),
    }));
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body).toMatchObject({ roomCode: "012345" });
    expect(JSON.stringify(body)).not.toContain(token);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://realtime.example/teacher/rooms");
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).settings).toMatchObject({
      stage1: { targetSeconds: 120, targetScore: 100, clearMode: "both" },
      stage2: { targetSeconds: 150, targetScore: 150, clearMode: "both" },
    });
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly; Secure; SameSite=Strict");
    expect(response.headers.get("Set-Cookie")).toContain("Path=/api/teacher/rooms/012345");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("학생의 방 코드만으로는 모니터 현황을 볼 수 없다", async () => {
    vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "wss://realtime.example");
    const response = await GET(new Request("https://web.example/api/teacher/rooms/012345"), {
      params: Promise.resolve({ roomCode: "012345" }),
    });
    expect(response.status).toBe(401);
  });

  it("방별 교사 쿠키가 있을 때만 현황을 가져온다", async () => {
    vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "wss://realtime.example");
    const token = "a".repeat(64);
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      capturedCount: 2,
      players: [{ id: "one", nickname: "별빛토끼", connected: true }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("https://web.example/api/teacher/rooms/012345", {
      headers: { Cookie: `bs_teacher_012345=${token}` },
    }), { params: Promise.resolve({ roomCode: "012345" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ capturedCount: 2 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://realtime.example/teacher/rooms/012345");
    expect(fetchMock.mock.calls[0]?.[1].headers.Authorization).toBe(`Bearer ${token}`);
  });
});
