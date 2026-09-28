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
      <strong>일반 스테이지 {stage.stage}</strong>
      <span>팀 점수 {stage.score}/{stage.targetScore}점</span>
      <span>거품 포획 {stage.capturedCount}개 · 팀 정답 {stage.solvedCount}개</span>
      <span>{stage.status === "waiting" ? "이동·거품·문제 풀이로 시작" : `버틴 시간 ${clock(stage.elapsedSeconds)} / 목표 ${clock(stage.targetSeconds)}`}</span>
      <span>{stage.clearMode === "both" ? "시간과 점수 모두 달성" : "시간 또는 점수 달성"}</span>
    </div>
  );
}

export function StageClearOverlay({ stage }: { stage: Stage | null }) {
  if (stage?.status !== "cleared") return null;
  return (
    <section className="stage-clear" role="status" aria-label={`${stage.stage}스테이지 클리어`}>
      <div className="stage-clear-card">
        <p className="eyebrow">TEAM CLEAR!</p>
        <h2>{stage.stage}스테이지 클리어!</h2>
        <p>함께 거품 {stage.capturedCount}개를 포획하고 문제 {stage.solvedCount}개를 맞혔습니다.</p>
        <p>팀 점수 {stage.score}점 · 협동 시간 {clock(stage.elapsedSeconds)}</p>
        <p>{stage.stage === 1 ? "잠시 후 2스테이지로 함께 이동합니다." : "2스테이지까지 함께 완료했습니다!"}</p>
      </div>
    </section>
  );
}
