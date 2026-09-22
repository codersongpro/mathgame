import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "../src/packageInfo";

describe("realtime package", () => {
  it("실시간 서버 패키지 이름을 공개한다", () => {
    expect(PACKAGE_NAME).toBe("@bubble-semble/realtime");
  });
});
