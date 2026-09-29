// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeamGatePanel } from "../src/components/TeamGatePanel";

afterEach(cleanup);

const gate = { type: "gate-state" as const, status: "active" as const, solved: 1, required: 2 };
const question = {
  type: "gate-question" as const,
  questionId: "123e4567-e89b-42d3-a456-426614174000",
  prompt: "8 + 3 = ?",
  choices: [10, 11, 12, 9],
};

describe("팀 수학 관문 카드", () => {
  it("터치 선택을 보낸 뒤 오답 힌트를 보여주고 다시 선택하게 한다", () => {
    const onAnswer = vi.fn().mockReturnValue(true);
    const { rerender } = render(
      <TeamGatePanel gate={gate} question={question} feedback={null} online onAnswer={onAnswer} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "관문 답 10" }));
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(question.questionId, 10);
    rerender(<TeamGatePanel gate={gate} question={question} online onAnswer={onAnswer}
      feedback={{ type: "gate-feedback", questionId: question.questionId, correct: false, hint: "앞으로 세어 보세요." }} />);
    expect(screen.getByText(/다시 도전! 앞으로 세어 보세요/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "관문 답 11" }));
    expect(onAnswer).toHaveBeenCalledTimes(2);
  });

  it("내 조각을 풀면 친구의 답을 기다리고 연결이 끊기면 선택을 잠근다", () => {
    const onAnswer = vi.fn();
    const { rerender } = render(
      <TeamGatePanel gate={gate} question={question} feedback={null} online={false} onAnswer={onAnswer} />,
    );
    expect(screen.getByRole("button", { name: "관문 답 11" })).toBeDisabled();
    rerender(<TeamGatePanel gate={gate} question={null} feedback={null} online onAnswer={onAnswer} />);
    expect(screen.getByText(/친구의 정답을 기다려 주세요/)).toBeVisible();
  });
});
