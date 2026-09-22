import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "../src/index";

describe("game-core package", () => {
  it("게임 코어 패키지 이름을 공개한다", () => {
    expect(PACKAGE_NAME).toBe("@bubble-semble/game-core");
  });
});
