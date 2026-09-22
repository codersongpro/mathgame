import { RoomCodeSchema } from "@bubble-semble/shared";
import type { GameRoom } from "./GameRoom";

export { GameRoom } from "./GameRoom";

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
}

function jsonError(code: "INVALID_ROOM" | "NOT_FOUND", message: string, status: number): Response {
  return Response.json({ code, message }, { status });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/room\/([^/]+)$/.exec(url.pathname);
    if (!match?.[1]) {
      return jsonError("NOT_FOUND", "요청 경로를 찾을 수 없습니다.", 404);
    }

    const roomCode = match[1].toUpperCase();
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
