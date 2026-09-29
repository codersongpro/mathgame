import { describe, expect, it } from "vitest";
import { gateFragmentGoal, shouldOpenTeamGate } from "../src/teamGate";

describe("팀 수학 관문", () => {
  it("참가 인원의 60%를 올림하고 2~6조각으로 제한한다", () => {
    expect(gateFragmentGoal(1)).toBe(2);
    expect(gateFragmentGoal(2)).toBe(2);
    expect(gateFragmentGoal(5)).toBe(3);
    expect(gateFragmentGoal(10)).toBe(6);
  });

  it("시간 또는 점수가 목표 절반에 도달하면 열린다", () => {
    const goal = { targetSeconds: 90, targetScore: 180 };
    expect(shouldOpenTeamGate(goal, 44, 89)).toBe(false);
    expect(shouldOpenTeamGate(goal, 45, 0)).toBe(true);
    expect(shouldOpenTeamGate(goal, 0, 90)).toBe(true);
  });
});
