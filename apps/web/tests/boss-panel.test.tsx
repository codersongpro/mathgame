// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BossPanel } from "../src/components/BossPanel";
import { StageClearOverlay } from "../src/components/StageOnePanel";

afterEach(cleanup);

describe("첫 보스전 화면", () => {
  it("체력·방어막·팀 시간을 태블릿 화면에 문자로 보여준다", () => {
    const { rerender } = render(<BossPanel boss={{
      type: "boss-state", setNumber: 1, status: "active", health: 8, maxHealth: 10,
      shielded: true, elapsedSeconds: 75, playerCount: 2,
    }} />);
    expect(screen.getByText("세트 1 · 혼돈의 큐브왕")).toBeVisible();
    expect(screen.getByText("체력 8/10")).toBeVisible();
    expect(screen.getByText(/방어막 ON/)).toBeVisible();
    expect(screen.getByText(/1:15 · 2명/)).toBeVisible();
    rerender(<BossPanel boss={{
      type: "boss-state", setNumber: 1, status: "active", health: 8, maxHealth: 10,
      shielded: false, elapsedSeconds: 76, playerCount: 2,
    }} />);
    expect(screen.getByText(/방어막 OFF/)).toBeVisible();
  });

  it("보스 클리어에는 팀 타임어택 결과를 표시한다", () => {
    render(<StageClearOverlay stage={{
      type: "stage", setNumber: 1, stage: 4, status: "cleared", capturedCount: 0,
      captureGoal: 1, solvedCount: 2, questionGoal: 2,
      elapsedSeconds: 87, targetSeconds: 240, score: 120,
      targetScore: 120, clearMode: "both",
    }} />);
    expect(screen.getByLabelText("보스전 클리어")).toBeVisible();
    expect(screen.getByText("팀 타임어택 1:27")).toBeVisible();
    expect(screen.getByText(/세트 2의 일반 스테이지 1/)).toBeVisible();
  });
});
