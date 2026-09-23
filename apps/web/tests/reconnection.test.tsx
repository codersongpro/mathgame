// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReconnectOverlay } from "../src/components/ReconnectOverlay";

afterEach(cleanup);

describe("재접속 안내", () => {
  it("재접속 중에는 마지막 화면 위에 진행 상태만 알린다", () => {
    render(<ReconnectOverlay state="reconnecting" />);

    expect(screen.getByText("연결을 다시 시도하고 있어요")).toBeVisible();
    expect(screen.queryByRole("link", { name: "로비로 돌아가기" })).not.toBeInTheDocument();
  });

  it("60초가 지나면 사용자가 선택할 수 있는 로비 복귀 버튼을 보여준다", () => {
    render(<ReconnectOverlay state="expired" />);

    expect(screen.getByText("방에 다시 참여해 주세요")).toBeVisible();
    expect(screen.getByRole("link", { name: "로비로 돌아가기" })).toHaveAttribute("href", "/");
  });
});
