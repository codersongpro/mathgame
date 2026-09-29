import { describe, expect, it } from "vitest";
import { RoomStageSettingsSchema } from "../src/protocol";

describe("교사 스테이지 설정 형식", () => {
  it("입력 생략 시 스테이지별 기본값을 적용한다", () => {
    expect(RoomStageSettingsSchema.parse({})).toEqual({
      stage1: { targetSeconds: 120, targetScore: 100, clearMode: "both" },
      stage2: { targetSeconds: 150, targetScore: 150, clearMode: "both" },
      stage3: { targetSeconds: 90, targetScore: 180, clearMode: "both" },
      multiplicationTables: [],
      divisionEnabled: false,
      grade: 1,
    });
  });

  it("유효하지 않은 목표나 알 수 없는 설정을 거절한다", () => {
    expect(RoomStageSettingsSchema.safeParse({ stage1: { targetSeconds: 0 } }).success).toBe(false);
    expect(RoomStageSettingsSchema.safeParse({ stage2: { targetScore: 1.5 } }).success).toBe(false);
    expect(RoomStageSettingsSchema.safeParse({ stage3: { targetSeconds: 601 } }).success).toBe(false);
    expect(RoomStageSettingsSchema.safeParse({ stage1: { clearMode: "skip" } }).success).toBe(false);
    expect(RoomStageSettingsSchema.safeParse({ studentScore: 9999 }).success).toBe(false);
  });

  it("1~19단 여러 개를 받되 중복과 범위 밖 선택을 거절한다", () => {
    expect(RoomStageSettingsSchema.parse({ multiplicationTables: [2, 7, 19] }).multiplicationTables).toEqual([2, 7, 19]);
    expect(RoomStageSettingsSchema.safeParse({ multiplicationTables: [2, 2] }).success).toBe(false);
    expect(RoomStageSettingsSchema.safeParse({ multiplicationTables: [0] }).success).toBe(false);
    expect(RoomStageSettingsSchema.safeParse({ multiplicationTables: [20] }).success).toBe(false);
  });

  it("나눗셈은 단을 고른 방에서만 켤 수 있다", () => {
    expect(RoomStageSettingsSchema.safeParse({ divisionEnabled: true }).success).toBe(false);
    expect(RoomStageSettingsSchema.parse({ multiplicationTables: [7], divisionEnabled: true }).divisionEnabled).toBe(true);
  });

  it("1~6학년을 허용하고 생략한 방은 기존 1학년 범위를 유지한다", () => {
    expect(RoomStageSettingsSchema.parse({ grade: 2 }).grade).toBe(2);
    expect(RoomStageSettingsSchema.parse({ grade: 3 }).grade).toBe(3);
    expect(RoomStageSettingsSchema.parse({ grade: 4 }).grade).toBe(4);
    expect(RoomStageSettingsSchema.parse({ grade: 5 }).grade).toBe(5);
    expect(RoomStageSettingsSchema.parse({ grade: 6 }).grade).toBe(6);
    expect(RoomStageSettingsSchema.safeParse({ grade: 0 }).success).toBe(false);
    expect(RoomStageSettingsSchema.safeParse({ grade: 7 }).success).toBe(false);
    expect(RoomStageSettingsSchema.safeParse({ grade: 2.5 }).success).toBe(false);
  });
});
