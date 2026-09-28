// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlayPage from "../src/app/play/page";
import { PlaytestToolbar } from "../src/components/PlaytestToolbar";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("원클릭 시험 플레이", () => {
  it("테스트 모드가 권한 없이 게임 규칙을 바꾸지 않고 도구만 표시하도록 전달한다", async () => {
    const page = await PlayPage({ searchParams: Promise.resolve({ room: "000123", nickname: "교사테스트", mode: "test" }) });
    expect(page.props).toMatchObject({ room: "000123", nickname: "교사테스트", testMode: true });
  });

  it("친구 링크에는 방 번호와 별명만 담고 교사 모니터 링크는 별도로 둔다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<PlaytestToolbar room="000123" />);

    fireEvent.click(screen.getByRole("button", { name: "친구 입장 링크 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const url = new URL(writeText.mock.calls[0]![0]);
    expect(url.pathname).toBe("/play");
    expect(url.searchParams.get("room")).toBe("000123");
    expect(url.searchParams.get("nickname")).toMatch(/^테스트[0-9]{4}$/);
    expect(url.searchParams.has("mode")).toBe(false);
    expect(url.searchParams.has("accessKey")).toBe(false);
    expect(url.searchParams.has("teacherToken")).toBe(false);
    expect(screen.getByRole("link", { name: "교사 모니터" })).toHaveAttribute("href", "/teacher?room=000123");
    expect(screen.getByLabelText("친구 입장 주소")).toHaveValue(url.toString());
  });
});
