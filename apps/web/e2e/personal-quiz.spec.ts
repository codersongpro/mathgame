import { expect, test } from "@playwright/test";

test("교사가 방을 열고 학생이 터치 문제를 풀면 정답 수가 갱신된다", async ({ browser }) => {
  const teacher = await browser.newContext({ viewport: { width: 1_024, height: 600 } });
  const student = await browser.newContext({ viewport: { width: 800, height: 600 } });

  try {
    const teacherPage = await teacher.newPage();
    await teacherPage.goto("/teacher");
    await teacherPage.getByLabel("교사 접속키").fill("local-demo-key-strong-only-for-testing");
    await teacherPage.getByRole("button", { name: "새 방 열기" }).click();
    const code = (await teacherPage.locator(".teacher-room-code").textContent())?.trim();
    expect(code).toMatch(/^[0-9]{6}$/);

    const studentPage = await student.newPage();
    await studentPage.goto(`/play?room=${code}&nickname=별빛토끼`);
    await expect(studentPage.getByRole("region", { name: "나의 수학 문제" })).toBeVisible();
    const prompt = (await studentPage.locator(".quiz-prompt").textContent()) ?? "";
    const [left, operation, right] = prompt.split(" ");
    const answer = operation === "+" ? Number(left) + Number(right) : Number(left) - Number(right);
    const answerButton = studentPage.getByRole("button", { name: `답 ${answer}` });
    expect((await answerButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await answerButton.click();

    await expect(studentPage.getByText(/거품 발사가 빨라집니다/)).toBeVisible();
    await expect(teacherPage.getByText("정답 1개 · 접속 중")).toBeVisible();
    await studentPage.getByRole("button", { name: "다음 문제" }).click();
    await expect(studentPage.locator(".quiz-prompt")).not.toHaveText(prompt);
  } finally {
    await teacher.close();
    await student.close();
  }
});
