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
        settings: {
          stage1: { targetSeconds: 120, targetScore: 130, clearMode: "either" },
          stage2: { targetSeconds: 150, targetScore: 150, clearMode: "both" },
        },
        stage: {
          type: "stage", stage: 1, status: "active", capturedCount: 2,
          captureGoal: 3, solvedCount: 4, questionGoal: 5,
          elapsedSeconds: 75, targetSeconds: 120, score: 80,
          targetScore: 130, clearMode: "either",
        },
        players: [{ id: "one", nickname: "별빛토끼", connected: true, solvedCount: 3 }],
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<TeacherRoomPanel />);

    fireEvent.change(screen.getByLabelText("교사 접속키"), { target: { value: "teacher-secret" } });
    fireEvent.change(screen.getByLabelText("목표 점수", { selector: "#stage1-score" }), { target: { value: "130" } });
    fireEvent.change(screen.getByLabelText("다음 스테이지 조건", { selector: "#stage1-mode" }), { target: { value: "either" } });
    fireEvent.click(screen.getByRole("button", { name: "새 방 열기" }));

    expect(await screen.findByText("012345")).toBeVisible();
    expect(await screen.findByText("별빛토끼")).toBeVisible();
    expect(screen.getByText("2")).toBeVisible();
    expect(screen.getByText("정답 3개 · 접속 중")).toBeVisible();
    expect(screen.getByText(/스테이지 1 진행 중 · 포획 2개 · 팀 정답 4개/)).toBeVisible();
    expect(screen.getByText(/설정 · 1단계 120초\/130점 \(하나\)/)).toBeVisible();
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).settings.stage1).toMatchObject({ targetScore: 130, clearMode: "either" });
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).settings.stage2).not.toHaveProperty("targetScore");
    expect(window.location.search).toBe("?room=012345");
    expect(screen.getByLabelText("교사 접속키")).toHaveValue("");
  });
});
