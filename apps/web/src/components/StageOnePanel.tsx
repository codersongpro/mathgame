import type { ServerMessage } from "@bubble-semble/shared";

type Stage = Extract<ServerMessage, { type: "stage" }>;

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** 서버가 계산한 공동 목표만 표시하며 학생별 문제 정보는 읽지 않습니다. */
export function StageOnePanel({ stage }: { stage: Stage | null }) {
  if (!stage) return null;

  return (
    <div className="stage-progress" aria-live="polite">
      <strong>일반 스테이지 1</strong>
      <span>거품 포획 {stage.capturedCount}/{stage.captureGoal}</span>
      <span>팀 정답 {stage.solvedCount}/{stage.questionGoal}</span>
      <span>{stage.status === "waiting" ? "이동 또는 거품 버튼으로 시작" : `시간 ${clock(stage.elapsedSeconds)} / 목표 ${clock(stage.targetSeconds)}`}</span>
    </div>
  );
}

export function StageClearOverlay({ stage }: { stage: Stage | null }) {
  if (stage?.status !== "cleared") return null;
  return (
    <section className="stage-clear" role="status" aria-label="첫 스테이지 클리어">
      <div className="stage-clear-card">
        <p className="eyebrow">TEAM CLEAR!</p>
        <h2>첫 스테이지 클리어!</h2>
        <p>함께 거품 {stage.capturedCount}개를 포획하고 문제 {stage.solvedCount}개를 맞혔습니다.</p>
        <p>협동 시간 {clock(stage.elapsedSeconds)} · 목표 시간 {clock(stage.targetSeconds)}</p>
        <p>다음 스테이지는 후속 페이즈에서 열립니다.</p>
      </div>
    </section>
  );
}
