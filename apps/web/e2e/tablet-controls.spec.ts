import { expect, test, type Page } from "@playwright/test";

async function expectControlsInsideViewport(page: Page) {
  await expect(page.getByTestId("game-canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "왼쪽으로 이동" })).toBeVisible();
  await expect(page.getByRole("button", { name: "오른쪽으로 이동" })).toBeVisible();
  await expect(page.getByRole("button", { name: "점프" })).toBeVisible();

  const layout = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
}

test("태블릿 크기와 회전 뒤에도 캔버스와 터치 조작이 보인다", async ({ page }) => {
  await page.setViewportSize({ width: 1_024, height: 600 });
  await page.goto("/play?room=702845&nickname=별빛토끼");
  await expectControlsInsideViewport(page);

  await page.setViewportSize({ width: 800, height: 600 });
  await expectControlsInsideViewport(page);

  await page.setViewportSize({ width: 600, height: 800 });
  await expectControlsInsideViewport(page);

  await page.setViewportSize({ width: 800, height: 600 });
  await expectControlsInsideViewport(page);
});
