"use client";

import { RoomCodeSchema, type RoomStageSettings, type ServerMessage } from "@bubble-semble/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

type RoomStatus = {
  expiresAt: number;
  capturedCount: number;
  rescueCount: number;
  downedCount: number;
  settings: RoomStageSettings;
  stage: Extract<ServerMessage, { type: "stage" }>;
  gate: Extract<ServerMessage, { type: "gate-state" }> | null;
  boss: Extract<ServerMessage, { type: "boss-state" }> | null;
  bossRuns: Array<{ setNumber: number; playerCount: number; elapsedSeconds: number }>;
  players: Array<{ id: string; nickname: string; connected: boolean; solvedCount: number; downed: boolean }>;
};

export function TeacherRoomPanel() {
  const router = useRouter();
  const [accessKey, setAccessKey] = useState("");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [status, setStatus] = useState<RoomStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedTables, setSelectedTables] = useState<number[]>([]);
  const [divisionEnabled, setDivisionEnabled] = useState(false);

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
    const playtest = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("data-intent") === "playtest";
    const form = new FormData(event.currentTarget);
    const optionalNumber = (name: string) => {
      const value = String(form.get(name) ?? "").trim();
      return value === "" ? undefined : Number(value);
    };
    const settings = {
      stage1: {
        targetSeconds: optionalNumber("stage1Seconds"),
        targetScore: optionalNumber("stage1Score"),
        clearMode: form.get("stage1Mode"),
      },
      stage2: {
        targetSeconds: optionalNumber("stage2Seconds"),
        targetScore: optionalNumber("stage2Score"),
        clearMode: form.get("stage2Mode"),
      },
      stage3: {
        targetSeconds: optionalNumber("stage3Seconds"),
        targetScore: optionalNumber("stage3Score"),
        clearMode: form.get("stage3Mode"),
      },
      multiplicationTables: form.getAll("multiplicationTables").map(Number),
      divisionEnabled: form.has("divisionEnabled"),
      grade: Number(form.get("grade")),
    };
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/teacher/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessKey, settings }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "방을 열지 못했습니다.");
      if (!RoomCodeSchema.safeParse(result.roomCode).success) throw new Error("발급된 방 코드를 확인할 수 없습니다.");
      setAccessKey("");
      if (playtest) {
        // 공개 방 번호만 URL에 넣고, 교사 접속키와 모니터 토큰은 넣지 않습니다.
        const query = new URLSearchParams({ room: result.roomCode, nickname: "교사테스트", mode: "test" });
        router.push(`/play?${query.toString()}`);
        return;
      }
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
  const gradeMaximum = [0, 20, 100, 1_000, 10_000][status?.settings?.grade ?? 1] ?? 20;
  const gradeSummary = status?.settings?.grade === 1 ? "20 이내 덧셈·뺄셈·수 비교"
    : status?.settings?.grade === 5 ? "평균·직사각형 넓이"
    : status?.settings?.grade === 6 ? "백분율·직육면체 부피"
      : `${gradeMaximum.toLocaleString("ko-KR")} 이내 덧셈·뺄셈`;
  const bossRuns = status?.bossRuns ?? [];
  const bestByPlayerCount = new Map<number, number>();
  for (const run of bossRuns) {
    bestByPlayerCount.set(run.playerCount,
      Math.min(bestByPlayerCount.get(run.playerCount) ?? Infinity, run.elapsedSeconds));
  }

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
          <fieldset className="teacher-tables">
            <legend>학년별 기본 문항</legend>
            <label htmlFor="teacher-grade">학년 선택</label>
            <select id="teacher-grade" name="grade" defaultValue="1">
              <option value="1">1학년 · 20 이내 덧셈·뺄셈·수 비교</option>
              <option value="2">2학년 · 100 이내 덧셈·뺄셈</option>
              <option value="3">3학년 · 1,000 이내 덧셈·뺄셈</option>
              <option value="4">4학년 · 10,000 이내 덧셈·뺄셈</option>
              <option value="5">5학년 · 평균·직사각형 넓이</option>
              <option value="6">6학년 · 백분율·직육면체 부피</option>
            </select>
            <p className="field-hint">현재 학년별 기본 문항군을 제공하며 다른 개념은 후속 단계에서 추가합니다. 구구단을 고르면 선택한 단이 학년 기본 문항보다 우선합니다.</p>
          </fieldset>
          <fieldset className="teacher-tables">
            <legend>구구단 선택 · 여러 단을 고를 수 있습니다</legend>
            <p className="field-hint">선택하면 해당 단의 곱셈을 출제합니다. 나눗셈도 선택할 수 있습니다. 선택하지 않으면 학년별 기본 문항으로 진행합니다.</p>
            <div className="teacher-tables-grid">
              {Array.from({ length: 19 }, (_, index) => index + 1).map((table) => (
                <label key={table}>
                  <input type="checkbox" name="multiplicationTables" value={table}
                    checked={selectedTables.includes(table)}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...selectedTables, table].sort((a, b) => a - b)
                        : selectedTables.filter((chosen) => chosen !== table);
                      setSelectedTables(next);
                      if (next.length === 0) setDivisionEnabled(false);
                    }} />
                  {table}단
                </label>
              ))}
            </div>
            <label className="teacher-division">
              <input type="checkbox" name="divisionEnabled" checked={divisionEnabled}
                disabled={selectedTables.length === 0}
                onChange={(event) => setDivisionEnabled(event.target.checked)} />
              나눗셈도 출제 · 선택한 단으로 정확히 나누어지는 문제
            </label>
          </fieldset>
          {([1, 2, 3] as const).map((stageNumber) => (
            <fieldset className="teacher-goals" key={stageNumber}>
              <legend>일반 스테이지 {stageNumber} 목표</legend>
              <label htmlFor={`stage${stageNumber}-seconds`}>버티는 시간(초)</label>
              <input id={`stage${stageNumber}-seconds`} name={`stage${stageNumber}Seconds`}
                type="number" min={10} max={600} step={1} inputMode="numeric"
                placeholder={`기본 ${stageNumber === 1 ? 120 : stageNumber === 2 ? 150 : 90}초`} />
              <label htmlFor={`stage${stageNumber}-score`}>목표 점수</label>
              <input id={`stage${stageNumber}-score`} name={`stage${stageNumber}Score`}
                type="number" min={10} max={2000} step={1} inputMode="numeric"
                placeholder={`기본 ${stageNumber === 1 ? 100 : stageNumber === 2 ? 150 : 180}점`} />
              <label htmlFor={`stage${stageNumber}-mode`}>다음 스테이지 조건</label>
              <select id={`stage${stageNumber}-mode`} name={`stage${stageNumber}Mode`} defaultValue="both">
                <option value="both">시간과 점수 모두 달성</option>
                <option value="either">시간 또는 점수 하나 달성</option>
              </select>
            </fieldset>
          ))}
          <p className="field-hint">입력하지 않은 목표는 기본값을 사용합니다. 정답 10점, 몬스터 포획 20점입니다.</p>
          <button type="submit" disabled={busy}>{busy ? "방 여는 중…" : "새 방 열기"}</button>
          <button type="submit" data-intent="playtest" disabled={busy}>
            {busy ? "테스트 준비 중…" : "시험 플레이 시작"}
          </button>
        </form>

        {error && <p className="teacher-error" role="alert">{error}</p>}

        {roomCode && (
          <section className="teacher-monitor" aria-label="수업방 현황">
            <p className="teacher-room-label">학생 입장 코드</p>
            <p className="teacher-room-code" aria-label={`방 코드 ${roomCode}`}>{roomCode}</p>
            <p>학생은 첫 화면에 이 번호와 별명을 입력합니다.</p>
            {status?.settings && (
              <p className="field-hint">
                문제 · {status.settings.grade ?? 1}학년 · {status.settings.multiplicationTables?.length
                  ? status.settings.multiplicationTables.map((table) => `${table}단`).join("·")
                  : gradeSummary}
                {status.settings.divisionEnabled ? "·나눗셈" : ""}
                {" · "}
                설정 · 1단계 {status.settings.stage1.targetSeconds}초/{status.settings.stage1.targetScore}점
                ({status.settings.stage1.clearMode === "both" ? "모두" : "하나"})
                {" · "}2단계 {status.settings.stage2.targetSeconds}초/{status.settings.stage2.targetScore}점
                ({status.settings.stage2.clearMode === "both" ? "모두" : "하나"})
                {status.settings.stage3 && <>
                  {" · "}3단계 {status.settings.stage3.targetSeconds}초/{status.settings.stage3.targetScore}점
                  ({status.settings.stage3.clearMode === "both" ? "모두" : "하나"})
                </>}
              </p>
            )}
            <div className="teacher-stats" aria-live="polite">
              <p><strong>{connected}/10</strong><span>접속 학생</span></p>
              <p><strong>{status?.capturedCount ?? 0}</strong><span>팀 포획</span></p>
              <p><strong>{status?.rescueCount ?? 0}</strong><span>친구 구출</span></p>
              <p><strong>{status?.downedCount ?? 0}</strong><span>현재 쓰러짐</span></p>
            </div>
            {status?.stage && status.stage.stage !== 4 && (
              <p className="teacher-stage" aria-live="polite">
                세트 {status.stage.setNumber} · 스테이지 {status.stage.stage} {status.stage.status === "cleared" ? "클리어" : status.stage.status === "active" ? "진행 중" : "시작 대기"}
                {" · "}포획 {status.stage.capturedCount}개
                {" · "}팀 정답 {status.stage.solvedCount}개
                {" · "}시간 {status.stage.elapsedSeconds}/{status.stage.targetSeconds}초
                {" · "}점수 {status.stage.score}/{status.stage.targetScore}점
                {" · "}{status.stage.clearMode === "both" ? "두 조건 모두" : "한 조건 달성"}
              </p>
            )}
            {status?.boss && (
              <p className="teacher-stage" aria-live="polite">
                세트 {status.boss.setNumber} · 혼돈의 큐브왕 {status.boss.status === "cleared" ? "클리어" : "진행 중"}
                {" · "}체력 {status.boss.health}/{status.boss.maxHealth}
                {" · "}팀 시간 {status.boss.elapsedSeconds}초
                {" · "}{status.boss.playerCount}명
              </p>
            )}
            {status?.gate && (
              <p className="teacher-stage" aria-live="polite">
                {status?.boss ? "보스 방어막" : "팀 수학 관문"} {status.gate.solved}/{status.gate.required}조각 ·
                {status.gate.status === "locked" ? " 대기" : status.gate.status === "active" ? " 진행 중" : " 완료"}
              </p>
            )}
            <h2>협동 보스 기록</h2>
            <p className="field-hint">같은 참가 인원의 기록끼리 최고 시간을 표시합니다. 최근 24회까지 보관합니다.</p>
            {bossRuns.length ? (
              <ol className="teacher-roster" aria-label="협동 보스 기록">
                {[...bossRuns].reverse().map((run, index) => (
                  <li key={`${run.setNumber}-${run.playerCount}-${index}`}>
                    <span>{run.setNumber}세트 · {run.playerCount}명 · {run.elapsedSeconds}초</span>
                    {run.elapsedSeconds === bestByPlayerCount.get(run.playerCount) &&
                      <span>같은 인원 최고</span>}
                  </li>
                ))}
              </ol>
            ) : <p>아직 완료한 보스전이 없습니다.</p>}
            <h2>참여 현황</h2>
            {status?.players.length ? (
              <ul className="teacher-roster">
                {status.players.map((player) => (
                  <li key={player.id}>
                    <span>{player.nickname}</span>
                    <span>정답 {player.solvedCount}개 · {player.downed ? "구출 대기" : player.connected ? "접속 중" : "재접속 대기"}</span>
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
