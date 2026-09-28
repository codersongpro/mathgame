import { RoomCodeSchema } from "@bubble-semble/shared";
import { noStoreJson, workerUrl } from "../../../../../teacher/workerUrl";

/** 방별 쿠키를 서버에서만 읽어 학생에게 교사 모니터 토큰을 노출하지 않습니다. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomCode: string }> },
): Promise<Response> {
  const { roomCode } = await params;
  if (!RoomCodeSchema.safeParse(roomCode).success) {
    return noStoreJson({ message: "유효하지 않은 방 코드입니다." }, 400);
  }
  const name = `bs_teacher_${roomCode}=`;
  const token = request.headers.get("Cookie")?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(name))?.slice(name.length);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return noStoreJson({ message: "교사 권한이 없습니다. 방을 다시 열어 주세요." }, 401);
  }
  const url = workerUrl(`/teacher/rooms/${roomCode}`);
  if (!url) return noStoreJson({ message: "실시간 서버 주소가 설정되지 않았습니다." }, 503);

  try {
    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!upstream.ok) {
      return noStoreJson({ message: upstream.status === 410
        ? "방 사용 시간이 끝났습니다. 새 방을 열어 주세요."
        : upstream.status === 401 || upstream.status === 404
          ? "교사 권한이 없거나 방이 없습니다."
          : "방 현황을 불러오지 못했습니다." },
      [401, 404, 410].includes(upstream.status) ? upstream.status : 502);
    }
    const status = await upstream.json() as object;
    return noStoreJson(status, 200);
  } catch {
    return noStoreJson({ message: "실시간 서버에 연결하지 못했습니다." }, 502);
  }
}
