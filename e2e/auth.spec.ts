import { expect, test } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "./test-user";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

test("chưa đăng nhập vào /dashboard thì bị đẩy về /login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test("đăng nhập sai thì báo lỗi và vẫn ở /login", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', "mat-khau-sai-hoan-toan");
  await page.click('button[type="submit"]');

  await expect(page.getByTestId("auth-error")).toHaveText("Email hoặc mật khẩu không đúng.");
  await expect(page).toHaveURL(/\/login$/);
});

test("đăng nhập đúng thì thấy 20 buổi, buổi 1 mở, buổi 2 khoá, và buổi 1 có tên bài ngữ pháp", async ({
  page,
}) => {
  await login(page);

  const rows = page.getByTestId("lesson-row");
  await expect(rows).toHaveCount(20);
  await expect(rows.nth(0)).toHaveAttribute("data-status", "available");
  await expect(rows.nth(1)).toHaveAttribute("data-status", "locked");

  // Canh cửa cho ép kiểu `as unknown as LessonWithGrammar[]` trong
  // dashboard/page.tsx: nếu postgrest-js một ngày nào đó trả quan hệ nhúng
  // dạng mảng thay vì object đơn, `grammar_lessons?.title` sẽ undefined và ô
  // này render RỖNG. Assertion phải đọc đúng span chứa tên bài, không phải
  // toàn bộ text của dòng — dòng còn chứa nhãn trạng thái ("Sẵn sàng") nên
  // luôn "không rỗng" dù thiếu tên bài.
  await expect(rows.nth(0)).toContainText("Buổi 1");
  const title = await rows.nth(0).locator(".text-slate-600").innerText();
  expect(title.trim().length).toBeGreaterThan(0);
});

test('bấm "Học tiếp" thì tới trang buổi 1', async ({ page }) => {
  await login(page);
  await page.getByTestId("continue-link").click();
  await expect(page.getByTestId("learn-heading")).toHaveText("Buổi 1");
});

test("đăng xuất rồi quay lại /dashboard thì bị đẩy về /login", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await page.waitForURL("**/login");

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
