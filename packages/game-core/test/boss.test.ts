import { describe, expect, it } from "vitest";
import { BOSS_X, BOSS_Y, bossHealthForPlayers, hitBoss } from "../src/boss";
import { fireBubble } from "../src/combat";

describe("첫 보스 판정", () => {
  it("인원별 체력은 진입 시 고정하고 열 명은 36이다", () => {
    expect(bossHealthForPlayers(1)).toBe(6);
    expect(bossHealthForPlayers(2)).toBe(10);
    expect(bossHealthForPlayers(10)).toBe(36);
    expect(bossHealthForPlayers(1, 2)).toBe(8);
    expect(bossHealthForPlayers(10, 20)).toBe(100);
  });

  it("방어막 중에는 거품을 흡수하고 해제 뒤에는 명중당 체력 1을 깎는다", () => {
    const bubble = { ...fireBubble("b1", "p1", BOSS_X - 32, BOSS_Y + 30, 1, 0), x: BOSS_X, y: BOSS_Y };
    expect(hitBoss(6, [bubble], true)).toMatchObject({ health: 6, hits: 0, bubbles: [] });
    expect(hitBoss(6, [bubble], false)).toMatchObject({ health: 5, hits: 1, bubbles: [] });
    expect(hitBoss(1, [bubble, { ...bubble, id: "b2" }], false)).toMatchObject({ health: 0, hits: 1 });
  });

  it("보스를 빗나간 거품은 그대로 남는다", () => {
    const bubble = fireBubble("b1", "p1", 100, BOSS_Y + 30, 1, 0);
    expect(hitBoss(6, [bubble], false)).toMatchObject({ health: 6, hits: 0, bubbles: [bubble] });
  });
});
