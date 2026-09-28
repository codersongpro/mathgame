import { TICK_RATE } from "./playerSimulation";

export const STAGE_ONE_TARGET_SECONDS = 120;

/** 스테이지 시작 시 인원을 고정해 공동 목표가 중간에 흔들리지 않게 합니다. */
export function stageOneGoals(playerCount: number) {
  const participants = Math.min(10, Math.max(1, Math.floor(playerCount)));
  return {
    captureGoal: Math.ceil(participants / 2),
    questionGoal: Math.max(2, participants + 1),
  };
}

/** 몬스터 포획과 수학 문제를 모두 마쳐야 팀이 스테이지를 통과합니다. */
export function stageOneComplete(
  goals: ReturnType<typeof stageOneGoals>,
  capturedCount: number,
  solvedCount: number,
): boolean {
  return capturedCount >= goals.captureGoal && solvedCount >= goals.questionGoal;
}

/** 목표 시간을 넘겨도 종료시키지 않고 실제 걸린 시간을 기록합니다. */
export function stageElapsedSeconds(startTick: number, endTick: number): number {
  return Math.floor(Math.max(0, endTick - startTick) / TICK_RATE);
}
