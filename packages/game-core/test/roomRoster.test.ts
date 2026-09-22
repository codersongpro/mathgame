import { describe, expect, it } from "vitest";
import { RoomRoster } from "../src/roomRoster";

function createRoster(): RoomRoster {
  let id = 0;
  let token = 0;
  return new RoomRoster({
    createPlayerId: () => `player-${++id}`,
    createReconnectToken: () => `token-${++token}`,
  });
}

describe("방 정원과 재접속", () => {
  it("열 명을 유지하고 열한 번째 입장을 ROOM_FULL로 거절한다", () => {
    const roster = createRoster();

    for (let index = 1; index <= 10; index += 1) {
      expect(roster.join({ nickname: `학생${index}` }, 0).ok).toBe(true);
    }

    expect(roster.join({ nickname: "학생11" }, 0)).toEqual({
      ok: false,
      code: "ROOM_FULL",
    });
    expect(roster.players()).toHaveLength(10);
  });

  it("59초에는 같은 슬롯을 복구하고 61초 정리 뒤에는 새 슬롯을 만든다", () => {
    const reconnectingRoster = createRoster();
    const joined = reconnectingRoster.join({ nickname: "별빛토끼" }, 0);
    if (!joined.ok) throw new Error("초기 입장에 실패했습니다.");

    reconnectingRoster.disconnect(joined.player.id, 0);
    const restored = reconnectingRoster.join(
      { nickname: "별빛토끼", reconnectToken: joined.player.reconnectToken },
      59_000,
    );

    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error("재접속에 실패했습니다.");
    expect(restored.reconnected).toBe(true);
    expect(restored.player.id).toBe(joined.player.id);

    const expiredRoster = createRoster();
    const expiring = expiredRoster.join({ nickname: "달빛여우" }, 0);
    if (!expiring.ok) throw new Error("만료 확인용 입장에 실패했습니다.");
    expiredRoster.disconnect(expiring.player.id, 0);
    expect(expiredRoster.pruneExpired(61_000)).toBe(1);

    const replacement = expiredRoster.join(
      { nickname: "달빛여우", reconnectToken: expiring.player.reconnectToken },
      61_000,
    );
    expect(replacement.ok).toBe(true);
    if (!replacement.ok) throw new Error("만료 뒤 새 입장에 실패했습니다.");
    expect(replacement.reconnected).toBe(false);
    expect(replacement.player.id).not.toBe(expiring.player.id);
  });
});
