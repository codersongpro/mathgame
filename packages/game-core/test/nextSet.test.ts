import { describe, expect, it } from "vitest";
import { scoreGoalForSet } from "../src/stageGoals";

describe("다음 세트 목표 점수", () => {
  it("첫 세트는 교사 설정을 유지하고 세트마다 20%씩 올린다", () => {
    expect(scoreGoalForSet(100, 1)).toBe(100);
    expect(scoreGoalForSet(100, 2)).toBe(120);
    expect(scoreGoalForSet(150, 3)).toBe(210);
  });

  it("점수 상한 2000점을 넘기지 않는다", () => {
    expect(scoreGoalForSet(2000, 10)).toBe(2000);
  });
});
