import type { CombatMonster } from "./combat";

export const RESCUE_DISTANCE = 80;
export const DOWNED_RECOVERY_TICKS = 20 * 8;
export const HIT_PROTECTION_TICKS = 20 * 3;

/** 구출자가 없더라도 학생이 무기한 조작 불능에 빠지지 않도록 합니다. */
export function readyToRecover(downedAtTick: number, currentTick: number): boolean {
  return currentTick - downedAtTick >= DOWNED_RECOVERY_TICKS;
}

type PlayerPosition = { x: number; y: number };

/** 자유로운 몬스터와 캐릭터 몸통이 겹친 경우에만 피격으로 판정합니다. */
export function touchedMonster(player: PlayerPosition, monsters: readonly CombatMonster[]): boolean {
  return monsters.some((monster) =>
    !monster.trapped &&
    Math.abs(player.x - monster.x) <= 22 &&
    Math.abs(player.y - 22 - monster.y) <= 28,
  );
}

/** 서버에 저장된 좌표만 사용해 가장 가까운 쓰러진 친구를 찾습니다. */
export function nearestFriendToRescue(
  rescuerId: string,
  rescuer: PlayerPosition,
  players: readonly { id: string; x: number; y: number; downed: boolean; connected: boolean }[],
): string | null {
  const friend = players
    .filter((player) => player.id !== rescuerId && player.connected && player.downed)
    .map((player) => ({ id: player.id, distance: Math.hypot(player.x - rescuer.x, player.y - rescuer.y) }))
    .filter((player) => player.distance <= RESCUE_DISTANCE)
    .sort((left, right) => left.distance - right.distance)[0];
  return friend?.id ?? null;
}
