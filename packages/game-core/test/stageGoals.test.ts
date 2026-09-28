import { describe, expect, it } from "vitest";
import { stageGoalReached } from "../src/stageGoals";

describe("교사 설정 스테이지 목표", () => {
  it("시간·점수 중 하나만 채워도 되는 설정을 별도로 판정한다", () => {
    const both = { targetSeconds: 120, targetScore: 100, clearMode: "both" } as const;
    expect(stageGoalReached(both, 120, 90)).toBe(false);
    expect(stageGoalReached(both, 119, 100)).toBe(false);
    expect(stageGoalReached(both, 120, 100)).toBe(true);
    expect(stageGoalReached({ ...both, clearMode: "either" }, 0, 100)).toBe(true);
    expect(stageGoalReached({ ...both, clearMode: "either" }, 120, 0)).toBe(true);
  });

});
