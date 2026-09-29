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
        rescueCount: 1,
        downedCount: 1,
        settings: {
          stage1: { targetSeconds: 120, targetScore: 130, clearMode: "either" },
          stage2: { targetSeconds: 150, targetScore: 150, clearMode: "both" },
          stage3: { targetSeconds: 90, targetScore: 180, clearMode: "both" },
          multiplicationTables: [2, 7, 19],
          divisionEnabled: true,
          grade: 1,
        },
        stage: {
          type: "stage", setNumber: 1, stage: 1, status: "active", capturedCount: 2,
          captureGoal: 3, solvedCount: 4, questionGoal: 5,
          elapsedSeconds: 75, targetSeconds: 120, score: 80,
          targetScore: 130, clearMode: "either",
        },
        gate: { type: "gate-state", status: "active", solved: 1, required: 2 },
        players: [{ id: "one", nickname: "별빛토끼", connected: true, solvedCount: 3, downed: true }],
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<TeacherRoomPanel />);

    fireEvent.change(screen.getByLabelText("교사 접속키"), { target: { value: "teacher-secret" } });
    fireEvent.change(screen.getByLabelText("목표 점수", { selector: "#stage1-score" }), { target: { value: "130" } });
    fireEvent.change(screen.getByLabelText("다음 스테이지 조건", { selector: "#stage1-mode" }), { target: { value: "either" } });
    for (const table of [2, 7, 19]) fireEvent.click(screen.getByRole("checkbox", { name: `${table}단` }));
    fireEvent.click(screen.getByRole("checkbox", { name: /나눗셈도 출제/ }));
    fireEvent.click(screen.getByRole("button", { name: "새 방 열기" }));

    expect(await screen.findByText("012345")).toBeVisible();
    expect(await screen.findByText("별빛토끼")).toBeVisible();
    expect(screen.getByText("2")).toBeVisible();
    expect(screen.getByText("정답 3개 · 구출 대기")).toBeVisible();
    expect(screen.getByText("친구 구출")).toBeVisible();
    expect(screen.getByText("현재 쓰러짐")).toBeVisible();
    expect(screen.getByText(/세트 1 · 스테이지 1 진행 중 · 포획 2개 · 팀 정답 4개/)).toBeVisible();
    expect(screen.getByText(/설정 · 1단계 120초\/130점 \(하나\)/)).toBeVisible();
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).settings.stage1).toMatchObject({ targetScore: 130, clearMode: "either" });
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).settings.stage2).not.toHaveProperty("targetScore");
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).settings.stage3).not.toHaveProperty("targetScore");
    expect(screen.getByText(/3단계 90초\/180점/)).toBeVisible();
    expect(screen.getByText(/문제 · 1학년 · 2단·7단·19단/)).toBeVisible();
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).settings.multiplicationTables).toEqual([2, 7, 19]);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).settings.divisionEnabled).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).settings.grade).toBe(1);
    expect(screen.getByText(/팀 수학 관문 1\/2조각/)).toBeVisible();
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
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).settings.multiplicationTables).toEqual([]);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).settings.divisionEnabled).toBe(false);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).settings.grade).toBe(1);
    expect(screen.getByLabelText("교사 접속키")).toHaveValue("");
  });

  it.each([
    [1, "20 이내 덧셈·뺄셈·수 비교"], [2, "100 이내 덧셈·뺄셈"], [3, "1,000 이내 덧셈·뺄셈"],
    [4, "10,000 이내 덧셈·뺄셈"], [5, "평균·직사각형 넓이"], [6, "백분율·직육면체 부피"],
  ] as const)(
    "%i학년을 선택하면 %s 문항군으로 방을 연다", async (grade, summary) => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(Response.json({ roomCode: "123456" }))
        .mockResolvedValue(Response.json({
          settings: {
            grade, multiplicationTables: [], divisionEnabled: false,
            stage1: { targetSeconds: 120, targetScore: 100, clearMode: "both" },
            stage2: { targetSeconds: 150, targetScore: 150, clearMode: "both" },
            stage3: { targetSeconds: 90, targetScore: 180, clearMode: "both" },
          },
          players: [], bossRuns: [],
        }));
      vi.stubGlobal("fetch", fetchMock);
      render(<TeacherRoomPanel />);
      fireEvent.change(screen.getByLabelText("교사 접속키"), { target: { value: "teacher-secret" } });
      fireEvent.change(screen.getByLabelText("학년 선택"), { target: { value: String(grade) } });
      fireEvent.click(screen.getByRole("button", { name: "새 방 열기" }));

      expect(await screen.findByText("123456")).toBeVisible();
      expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).settings.grade).toBe(grade);
      expect(await screen.findByText(new RegExp(`문제 · ${grade}학년 · ${summary}`))).toBeVisible();
    });

  it("접속키가 거절되면 시험 플레이로 이동하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "교사 접속키가 올바르지 않습니다." }, { status: 401 })));
    render(<TeacherRoomPanel />);
    fireEvent.change(screen.getByLabelText("교사 접속키"), { target: { value: "wrong-key" } });
    fireEvent.click(screen.getByRole("button", { name: "시험 플레이 시작" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("교사 접속키가 올바르지 않습니다.");
    expect(push).not.toHaveBeenCalled();
  });

  it("보스 기록을 최신순으로 보여주고 같은 인원끼리 최고 시간을 표시한다", async () => {
    window.history.replaceState(null, "", "/teacher?room=012345");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      players: [],
      bossRuns: [
        { setNumber: 1, playerCount: 2, elapsedSeconds: 80 },
        { setNumber: 2, playerCount: 2, elapsedSeconds: 65 },
        { setNumber: 3, playerCount: 3, elapsedSeconds: 50 },
      ],
    })));
    render(<TeacherRoomPanel />);

    const history = await screen.findByRole("list", { name: "협동 보스 기록" });
    const entries = Array.from(history.querySelectorAll("li"));
    expect(entries).toHaveLength(3);
    expect(entries[0]).toHaveTextContent("3세트 · 3명 · 50초");
    expect(entries[1]).toHaveTextContent("2세트 · 2명 · 65초");
    expect(entries[2]).toHaveTextContent("1세트 · 2명 · 80초");
    expect(entries[0]).toHaveTextContent("같은 인원 최고");
    expect(entries[1]).toHaveTextContent("같은 인원 최고");
    expect(entries[2]).not.toHaveTextContent("같은 인원 최고");
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
