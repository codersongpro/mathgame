"use client";

import Link from "next/link";
import { useState } from "react";

/** 친구 링크는 공개 방 번호만 담고, 교사 인증 정보는 절대 포함하지 않습니다. */
export function PlaytestToolbar({ room }: { room: string }) {
  const [shareUrl, setShareUrl] = useState("");
  const [message, setMessage] = useState("");

  async function copyInvite() {
    const url = new URL("/play", window.location.origin);
    url.searchParams.set("room", room);
    url.searchParams.set("nickname", `테스트${String(Math.floor(Math.random() * 10_000)).padStart(4, "0")}`);
    setShareUrl(url.toString());

    try {
      await navigator.clipboard.writeText(url.toString());
      setMessage("친구 입장 링크를 복사했습니다.");
    } catch {
      setMessage("자동 복사가 되지 않았습니다. 아래 주소를 길게 눌러 복사해 주세요.");
    }
  }

  return (
    <aside className="playtest-toolbar" aria-label="시험 플레이 도구">
      <strong>시험 플레이</strong>
      <button type="button" onClick={() => void copyInvite()}>친구 입장 링크 복사</button>
      <Link href={`/teacher?room=${room}`}>교사 모니터</Link>
      {message && <span role="status">{message}</span>}
      {shareUrl && <input aria-label="친구 입장 주소" value={shareUrl} readOnly onFocus={(event) => event.currentTarget.select()} />}
    </aside>
  );
}
