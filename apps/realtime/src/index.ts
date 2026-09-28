import { RoomCodeSchema } from "@bubble-semble/shared";
import type { GameRoom } from "./GameRoom";

export { GameRoom } from "./GameRoom";

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  TEACHER_CREATE_KEY?: string;
}

function jsonError(code: string, message: string, status: number): Response {
  return Response.json({ code, message }, { status });
}

async function sameSecret(provided: string, expected: string): Promise<boolean> {
  const bytes = await Promise.all(
    [provided, expected].map(async (value) =>
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
    ),
  );
  const left = bytes[0]!;
  const right = bytes[1]!;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
}

function randomRoomCode(): string {
  const random = crypto.getRandomValues(new Uint32Array(1))[0]!;
  return String(random % 1_000_000).padStart(6, "0");
}

function randomTeacherToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/teacher/rooms" && request.method === "POST") {
      if (!env.TEACHER_CREATE_KEY || env.TEACHER_CREATE_KEY.length < 32) {
        return jsonError("CONFIG_MISSING", "교사 방 설정이 필요합니다.", 503);
      }
      const accessKey = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
      if (!accessKey || !(await sameSecret(accessKey, env.TEACHER_CREATE_KEY))) {
        return jsonError("UNAUTHORIZED", "교사 접속키를 확인해 주세요.", 401);
      }

      for (let attempt = 0; attempt < 20; attempt += 1) {
        const roomCode = randomRoomCode();
        const teacherToken = randomTeacherToken();
        const id = env.GAME_ROOM.idFromName(roomCode);
        const created = await env.GAME_ROOM.get(id).fetch(
          new Request("https://room.internal/internal/create", {
            method: "POST",
            headers: { "X-Teacher-Token": teacherToken },
          }),
        );
        if (created.status === 409) continue;
        if (!created.ok) return jsonError("ROOM_CREATE_FAILED", "방을 만들지 못했습니다.", 502);
        const { expiresAt } = (await created.json()) as { expiresAt: number };
        return Response.json({ roomCode, expiresAt, teacherToken }, {
          status: 201,
          headers: { "Cache-Control": "no-store" },
        });
      }
      return jsonError("ROOM_SPACE_FULL", "방 번호를 발급하지 못했습니다.", 503);
    }

    const teacherMatch = /^\/teacher\/rooms\/([^/]+)$/.exec(url.pathname);
    if (teacherMatch?.[1] && request.method === "GET") {
      const roomCode = teacherMatch[1];
      if (!RoomCodeSchema.safeParse(roomCode).success) {
        return jsonError("INVALID_ROOM", "유효하지 않은 방 코드입니다.", 400);
      }
      const id = env.GAME_ROOM.idFromName(roomCode);
      return env.GAME_ROOM.get(id).fetch(new Request("https://room.internal/internal/status", {
        headers: { Authorization: request.headers.get("Authorization") ?? "" },
      }));
    }

    const match = /^\/room\/([^/]+)$/.exec(url.pathname);
    if (!match?.[1]) {
      return jsonError("NOT_FOUND", "요청 경로를 찾을 수 없습니다.", 404);
    }

    const roomCode = match[1];
    if (!RoomCodeSchema.safeParse(roomCode).success) {
      return jsonError("INVALID_ROOM", "유효하지 않은 방 코드입니다.", 400);
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return Response.json(
        { code: "UPGRADE_REQUIRED", message: "WebSocket 업그레이드가 필요합니다." },
        { status: 426 },
      );
    }

    const id = env.GAME_ROOM.idFromName(roomCode);
    return env.GAME_ROOM.get(id).fetch(request);
  },
};
