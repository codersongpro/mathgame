"use client";

import type { ServerMessage } from "@bubble-semble/shared";
import { useEffect, useState } from "react";

type Question = Extract<ServerMessage, { type: "question" }>;
type Feedback = Extract<ServerMessage, { type: "quiz-feedback" }>;

export function QuizPanel({
  question,
  feedback,
  online,
  onAnswer,
  onNext,
}: {
  question: Question | null;
  feedback: Feedback | null;
  online: boolean;
  onAnswer: (questionId: string, choice: number) => boolean;
  onNext: () => boolean;
}) {
  const [pending, setPending] = useState(false);

  useEffect(() => setPending(false), [question, feedback]);

  if (!question) return null;
  const currentFeedback = feedback?.questionId === question.questionId ? feedback : null;

  function answer(choice: number) {
    if (pending || !question || !online || currentFeedback?.completed) return;
    setPending(true);
    if (!onAnswer(question.questionId, choice)) setPending(false);
  }

  function next() {
    if (pending || !online) return;
    setPending(true);
    if (!onNext()) setPending(false);
  }

  return (
    <section className="quiz-panel" aria-label="나의 수학 문제">
      <div className="quiz-topline"><strong>수학 버블</strong><span>맞힌 문제 {currentFeedback?.solvedCount ?? question.solvedCount}</span></div>
      <p className="quiz-prompt">{question.prompt}</p>
      {currentFeedback?.completed ? (
        <div className="quiz-result" role="status">
          <p>{currentFeedback.correct ? "정답! 5초 동안 거품 발사가 빨라집니다." : `이번 문제의 답은 ${currentFeedback.answer}입니다.`}</p>
          <button type="button" onClick={next} disabled={!online || pending}>다음 문제</button>
        </div>
      ) : (
        <>
          {currentFeedback?.hint && <p className="quiz-hint" role="status">다시 도전! {currentFeedback.hint}</p>}
          <div className="quiz-choices">
            {question.choices.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => answer(choice)}
                disabled={!online || pending || choice === currentFeedback?.wrongChoice}
                aria-label={`답 ${choice}`}
              >
                {choice}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
