import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "../src/index";

describe("shared package", () => {
  it("공유 패키지 이름을 공개한다", () => {
    expect(PACKAGE_NAME).toBe("@bubble-semble/shared");
  });
});
