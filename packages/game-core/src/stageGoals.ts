export const CORRECT_ANSWER_SCORE = 10;
export const MONSTER_CAPTURE_SCORE = 20;

/** 다음 세트에서는 시간은 유지하고 목표 점수만 20%씩 높입니다. */
export function scoreGoalForSet(baseScore: number, setNumber: number): number {
  return Math.min(2000, Math.ceil(baseScore * (1 + 0.2 * (Math.max(1, setNumber) - 1))));
}

type Goal = { targetSeconds: number; targetScore: number; clearMode: "both" | "either" };

/** 교사가 선택한 결합 방식을 서버에서만 판정합니다. */
export function stageGoalReached(goal: Goal, elapsedSeconds: number, score: number): boolean {
  const timeReached = elapsedSeconds >= goal.targetSeconds;
  const scoreReached = score >= goal.targetScore;
  return goal.clearMode === "both" ? timeReached && scoreReached : timeReached || scoreReached;
}
