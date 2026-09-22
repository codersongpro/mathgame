export type MapTier = "small" | "medium" | "large" | "xlarge";

/** 참여 인원이 늘어날수록 시작 맵을 한 단계씩 넓힙니다. */
export function selectMapTier(playerCount: number): MapTier {
  if (!Number.isInteger(playerCount) || playerCount < 1 || playerCount > 10) {
    throw new RangeError("playerCount must be an integer from 1 to 10");
  }

  if (playerCount <= 2) return "small";
  if (playerCount <= 5) return "medium";
  if (playerCount <= 8) return "large";
  return "xlarge";
}
