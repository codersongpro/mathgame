// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/app/globals.css";
import { QuizPanel } from "../src/components/QuizPanel";

afterEach(cleanup);

const question = {
  type: "question" as const,
  questionId: "de8cbdd4-0693-4e2e-96fd-9d6ca3ed3480",
  prompt: "7 + 5 = ?",
  choices: [10, 12, 13, 11],
  solvedCount: 0,
};

describe("학생별 터치 문제창", () => {
  it("키보드 없이 네 선택지로 답하고 첫 오답 뒤 힌트를 보여준다", () => {
    const onAnswer = vi.fn(() => true);
    const { rerender } = render(<QuizPanel question={question} feedback={null} online onAnswer={onAnswer} onNext={() => true} />);

    expect(screen.getByText("7 + 5 = ?")).toBeVisible();
    for (const choice of question.choices) expect(screen.getByRole("button", { name: `답 ${choice}` })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "답 10" }));
    expect(onAnswer).toHaveBeenCalledWith(question.questionId, 10);

    rerender(<QuizPanel question={question} feedback={{
      type: "quiz-feedback", questionId: question.questionId, correct: false,
      completed: false, solvedCount: 0, boosted: false, wrongChoice: 10,
      hint: "앞으로 세어 보세요.",
    }} online onAnswer={onAnswer} onNext={() => true} />);
    expect(screen.getByText(/앞으로 세어 보세요/)).toBeVisible();
    expect(screen.getByRole("button", { name: "답 10" })).toBeDisabled();
  });

  it("정답 뒤 거품 강화와 다음 문제 버튼을 표시한다", () => {
    const onNext = vi.fn(() => true);
    render(<QuizPanel question={question} feedback={{
      type: "quiz-feedback", questionId: question.questionId, correct: true,
      completed: true, solvedCount: 1, boosted: true,
    }} online onAnswer={() => true} onNext={onNext} />);

    expect(screen.getByText(/거품 발사가 빨라집니다/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "다음 문제" }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});
