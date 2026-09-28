// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeacherRoomPanel } from "../src/components/TeacherRoomPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("교사 방 화면", () => {
  it("접속키로 방을 열고 학생 현황을 표시한다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ roomCode: "012345", expiresAt: Date.now() + 10_000 }))
      .mockResolvedValue(Response.json({
        capturedCount: 2,
        players: [{ id: "one", nickname: "별빛토끼", connected: true, solvedCount: 3 }],
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<TeacherRoomPanel />);

    fireEvent.change(screen.getByLabelText("교사 접속키"), { target: { value: "teacher-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "새 방 열기" }));

    expect(await screen.findByText("012345")).toBeVisible();
    expect(await screen.findByText("별빛토끼")).toBeVisible();
    expect(screen.getByText("2")).toBeVisible();
    expect(screen.getByText("정답 3개 · 접속 중")).toBeVisible();
    expect(window.location.search).toBe("?room=012345");
    expect(screen.getByLabelText("교사 접속키")).toHaveValue("");
  });
});
