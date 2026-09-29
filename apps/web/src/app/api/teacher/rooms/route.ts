import { RoomCodeSchema, RoomStageSettingsSchema } from "@bubble-semble/shared";
import { noStoreJson, workerUrl } from "../../../../teacher/workerUrl";

/** 교사 접속키는 이 요청 동안만 사용하고 브라우저 저장소나 응답에는 되돌려주지 않습니다. */
export async function POST(request: Request): Promise<Response> {
  const url = workerUrl("/teacher/rooms");
  if (!url) return noStoreJson({ message: "실시간 서버 주소가 설정되지 않았습니다." }, 503);

  const body = await request.json().catch(() => null) as { accessKey?: unknown; settings?: unknown } | null;
  const accessKey = body?.accessKey;
  if (typeof accessKey !== "string" || accessKey.length < 1 || accessKey.length > 256) {
    return noStoreJson({ message: "교사 접속키를 입력해 주세요." }, 400);
  }

  const settings = RoomStageSettingsSchema.safeParse(body?.settings ?? {});
  if (!settings.success) return noStoreJson({ message: "스테이지 목표값을 확인해 주세요." }, 400);

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ settings: settings.data }),
      cache: "no-store",
    });
    if (!upstream.ok) {
      // Worker의 원문 메시지나 접속키를 전달하지 않고, 확인할 설정만 안내합니다.
      const error = await upstream.json().catch(() => null) as { code?: unknown } | null;
      if (upstream.status === 401) {
        return noStoreJson({ message: "교사 접속키가 올바르지 않습니다." }, 401);
      }
      if (upstream.status === 503 && error?.code === "CONFIG_MISSING") {
        return noStoreJson({ message: "Cloudflare Worker에 TEACHER_CREATE_KEY Secret을 설정해 주세요." }, 503);
      }
      if (upstream.status === 404) {
        return noStoreJson({ message: "실시간 서버에 교사 방 기능이 없습니다. Worker 배포 버전을 확인해 주세요." }, 502);
      }
      return noStoreJson({ message: "방을 열지 못했습니다. 잠시 후 다시 시도해 주세요." }, 502);
    }

    const created = await upstream.json() as {
      roomCode?: unknown;
      teacherToken?: unknown;
      expiresAt?: unknown;
    };
    if (!RoomCodeSchema.safeParse(created.roomCode).success ||
      typeof created.teacherToken !== "string" ||
      !/^[a-f0-9]{64}$/.test(created.teacherToken) ||
      typeof created.expiresAt !== "number" ||
      !Number.isFinite(created.expiresAt)) {
      return noStoreJson({ message: "방 발급 응답을 확인할 수 없습니다." }, 502);
    }

    const roomCode = created.roomCode as string;
    const maxAge = Math.max(0, Math.floor((created.expiresAt - Date.now()) / 1_000));
    const response = noStoreJson({ roomCode, expiresAt: created.expiresAt }, 201);
    response.headers.append("Set-Cookie",
      `bs_teacher_${roomCode}=${created.teacherToken}; HttpOnly; Secure; SameSite=Strict; Path=/api/teacher/rooms/${roomCode}; Max-Age=${maxAge}`);
    return response;
  } catch {
    return noStoreJson({ message: "실시간 서버에 연결하지 못했습니다." }, 502);
  }
}
