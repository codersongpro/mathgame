import type { CombatBubble } from "./combat";
import { FLOOR_Y } from "./playerSimulation";

export const BOSS_X = 720;
export const BOSS_Y = FLOOR_Y - 64;

/** 참가 인원이 늘면 체력을 키우되 보스 진입 시 한 번만 계산합니다. */
export function bossHealthForPlayers(playerCount: number, setNumber = 1): number {
  return Math.min(100, Math.ceil(
    6 * (1 + 0.55 * (Math.max(1, playerCount) - 1)) * (1 + 0.25 * (Math.max(1, setNumber) - 1)),
  ));
}

/** 방어막과 거품 명중을 서버 틱에서 결정합니다. 명중한 거품은 한 번만 소비됩니다. */
export function hitBoss(
  health: number,
  bubbles: readonly CombatBubble[],
  shielded: boolean,
): { health: number; bubbles: CombatBubble[]; hits: number } {
  let hits = 0;
  const remaining: CombatBubble[] = [];
  for (const bubble of bubbles) {
    const touches = bubble.trappedMonsterId === null &&
      Math.abs(bubble.x - BOSS_X) <= 62 && Math.abs(bubble.y - BOSS_Y) <= 68;
    if (!touches) {
      remaining.push(bubble);
      continue;
    }
    if (!shielded && hits < health) hits += 1;
  }
  return { health: Math.max(0, health - hits), bubbles: remaining, hits };
}
