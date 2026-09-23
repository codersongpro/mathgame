import { expect, test } from "@playwright/test";

test("열 명이 같은 방에서 한 학생의 이동을 함께 본다", async ({ browser }) => {
  const room = "C7K9Q2";
  const contexts = await Promise.all(
    Array.from({ length: 10 }, () => browser.newContext({ viewport: { width: 1_024, height: 600 } })),
  );

  try {
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    await Promise.all(
      pages.map((page, index) =>
        page.goto(`/play?room=${room}&nickname=학생${String(index + 1).padStart(2, "0")}`),
      ),
    );
    await Promise.all(
      pages.map((page) => expect(page.getByTestId("roster-count")).toHaveText("10/10")),
    );

    const observer = pages[1];
    const mover = pages[0];
    if (!observer || !mover) throw new Error("검증용 브라우저가 없습니다.");
    const observedMover = observer.locator('[data-nickname="학생01"]');
    const observedSelf = observer.locator('[data-nickname="학생02"]');
    const moverXBefore = Number(await observedMover.getAttribute("data-x"));
    const observerXBefore = Number(await observedSelf.getAttribute("data-x"));

    await mover.getByRole("button", { name: "오른쪽으로 이동" }).dispatchEvent("pointerdown", {
      pointerId: 1,
    });
    await mover.waitForTimeout(600);
    await mover.getByRole("button", { name: "오른쪽으로 이동" }).dispatchEvent("pointerup", {
      pointerId: 1,
    });

    await expect
      .poll(async () => Number(await observedMover.getAttribute("data-x")))
      .toBeGreaterThan(moverXBefore);
    expect(Number(await observedSelf.getAttribute("data-x"))).toBe(observerXBefore);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
