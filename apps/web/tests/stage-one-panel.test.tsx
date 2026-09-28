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
  targetSeconds: 120,
  score: 50,
  targetScore: 100,
  clearMode: "both" as const,
};

describe("일반 스테이지 1 화면", () => {
  it("팀의 두 목표와 경과 시간을 간결하게 보여준다", () => {
    render(<StageOnePanel stage={active} />);
    expect(screen.getByText("거품 포획 1개 · 팀 정답 3개")).toBeVisible();
    expect(screen.getByText("팀 점수 50/100점")).toBeVisible();
    expect(screen.getByText("버틴 시간 1:15 / 목표 2:00")).toBeVisible();
  });

  it("클리어 후에는 결과와 다음 단계 안내를 보여준다", () => {
    render(<StageClearOverlay stage={{ ...active, status: "cleared", capturedCount: 2, solvedCount: 4 }} />);
    expect(screen.getByLabelText("1스테이지 클리어")).toBeVisible();
    expect(screen.getByText("1스테이지 클리어!")).toBeVisible();
    expect(screen.getByText(/잠시 후 2스테이지/)).toBeVisible();
  });
});
