import { describe, expect, it } from "vitest";
import { stageElapsedSeconds, stageOneComplete, stageOneGoals } from "../src/stageOne";

describe("일반 스테이지 1 공동 목표", () => {
  it("참여자가 늘수록 포획과 문제 목표가 함께 증가한다", () => {
    expect(stageOneGoals(1)).toEqual({ captureGoal: 1, questionGoal: 2 });
    expect(stageOneGoals(2)).toEqual({ captureGoal: 1, questionGoal: 3 });
    expect(stageOneGoals(6)).toEqual({ captureGoal: 3, questionGoal: 7 });
    expect(stageOneGoals(10)).toEqual({ captureGoal: 5, questionGoal: 11 });
  });

  it("두 팀 목표를 모두 채운 경우에만 완료한다", () => {
    const goals = stageOneGoals(4);
    expect(stageOneComplete(goals, 1, 5)).toBe(false);
    expect(stageOneComplete(goals, 2, 4)).toBe(false);
    expect(stageOneComplete(goals, 2, 5)).toBe(true);
  });

  it("2분을 넘겨도 강제 실패하지 않고 경과 시간을 계산한다", () => {
    expect(stageElapsedSeconds(20, 20 + 20 * 125)).toBe(125);
    expect(stageElapsedSeconds(20, 19)).toBe(0);
  });
});
