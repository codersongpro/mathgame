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
});
