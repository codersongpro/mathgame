import { describe, expect, it } from "vitest";
import { createMathQuestion } from "../src/quiz";

describe("20 이내 계산 문제", () => {
  it("덧셈·뺄셈을 번갈아 내고 음수 없이 정답 한 개와 서로 다른 선택지 네 개를 만든다", () => {
    for (let index = 0; index < 100; index += 1) {
      if (index % 3 === 2) continue; // 수 비교 문항은 아래에서 별도로 검증합니다.
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

  it("세 문항 중 하나는 20 이내의 가장 큰 수·작은 수를 고르게 한다", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      for (let index = 0; index < 30; index += 1) {
        const question = createMathQuestion(index, `q-${index}`, seed);
        if (index % 3 !== 2) {
          expect(question.prompt).toMatch(/^\d+ [+−] \d+ = \?$/);
          continue;
        }
        const largest = index % 2 === 0;
        const match = question.prompt.match(/^(\d+), (\d+), (\d+), (\d+) 중 가장 (큰|작은) 수는\?$/);
        expect(match).not.toBeNull();
        expect(match?.[5]).toBe(largest ? "큰" : "작은");
        expect(question.choices).toEqual(match!.slice(1, 5).map(Number));
        expect(new Set(question.choices).size).toBe(4);
        expect(question.choices.every((choice) => choice >= 0 && choice <= 20)).toBe(true);
        expect(question.correctAnswer).toBe(largest
          ? Math.max(...question.choices) : Math.min(...question.choices));
        expect(question.hint).toContain(largest ? "큰" : "작은");
        expect(createMathQuestion(index, `q-${index}`, seed)).toEqual(question);
      }
    }
    expect(createMathQuestion(2, "q", 0).prompt).not.toBe(createMathQuestion(2, "q", 1).prompt);
    expect(createMathQuestion(2, "q", 0, [7]).prompt).toMatch(/^7 × \d+ = \?$/);
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

describe("교사가 선택한 구구단 문제", () => {
  it("선택한 단만 출제하고 최대 19×19의 정답과 네 선택지를 만든다", () => {
    const tables = [2, 7, 19];
    const seen = new Set<number>();
    for (let index = 0; index < 57; index += 1) {
      const question = createMathQuestion(index, `q-${index}`, 42, tables);
      const [left, operation, right] = question.prompt.split(" ");
      seen.add(Number(left));
      expect(tables).toContain(Number(left));
      expect(operation).toBe("×");
      expect(Number(right)).toBeGreaterThanOrEqual(1);
      expect(Number(right)).toBeLessThanOrEqual(19);
      expect(question.correctAnswer).toBe(Number(left) * Number(right));
      expect(question.choices).toHaveLength(4);
      expect(new Set(question.choices).size).toBe(4);
      expect(question.choices).toContain(question.correctAnswer);
      expect(question.choices.every((choice) => choice >= 0 && choice <= 361)).toBe(true);
    }
    expect(seen).toEqual(new Set(tables));
  });

  it("같은 시드는 재현하고 다른 방 시드는 첫 문제를 바꾼다", () => {
    const first = createMathQuestion(0, "q", 21, [19]);
    expect(createMathQuestion(0, "q", 21, [19])).toEqual(first);
    expect(createMathQuestion(0, "q", 22, [19]).prompt).not.toBe(first.prompt);
    expect(createMathQuestion(18, "q", 0, [19]).correctAnswer).toBe(361);
  });

  it("나눗셈 옵션을 켜면 선택한 단의 곱셈과 나누어떨어지는 나눗셈을 번갈아 낸다", () => {
    for (let index = 0; index < 38; index += 1) {
      const question = createMathQuestion(index, `q-${index}`, 0, [7, 19], true);
      const [left, operation, right] = question.prompt.split(" ");
      expect(operation).toBe(index % 2 === 0 ? "×" : "÷");
      if (operation === "÷") {
        expect([7, 19]).toContain(Number(right));
        expect(Number(left) % Number(right)).toBe(0);
        expect(question.correctAnswer).toBe(Number(left) / Number(right));
      }
      expect(question.choices).toHaveLength(4);
      expect(new Set(question.choices).size).toBe(4);
      expect(question.choices).toContain(question.correctAnswer);
    }
  });
});

describe("2학년 기본 계산", () => {
  it("구구단을 선택하지 않으면 100 이내의 덧셈·뺄셈을 낸다", () => {
    let beyondTwenty = 0;
    for (let index = 0; index < 100; index += 1) {
      const question = createMathQuestion(index, `q-${index}`, 0, [], false, 2);
      const [left, operation, right] = question.prompt.split(" ");
      const expected = operation === "+" ? Number(left) + Number(right) : Number(left) - Number(right);
      expect(operation).toBe(index % 2 === 0 ? "+" : "−");
      expect(question.correctAnswer).toBe(expected);
      expect(question.correctAnswer).toBeGreaterThanOrEqual(0);
      expect(question.correctAnswer).toBeLessThanOrEqual(100);
      expect(question.choices).toHaveLength(4);
      expect(new Set(question.choices).size).toBe(4);
      expect(question.choices).toContain(expected);
      expect(question.choices.every((choice) => choice >= 0 && choice <= 100)).toBe(true);
      if (Math.max(Number(left), Number(right), expected) > 20) beyondTwenty += 1;
    }
    expect(beyondTwenty).toBeGreaterThan(50);
  });

  it("한 방의 초반 문제는 반복하지 않고 시드가 달라지면 내용이 바뀐다", () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const prompts = Array.from({ length: 12 }, (_, index) =>
        createMathQuestion(index, "q", seed * 97, [], false, 2).prompt);
      expect(new Set(prompts).size).toBe(12);
    }
    const firstProblems = Array.from({ length: 100 }, (_, seed) =>
      createMathQuestion(0, "q", seed, [], false, 2).prompt);
    expect(new Set(firstProblems).size).toBeGreaterThan(20);
  });

  it("단을 선택하면 2학년 설정에서도 선택한 단의 구구단을 낸다", () => {
    expect(createMathQuestion(0, "q", 0, [19], false, 2).prompt).toMatch(/^19 × \d+ = \?$/);
  });
});

describe("3·4학년 기본 계산", () => {
  it.each([[3, 1_000, 100], [4, 10_000, 1_000]] as const)(
    "%i학년은 %i 이내 계산과 서로 다른 네 선택지를 만든다",
    (grade, maximum, previousMaximum) => {
      let extended = 0;
      for (let index = 0; index < 100; index += 1) {
        const question = createMathQuestion(index, `q-${index}`, 0, [], false, grade);
        const [left, operation, right] = question.prompt.split(" ");
        const expected = operation === "+" ? Number(left) + Number(right) : Number(left) - Number(right);
        expect(operation).toBe(index % 2 === 0 ? "+" : "−");
        expect(question.correctAnswer).toBe(expected);
        expect(question.correctAnswer).toBeGreaterThanOrEqual(0);
        expect(question.correctAnswer).toBeLessThanOrEqual(maximum);
        expect(question.choices).toHaveLength(4);
        expect(new Set(question.choices).size).toBe(4);
        expect(question.choices).toContain(expected);
        expect(question.choices.every((choice) => choice >= 0 && choice <= maximum)).toBe(true);
        if (Math.max(Number(left), Number(right), expected) > previousMaximum) extended += 1;
      }
      expect(extended).toBeGreaterThan(50);
    },
  );

  it("초반 12문항을 반복하지 않고 선택 단이 있으면 구구단을 우선한다", () => {
    for (const grade of [3, 4] as const) {
      for (let seed = 0; seed < 100; seed += 1) {
        const prompts = Array.from({ length: 12 }, (_, index) =>
          createMathQuestion(index, "q", seed * 97, [], false, grade).prompt);
        expect(new Set(prompts).size).toBe(12);
      }
      expect(createMathQuestion(0, "q", 0, [19], false, grade).prompt).toMatch(/^19 × \d+ = \?$/);
    }
  });
});

describe("5·6학년 첫 개념 문항군", () => {
  it.each([5, 6] as const)("%i학년의 두 개념 유형을 번갈아 내고 정답을 검증한다", (grade) => {
    for (let index = 0; index < 100; index += 1) {
      const question = createMathQuestion(index, `q-${index}`, 0, [], false, grade);
      const numbers = Array.from(question.prompt.matchAll(/\d+/g), (match) => Number(match[0]));
      let expected: number;
      if (grade === 5 && index % 2 === 0) {
        expect(question.prompt).toMatch(/^\d+, \d+, \d+의 평균은\?$/);
        expected = (numbers[0]! + numbers[1]! + numbers[2]!) / 3;
      } else if (grade === 5) {
        expect(question.prompt).toMatch(/^가로 \d+cm, 세로 \d+cm인 직사각형 넓이\(cm²\)는\?$/);
        expected = numbers[0]! * numbers[1]!;
      } else if (index % 2 === 0) {
        expect(question.prompt).toMatch(/^\d+의 \d+%는\?$/);
        expected = numbers[0]! * numbers[1]! / 100;
      } else {
        expect(question.prompt).toMatch(/^가로 \d+cm·세로 \d+cm·높이 \d+cm의 부피\(cm³\)는\?$/);
        expected = numbers[0]! * numbers[1]! * numbers[2]!;
      }
      expect(Number.isInteger(expected)).toBe(true);
      expect(question.correctAnswer).toBe(expected);
      expect(question.choices).toHaveLength(4);
      expect(new Set(question.choices).size).toBe(4);
      expect(question.choices).toContain(expected);
      expect(question.choices.every((choice) => choice >= 0 && choice <= 10_000)).toBe(true);
      expect(question.prompt.length).toBeLessThanOrEqual(40);
      expect(question.hint.length).toBeLessThanOrEqual(100);
    }
  });

  it("시드별 초반 12문항이 반복되지 않고 교사가 고른 구구단을 우선한다", () => {
    for (const grade of [5, 6] as const) {
      for (let seed = 0; seed < 100; seed += 1) {
        const prompts = Array.from({ length: 12 }, (_, index) =>
          createMathQuestion(index, "q", seed * 97, [], false, grade).prompt);
        expect(new Set(prompts).size).toBe(12);
      }
      expect(createMathQuestion(0, "q", 0, [19], false, grade).prompt).toMatch(/^19 × \d+ = \?$/);
    }
  });
});
