import { describe, expect, it } from "vitest";
import { selectMapTier } from "../src/mapTier";

describe("인원별 맵 크기", () => {
  it.each([
    [1, "small"],
    [2, "small"],
    [3, "medium"],
    [5, "medium"],
    [6, "large"],
    [8, "large"],
    [9, "xlarge"],
    [10, "xlarge"],
  ] as const)("%i명에게 %s 맵을 선택한다", (playerCount, expected) => {
    expect(selectMapTier(playerCount)).toBe(expected);
  });

  it("1~10명 밖의 인원수를 거절한다", () => {
    expect(() => selectMapTier(0)).toThrow("playerCount");
    expect(() => selectMapTier(11)).toThrow("playerCount");
  });
});
