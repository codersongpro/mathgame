// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeacherRoomPanel } from "../src/components/TeacherRoomPanel";

const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(() => {
  cleanup();
  push.mockReset();
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
    expect(push).not.toHaveBeenCalled();
  });

  it("교사 인증 뒤 시험 플레이 방을 만들고 번호 입력 없이 게임으로 이동한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      roomCode: "000123", expiresAt: Date.now() + 10_000,
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<TeacherRoomPanel />);

    fireEvent.change(screen.getByLabelText("교사 접속키"), { target: { value: "teacher-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "시험 플레이 시작" }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const destination = new URL(push.mock.calls[0]![0], "https://web.example");
    expect(destination.pathname).toBe("/play");
    expect(Object.fromEntries(destination.searchParams)).toEqual({
      room: "000123", nickname: "교사테스트", mode: "test",
    });
    expect(destination.href).not.toContain("teacher-secret");
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toMatchObject({ accessKey: "teacher-secret" });
    expect(screen.getByLabelText("교사 접속키")).toHaveValue("");
  });

  it("접속키가 거절되면 시험 플레이로 이동하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "교사 접속키가 올바르지 않습니다." }, { status: 401 })));
    render(<TeacherRoomPanel />);
    fireEvent.change(screen.getByLabelText("교사 접속키"), { target: { value: "wrong-key" } });
    fireEvent.click(screen.getByRole("button", { name: "시험 플레이 시작" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("교사 접속키가 올바르지 않습니다.");
    expect(push).not.toHaveBeenCalled();
  });

  it("방 발급 응답이 올바르지 않으면 임의의 주소로 이동하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ roomCode: "javascript:alert(1)" })));
    render(<TeacherRoomPanel />);
    fireEvent.change(screen.getByLabelText("교사 접속키"), { target: { value: "teacher-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "시험 플레이 시작" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("발급된 방 코드를 확인할 수 없습니다.");
    expect(push).not.toHaveBeenCalled();
  });
});
