import { describe, expect, it } from "vitest";
import { RoomStageSettingsSchema } from "../src/protocol";

describe("교사 스테이지 설정 형식", () => {
  it("입력 생략 시 스테이지별 기본값을 적용한다", () => {
    expect(RoomStageSettingsSchema.parse({})).toEqual({
      stage1: { targetSeconds: 120, targetScore: 100, clearMode: "both" },
      stage2: { targetSeconds: 150, targetScore: 150, clearMode: "both" },
    });
  });

  it("유효하지 않은 목표나 알 수 없는 설정을 거절한다", () => {
    expect(RoomStageSettingsSchema.safeParse({ stage1: { targetSeconds: 0 } }).success).toBe(false);
    expect(RoomStageSettingsSchema.safeParse({ stage2: { targetScore: 1.5 } }).success).toBe(false);
    expect(RoomStageSettingsSchema.safeParse({ stage1: { clearMode: "skip" } }).success).toBe(false);
    expect(RoomStageSettingsSchema.safeParse({ studentScore: 9999 }).success).toBe(false);
  });
});
