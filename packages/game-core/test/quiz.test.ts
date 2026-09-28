import { describe, expect, it } from "vitest";
import { createMathQuestion } from "../src/quiz";

describe("20 이내 계산 문제", () => {
  it("덧셈·뺄셈을 번갈아 내고 음수 없이 정답 한 개와 서로 다른 선택지 네 개를 만든다", () => {
    for (let index = 0; index < 100; index += 1) {
      const question = createMathQuestion(index, `question-${index}`);
      const [left, operation, right] = question.prompt.split(" ");
      const expected = operation === "+" ? Number(left) + Number(right) : Number(left) - Number(right);

      expect(question.correctAnswer).toBe(expected);
      expect(question.correctAnswer).toBeGreaterThanOrEqual(0);
      expect(question.correctAnswer).toBeLessThanOrEqual(20);
      expect(question.choices).toHaveLength(4);
      expect(new Set(question.choices).size).toBe(4);
      expect(question.choices.filter((choice) => choice === expected)).toHaveLength(1);
      expect(operation).toBe(index % 2 === 0 ? "+" : "−");
    }
  });

  it("새 방의 시드가 바뀌면 첫 문제 내용도 다양해지고 같은 시드는 재현된다", () => {
    const firstProblems = Array.from({ length: 100 }, (_, seed) => createMathQuestion(0, "q", seed).prompt);
    expect(new Set(firstProblems).size).toBeGreaterThan(20);
    expect(createMathQuestion(5, "q", 1234)).toEqual(createMathQuestion(5, "q", 1234));
  });

  it("한 게임에서 이어지는 초반 12문항은 같은 식을 반복하지 않는다", () => {
    for (let sample = 0; sample < 200; sample += 1) {
      const prompts = Array.from({ length: 12 }, (_, index) => createMathQuestion(index, "q", sample * 97).prompt);
      expect(new Set(prompts).size).toBe(12);
    }
  });
});
