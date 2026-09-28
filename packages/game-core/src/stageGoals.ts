export const CORRECT_ANSWER_SCORE = 10;
export const MONSTER_CAPTURE_SCORE = 20;

type Goal = { targetSeconds: number; targetScore: number; clearMode: "both" | "either" };

/** 교사가 선택한 결합 방식을 서버에서만 판정합니다. */
export function stageGoalReached(goal: Goal, elapsedSeconds: number, score: number): boolean {
  const timeReached = elapsedSeconds >= goal.targetSeconds;
  const scoreReached = score >= goal.targetScore;
  return goal.clearMode === "both" ? timeReached && scoreReached : timeReached || scoreReached;
}
