import { describe, expect, it } from "vitest";
import { ClientMessageSchema, NicknameSchema, RoomCodeSchema } from "../src/protocol";

describe("공통 프로토콜", () => {
  it("허용된 방 코드와 별명을 승인한다", () => {
    expect(RoomCodeSchema.parse("000000")).toBe("000000");
    expect(RoomCodeSchema.parse("012345")).toBe("012345");
    expect(RoomCodeSchema.parse("999999")).toBe("999999");
    expect(NicknameSchema.parse("별빛토끼")).toBe("별빛토끼");
  });

  it.each(["12345", "1234567", "12A456", "12 456"])("숫자 6자리가 아닌 방 코드 %s를 거절한다", (room) => {
    expect(() => RoomCodeSchema.parse(room)).toThrow();
  });

  it("12자리를 넘거나 제어 문자가 있는 별명을 거절한다", () => {
    expect(() => NicknameSchema.parse("아주아주긴학생별명이에요요")).toThrow();
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

  it("거품 행동은 종류·순서·방향만 받고 위조 좌표는 거절한다", () => {
    expect(
      ClientMessageSchema.parse({ type: "action", sequence: 3, kind: "fire", direction: 1 }),
    ).toMatchObject({ type: "action", kind: "fire" });
    expect(() =>
      ClientMessageSchema.parse({
        type: "action",
        sequence: 4,
        kind: "pop",
        direction: 1,
        x: 9999,
      }),
    ).toThrow();
  });
});
