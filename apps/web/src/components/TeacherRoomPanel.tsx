"use client";

import { RoomCodeSchema } from "@bubble-semble/shared";
import { type FormEvent, useEffect, useState } from "react";

type RoomStatus = {
  expiresAt: number;
  capturedCount: number;
  players: Array<{ id: string; nickname: string; connected: boolean; solvedCount: number }>;
};

export function TeacherRoomPanel() {
  const [accessKey, setAccessKey] = useState("");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [status, setStatus] = useState<RoomStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // 주소에는 학생에게 알려줘도 되는 방 번호만 남깁니다. 교사 토큰은 HttpOnly 쿠키에 있습니다.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (RoomCodeSchema.safeParse(room).success) setRoomCode(room);
  }, []);

  useEffect(() => {
    if (!roomCode) return;
    let active = true;
    async function refresh() {
      try {
        const response = await fetch(`/api/teacher/rooms/${roomCode}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message ?? "방 현황을 불러오지 못했습니다.");
        if (active) {
          setStatus(result as RoomStatus);
          setError("");
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "연결을 확인해 주세요.");
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [roomCode]);

  async function openRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/teacher/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessKey }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "방을 열지 못했습니다.");
      setAccessKey("");
      setStatus(null);
      setRoomCode(result.roomCode);
      window.history.replaceState(null, "", `/teacher?room=${result.roomCode}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "방을 열지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const connected = status?.players.filter((player) => player.connected).length ?? 0;

  return (
    <main className="teacher-shell">
      <section className="teacher-card" aria-labelledby="teacher-title">
        <p className="eyebrow">교사 전용</p>
        <h1 id="teacher-title">방 열기</h1>
        <p>접속키로 수업방을 열고, 발급된 숫자 6자리를 학생에게 알려주세요.</p>

        <form className="teacher-form" onSubmit={(event) => void openRoom(event)}>
          <label htmlFor="teacher-key">교사 접속키</label>
          <input
            id="teacher-key"
            type="password"
            autoComplete="off"
            value={accessKey}
            onChange={(event) => setAccessKey(event.target.value)}
            maxLength={256}
            required
          />
          <button type="submit" disabled={busy}>{busy ? "방 여는 중…" : "새 방 열기"}</button>
        </form>

        {error && <p className="teacher-error" role="alert">{error}</p>}

        {roomCode && (
          <section className="teacher-monitor" aria-label="수업방 현황">
            <p className="teacher-room-label">학생 입장 코드</p>
            <p className="teacher-room-code" aria-label={`방 코드 ${roomCode}`}>{roomCode}</p>
            <p>학생은 첫 화면에 이 번호와 별명을 입력합니다.</p>
            <div className="teacher-stats" aria-live="polite">
              <p><strong>{connected}/10</strong><span>접속 학생</span></p>
              <p><strong>{status?.capturedCount ?? 0}</strong><span>팀 포획</span></p>
            </div>
            <h2>참여 현황</h2>
            {status?.players.length ? (
              <ul className="teacher-roster">
                {status.players.map((player) => (
                  <li key={player.id}>
                    <span>{player.nickname}</span>
                    <span>정답 {player.solvedCount}개 · {player.connected ? "접속 중" : "재접속 대기"}</span>
                  </li>
                ))}
              </ul>
            ) : <p>아직 입장한 학생이 없습니다.</p>}
            <p className="field-hint">현황은 약 2초마다 갱신됩니다. 개인 문제와 오답 내용은 교사 화면에 표시하지 않습니다.</p>
          </section>
        )}
        <a className="teacher-home-link" href="/">학생 입장 화면으로</a>
      </section>
    </main>
  );
}
