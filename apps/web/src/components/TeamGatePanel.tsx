"use client";

import type { ServerMessage } from "@bubble-semble/shared";
import { useEffect, useState } from "react";

type GateState = Extract<ServerMessage, { type: "gate-state" }>;
type GateQuestion = Extract<ServerMessage, { type: "gate-question" }>;
type GateFeedback = Extract<ServerMessage, { type: "gate-feedback" }>;

/** 관문 진행도는 공유하고 문제와 힌트는 본인 화면에만 표시합니다. */
export function TeamGatePanel({
  gate,
  question,
  feedback,
  online,
  onAnswer,
  title = "팀 수학 관문",
}: {
  gate: GateState | null;
  question: GateQuestion | null;
  feedback: GateFeedback | null;
  online: boolean;
  onAnswer: (questionId: string, choice: number) => boolean;
  title?: string;
}) {
  const [pending, setPending] = useState(false);
  useEffect(() => setPending(false), [question, feedback]);
  if (!gate) return null;

  function answer(choice: number) {
    if (!question || !online || pending) return;
    setPending(true);
    if (!onAnswer(question.questionId, choice)) setPending(false);
  }

  return (
    <section className={`team-gate-panel ${gate.status === "active" ? "team-gate-active" : ""}`} aria-label={title}>
      <strong>{title} · {gate.solved}/{gate.required}조각</strong>
      {gate.status === "locked" && <p>시간이나 점수의 절반에 도달하면 열립니다.</p>}
      {gate.status === "cleared" && <p>관문을 열었습니다! 목표를 채우면 스테이지를 클리어합니다.</p>}
      {gate.status === "active" && (
        question ? <>
          <p>{question.prompt}</p>
          {feedback?.questionId === question.questionId && !feedback.correct &&
            <p role="status">다시 도전! {feedback.hint}</p>}
          <div className="team-gate-choices">
            {question.choices.map((choice) => (
              <button key={choice} type="button" disabled={!online || pending}
                onClick={() => answer(choice)} aria-label={`관문 답 ${choice}`}>
                {choice}
              </button>
            ))}
          </div>
        </> : <p>내 조각을 완성했습니다. 친구의 정답을 기다려 주세요.</p>
      )}
    </section>
  );
}
