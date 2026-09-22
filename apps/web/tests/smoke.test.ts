import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "../src/packageInfo";

describe("web package", () => {
  it("웹 패키지 이름을 공개한다", () => {
    expect(PACKAGE_NAME).toBe("@bubble-semble/web");
  });
});
