import { describe, expect, it } from "vitest";
import { createMonster } from "../src/combat";
import { nearestFriendToRescue, readyToRecover, touchedMonster } from "../src/rescue";

describe("친구 구출 판정", () => {
  it("자유로운 몬스터와 닿으면 쓰러지지만 갇힌 몬스터는 안전하다", () => {
    const monster = createMonster(0);
    expect(touchedMonster({ x: monster.x, y: monster.y + 22 }, [monster])).toBe(true);
    expect(touchedMonster({ x: monster.x + 50, y: monster.y + 22 }, [monster])).toBe(false);
    expect(touchedMonster({ x: monster.x, y: monster.y + 22 }, [{ ...monster, trapped: true }])).toBe(false);
  });

  it("80픽셀 이내의 연결된 친구만 구출하고 자기 자신은 구출할 수 없다", () => {
    const players = [
      { id: "me", x: 0, y: 0, downed: true, connected: true },
      { id: "near", x: 70, y: 0, downed: true, connected: true },
      { id: "far", x: 81, y: 0, downed: true, connected: true },
      { id: "offline", x: 10, y: 0, downed: true, connected: false },
    ];
    expect(nearestFriendToRescue("me", { x: 0, y: 0 }, players)).toBe("near");
    expect(nearestFriendToRescue("me", { x: 200, y: 0 }, players)).toBeNull();
  });

  it("8초가 지나기 전에는 자동 복구하지 않는다", () => {
    expect(readyToRecover(100, 259)).toBe(false);
    expect(readyToRecover(100, 260)).toBe(true);
  });
});
