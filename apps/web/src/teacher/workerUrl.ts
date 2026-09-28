/** 웹과 실시간 서버가 같은 환경을 바라보도록 공개 WebSocket 주소에서 HTTP 주소를 만듭니다. */
export function workerUrl(path: string): string | null {
  const configured = process.env.NEXT_PUBLIC_REALTIME_URL;
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (url.protocol !== "ws:" && url.protocol !== "wss:") return null;
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    url.pathname = path;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function noStoreJson(body: object, status: number): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
