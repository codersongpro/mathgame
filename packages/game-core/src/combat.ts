import { FLOOR_Y, TICK_RATE } from "./playerSimulation";

export type CombatMonster = {
  id: string;
  x: number;
  y: number;
  originX: number;
  direction: -1 | 1;
  trapped: boolean;
};

export type CombatBubble = {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  direction: -1 | 1;
  trappedMonsterId: string | null;
  expiresAtTick: number;
};

/** 참가자가 두 명 늘 때마다 몬스터 한 마리를 추가합니다. */
export function monsterLimit(playerCount: number): number {
  return Math.min(8, 2 + Math.floor((Math.max(1, playerCount) - 1) / 2));
}

/** 세 번째 일반 스테이지는 같은 인원에서 몬스터를 두 마리 늘립니다. */
export function stageMonsterLimit(playerCount: number, stage: 1 | 2 | 3, setNumber = 1): number {
  return Math.min(8, monsterLimit(playerCount) + (stage === 3 ? 2 : 0) + Math.max(0, setNumber - 1));
}

export function createMonster(index: number): CombatMonster {
  const x = 320 + index * 200;
  return {
    id: `monster-${index + 1}`,
    x,
    y: FLOOR_Y - 28,
    originX: x,
    direction: index % 2 === 0 ? -1 : 1,
    trapped: false,
  };
}

/** 발사 위치는 클라이언트가 보내지 않고 서버의 플레이어 위치에서 계산합니다. */
export function fireBubble(
  id: string,
  ownerId: string,
  playerX: number,
  playerY: number,
  direction: -1 | 1,
  tick: number,
): CombatBubble {
  return {
    id,
    ownerId,
    x: playerX + direction * 32,
    y: playerY - 30,
    direction,
    trappedMonsterId: null,
    expiresAtTick: tick + TICK_RATE * 2,
  };
}

/** 한 틱의 순수한 전투 판정입니다. 화면은 이 결과를 받아 그리기만 합니다. */
export function stepCombat(
  currentMonsters: readonly CombatMonster[],
  currentBubbles: readonly CombatBubble[],
  tick: number,
): { monsters: CombatMonster[]; bubbles: CombatBubble[] } {
  const monsters = currentMonsters.map((monster) => {
    if (monster.trapped) return { ...monster };
    const nextX = monster.x + monster.direction * 2;
    const atEdge = Math.abs(nextX - monster.originX) > 70;
    return {
      ...monster,
      x: atEdge ? monster.x - monster.direction * 2 : nextX,
      direction: (atEdge ? -monster.direction : monster.direction) as -1 | 1,
    };
  });
  const bubbles: CombatBubble[] = [];

  for (const previous of currentBubbles) {
    if (tick >= previous.expiresAtTick) {
      if (previous.trappedMonsterId) {
        const monster = monsters.find((item) => item.id === previous.trappedMonsterId);
        if (monster) {
          monster.trapped = false;
          monster.x = previous.x;
          monster.originX = previous.x;
        }
      }
      continue;
    }

    const bubble = {
      ...previous,
      x: previous.x + (previous.trappedMonsterId ? 0 : previous.direction * 12),
      y: previous.y - (previous.trappedMonsterId ? 0.5 : 0.4),
    };

    if (!bubble.trappedMonsterId) {
      const monster = monsters.find(
        (item) =>
          !item.trapped && Math.abs(item.x - bubble.x) <= 26 && Math.abs(item.y - bubble.y) <= 28,
      );
      if (monster) {
        monster.trapped = true;
        bubble.trappedMonsterId = monster.id;
        bubble.expiresAtTick = tick + TICK_RATE * 4;
      }
    }
    bubbles.push(bubble);
  }

  return { monsters, bubbles };
}

/** 가까운 포획 거품 하나만 터뜨려 팀 포획 수를 올릴 수 있게 합니다. */
export function popTrappedBubble(
  monsters: readonly CombatMonster[],
  bubbles: readonly CombatBubble[],
  playerX: number,
  playerY: number,
): { monsters: CombatMonster[]; bubbles: CombatBubble[]; captured: boolean } {
  const target = bubbles.find(
    (bubble) =>
      bubble.trappedMonsterId !== null &&
      Math.hypot(bubble.x - playerX, bubble.y - playerY) <= 88,
  );
  if (!target) return { monsters: [...monsters], bubbles: [...bubbles], captured: false };

  return {
    monsters: monsters.filter((monster) => monster.id !== target.trappedMonsterId),
    bubbles: bubbles.filter((bubble) => bubble.id !== target.id),
    captured: true,
  };
}
