import { describe, expect, it } from "vitest";
import {
  createMonster,
  fireBubble,
  monsterLimit,
  popTrappedBubble,
  stepCombat,
} from "../src/combat";

describe("거품 전투 규칙", () => {
  it("참여자가 늘면 몬스터를 늘리되 한 구역에 8마리를 넘기지 않는다", () => {
    expect(monsterLimit(1)).toBe(2);
    expect(monsterLimit(3)).toBe(3);
    expect(monsterLimit(10)).toBe(6);
    expect(monsterLimit(30)).toBeLessThanOrEqual(8);
  });

  it("서버가 가진 플레이어 위치와 방향에서 거품을 발사한다", () => {
    expect(fireBubble("bubble-1", "player-1", 100, 480, -1, 20)).toMatchObject({
      id: "bubble-1",
      ownerId: "player-1",
      x: 68,
      y: 450,
      direction: -1,
      trappedMonsterId: null,
    });
  });

  it("거품이 몬스터를 가두고 가까운 학생이 터뜨려 팀 포획을 올린다", () => {
    const monster = { ...createMonster(0), x: 200, originX: 200 };
    const bubble = fireBubble("bubble-1", "player-1", 156, 480, 1, 0);
    const trapped = stepCombat([monster], [bubble], 1);

    expect(trapped.monsters[0]?.trapped).toBe(true);
    expect(trapped.bubbles[0]?.trappedMonsterId).toBe(monster.id);

    const tooFar = popTrappedBubble(trapped.monsters, trapped.bubbles, 500, 480);
    expect(tooFar.captured).toBe(false);

    const popped = popTrappedBubble(trapped.monsters, trapped.bubbles, 200, 480);
    expect(popped.captured).toBe(true);
    expect(popped.monsters).toHaveLength(0);
    expect(popped.bubbles).toHaveLength(0);
  });

  it("시간 안에 터뜨리지 못한 거품에서는 몬스터가 풀려난다", () => {
    const monster = { ...createMonster(0), x: 200, originX: 200 };
    const bubble = fireBubble("bubble-1", "player-1", 156, 480, 1, 0);
    const trapped = stepCombat([monster], [bubble], 1);
    const expiryTick = trapped.bubbles[0]?.expiresAtTick;
    if (expiryTick === undefined) throw new Error("포획 거품이 없습니다.");

    const released = stepCombat(trapped.monsters, trapped.bubbles, expiryTick);
    expect(released.monsters[0]?.trapped).toBe(false);
    expect(released.bubbles).toHaveLength(0);
  });
});
