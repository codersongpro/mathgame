// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "../src/app/page";

const push = vi.fn();

afterEach(cleanup);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("Bubble Semble 로비", () => {
  beforeEach(() => push.mockReset());

  it("게임 제목과 접근 가능한 입력 항목을 보여준다", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { name: "Bubble Semble" })).toBeVisible();
    expect(screen.getByLabelText("방 코드")).toBeVisible();
    expect(screen.getByLabelText("별명")).toBeVisible();
  });

  it("방 코드를 입력 즉시 대문자로 바꾼다", () => {
    render(<HomePage />);
    const roomInput = screen.getByLabelText("방 코드");

    fireEvent.change(roomInput, { target: { value: "b7k9q2" } });

    expect(roomInput).toHaveValue("B7K9Q2");
  });

  it("잘못된 값에는 한국어 인라인 오류를 보여준다", () => {
    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("방 코드"), { target: { value: "ABC" } });
    fireEvent.change(screen.getByLabelText("별명"), { target: { value: "별" } });
    fireEvent.click(screen.getByRole("button", { name: "같이 시작하기" }));

    expect(screen.getByText("방 코드는 혼동 문자를 제외한 6자리입니다.")).toBeVisible();
    expect(screen.getByText("별명은 2~12자로 입력해 주세요.")).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });

  it("12자 별명을 허용하고 유효한 플레이 경로로 이동한다", () => {
    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("방 코드"), { target: { value: "b7k9q2" } });
    fireEvent.change(screen.getByLabelText("별명"), { target: { value: "가나다라마바사아자차카타" } });
    fireEvent.click(screen.getByRole("button", { name: "같이 시작하기" }));

    expect(push).toHaveBeenCalledWith(
      "/play?room=B7K9Q2&nickname=가나다라마바사아자차카타",
    );
  });

  it("유효한 별명으로 안내된 플레이 경로로 이동한다", () => {
    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("방 코드"), { target: { value: "B7K9Q2" } });
    fireEvent.change(screen.getByLabelText("별명"), { target: { value: "별빛토끼" } });
    fireEvent.click(screen.getByRole("button", { name: "같이 시작하기" }));

    expect(push).toHaveBeenCalledWith("/play?room=B7K9Q2&nickname=별빛토끼");
  });
});
