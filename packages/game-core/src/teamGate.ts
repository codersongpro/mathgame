type StageGoal = { targetSeconds: number; targetScore: number };

/** 팀원이 많아지면 필요한 정답 조각도 늘리되 2~6개로 제한합니다. */
export function gateFragmentGoal(playerCount: number): number {
  return Math.min(6, Math.max(2, Math.ceil(Math.max(1, playerCount) * 0.6)));
}

/** 3단계 시간이나 점수의 절반에 도달하면 팀 관문을 엽니다. */
export function shouldOpenTeamGate(goal: StageGoal, elapsedSeconds: number, score: number): boolean {
  return elapsedSeconds >= Math.ceil(goal.targetSeconds / 2) || score >= Math.ceil(goal.targetScore / 2);
}
