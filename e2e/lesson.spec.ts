import { expect, test, type Page } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "./test-user";
import { adminClient } from "./admin";

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

test.afterEach(async () => {
  // Dọn tiến độ của CHÍNH tài khoản test, không đụng ai khác.
  const admin = adminClient();
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users.find((x) => x.email === TEST_EMAIL);
  if (u) {
    await admin.from("word_mastery").delete().eq("user_id", u.id);
    await admin.from("user_lesson_progress").delete().eq("user_id", u.id);
  }
});

test("mở buổi 1 thì thấy thẻ từ đầu tiên", async ({ page }) => {
  await login(page);
  await page.getByTestId("continue-link").click();
  await expect(page.getByTestId("learn-heading")).toHaveText("Buổi 1");
  await expect(page.getByTestId("flashcard-word")).toBeVisible();
  await expect(page.getByTestId("lesson-progress")).toHaveText("1 / 135");
});

test("trả lời một câu thì phản hồi hiện ngay", async ({ page }) => {
  await login(page);
  await page.getByTestId("continue-link").click();

  // Đi qua 10 thẻ gặp từ để tới câu trắc nghiệm đầu tiên.
  for (let i = 0; i < 10; i++) {
    await page.getByTestId("next-button").click();
    await expect(page.getByTestId("lesson-progress")).toHaveText(`${i + 2} / 135`);
  }

  await page.getByTestId("choice-option").first().click();
  const fb = page.getByTestId("answer-feedback");
  await expect(fb).toBeVisible();
  await expect(fb).toHaveAttribute("data-correct", /true|false/);
});

test("tải lại giữa buổi thì quay đúng vị trí đang dở", async ({ page }) => {
  await login(page);
  await page.getByTestId("continue-link").click();

  for (let i = 0; i < 3; i++) {
    await page.getByTestId("next-button").click();
    await expect(page.getByTestId("lesson-progress")).toHaveText(`${i + 2} / 135`);
  }

  await page.reload();
  await expect(page.getByTestId("lesson-progress")).toHaveText("4 / 135");
});
