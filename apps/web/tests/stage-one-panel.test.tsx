// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StageClearOverlay, StageOnePanel } from "../src/components/StageOnePanel";

afterEach(cleanup);

const active = {
  type: "stage" as const,
  stage: 1 as const,
  status: "active" as const,
  capturedCount: 1,
  captureGoal: 2,
  solvedCount: 3,
  questionGoal: 4,
  elapsedSeconds: 75,
  targetSeconds: 120 as const,
};

describe("일반 스테이지 1 화면", () => {
  it("팀의 두 목표와 경과 시간을 간결하게 보여준다", () => {
    render(<StageOnePanel stage={active} />);
    expect(screen.getByText("거품 포획 1/2")).toBeVisible();
    expect(screen.getByText("팀 정답 3/4")).toBeVisible();
    expect(screen.getByText("시간 1:15 / 목표 2:00")).toBeVisible();
  });

  it("클리어 후에는 결과와 다음 단계 안내를 보여준다", () => {
    render(<StageClearOverlay stage={{ ...active, status: "cleared", capturedCount: 2, solvedCount: 4 }} />);
    expect(screen.getByLabelText("첫 스테이지 클리어")).toBeVisible();
    expect(screen.getByText("첫 스테이지 클리어!")).toBeVisible();
    expect(screen.getByText(/다음 스테이지는 후속 페이즈/)).toBeVisible();
  });
});
