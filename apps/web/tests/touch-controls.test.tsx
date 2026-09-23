// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/app/globals.css";
import { TouchControls } from "../src/components/TouchControls";

afterEach(cleanup);

describe("태블릿 터치 조작", () => {
  it("왼쪽·오른쪽 버튼을 누르고 떼면 축 입력을 보낸다", () => {
    const onChange = vi.fn();
    render(<TouchControls onChange={onChange} onAction={() => undefined} actionsEnabled />);

    const left = screen.getByRole("button", { name: "왼쪽으로 이동" });
    fireEvent.pointerDown(left, { pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith({ axis: -1, jump: false });
    fireEvent.pointerUp(left, { pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith({ axis: 0, jump: false });

    const right = screen.getByRole("button", { name: "오른쪽으로 이동" });
    fireEvent.pointerDown(right, { pointerId: 2 });
    expect(onChange).toHaveBeenLastCalledWith({ axis: 1, jump: false });
    fireEvent.pointerLeave(right, { pointerId: 2 });
    expect(onChange).toHaveBeenLastCalledWith({ axis: 0, jump: false });
  });

  it("방향 이동과 점프를 동시에 입력할 수 있다", () => {
    const onChange = vi.fn();
    render(<TouchControls onChange={onChange} onAction={() => undefined} actionsEnabled />);

    fireEvent.pointerDown(screen.getByRole("button", { name: "왼쪽으로 이동" }), {
      pointerId: 1,
    });
    fireEvent.pointerDown(screen.getByRole("button", { name: "점프" }), { pointerId: 2 });

    expect(onChange).toHaveBeenLastCalledWith({ axis: -1, jump: true });
  });

  it("한국어 이름과 64픽셀 이상의 터치 영역을 제공한다", () => {
    render(<TouchControls onChange={() => undefined} onAction={() => undefined} actionsEnabled />);

    for (const name of ["왼쪽으로 이동", "오른쪽으로 이동", "점프", "거품 발사", "팡! 터뜨리기"]) {
      const button = screen.getByRole("button", { name });
      const style = getComputedStyle(button);
      expect(Number.parseFloat(style.minWidth)).toBeGreaterThanOrEqual(64);
      expect(Number.parseFloat(style.minHeight)).toBeGreaterThanOrEqual(64);
    }
  });

  it("거품 발사와 터뜨리기는 누를 때 각각 한 번만 요청한다", () => {
    const onAction = vi.fn();
    render(<TouchControls onChange={() => undefined} onAction={onAction} actionsEnabled />);

    fireEvent.pointerDown(screen.getByRole("button", { name: "거품 발사" }), { pointerId: 3 });
    fireEvent.pointerDown(screen.getByRole("button", { name: "팡! 터뜨리기" }), { pointerId: 4 });

    expect(onAction.mock.calls).toEqual([["fire"], ["pop"]]);
  });

  it("서버 전투 상태를 받기 전에는 거품 버튼을 사용할 수 없다", () => {
    const onAction = vi.fn();
    render(<TouchControls onChange={() => undefined} onAction={onAction} actionsEnabled={false} />);

    fireEvent.pointerDown(screen.getByRole("button", { name: "거품 발사" }));
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "거품 발사" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "팡! 터뜨리기" })).toBeDisabled();
  });
});
