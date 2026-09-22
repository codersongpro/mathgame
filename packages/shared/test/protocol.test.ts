import { describe, expect, it } from "vitest";
import { ClientMessageSchema, NicknameSchema, RoomCodeSchema } from "../src/protocol";

describe("공통 프로토콜", () => {
  it("허용된 방 코드와 별명을 승인한다", () => {
    expect(RoomCodeSchema.parse("B7K9Q2")).toBe("B7K9Q2");
    expect(NicknameSchema.parse("별빛토끼")).toBe("별빛토끼");
  });

  it("11자리를 넘거나 제어 문자가 있는 별명을 거절한다", () => {
    expect(() => NicknameSchema.parse("아주아주긴학생별명이에요")).toThrow();
    expect(() => NicknameSchema.parse("학생\u0000")).toThrow();
  });

  it("클라이언트가 보낸 위치값을 입력 메시지로 인정하지 않는다", () => {
    expect(() =>
      ClientMessageSchema.parse({
        type: "input",
        sequence: 1,
        axis: 1,
        jump: false,
        x: 9999,
      }),
    ).toThrow();
  });

  it("축 범위 밖 입력을 거절한다", () => {
    expect(() =>
      ClientMessageSchema.parse({ type: "input", sequence: 1, axis: 2, jump: false }),
    ).toThrow();
  });
});
