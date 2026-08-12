import { expect, test, type Page } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "./test-user";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

test("trang 1 hiện ảnh và nói rõ cả số in trên sách", async ({ page }) => {
  await login(page);
  await page.goto("/doc-sach/1");

  await expect(page.getByTestId("book-label")).toHaveText("Trang 1/112 · sách in: 2");

  // Không chỉ kiểm tra thẻ <img> có mặt — ảnh hỏng vẫn là một thẻ <img> có
  // mặt. naturalWidth > 0 là bằng chứng trình duyệt đã tải và giải mã thật.
  const img = page.getByTestId("book-image");
  await expect(img).toBeVisible();
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
});

test("nút Sau đi tới trang kế, nút Trước tắt ở trang đầu", async ({ page }) => {
  await login(page);
  await page.goto("/doc-sach/1");

  await expect(page.getByTestId("book-prev")).toBeDisabled();
  await page.getByTestId("book-next").click();

  await expect(page).toHaveURL(/\/doc-sach\/2$/);
  await expect(page.getByTestId("book-label")).toHaveText("Trang 2/112 · sách in: 3");
});

test("nút Sau tắt ở trang cuối", async ({ page }) => {
  await login(page);
  await page.goto("/doc-sach/112");

  await expect(page.getByTestId("book-label")).toHaveText("Trang 112/112 · sách in: 113");
  await expect(page.getByTestId("book-next")).toBeDisabled();
  await expect(page.getByTestId("book-prev")).toBeEnabled();
});

test("số trang ngoài dải trả 404", async ({ page }) => {
  await login(page);
  const res = await page.goto("/doc-sach/113");
  expect(res?.status()).toBe(404);
});

test("/doc-sach không kèm số thì về trang 1", async ({ page }) => {
  await login(page);
  await page.goto("/doc-sach");
  await expect(page).toHaveURL(/\/doc-sach\/1$/);
});

test("link ở header tới được trang đọc sách", async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByTestId("book-link").click();

  await expect(page).toHaveURL(/\/doc-sach\/1$/);
});

test("nhảy thẳng tới số trang đã nhập", async ({ page }) => {
  await login(page);
  await page.goto("/doc-sach/1");

  await page.getByTestId("book-jump-input").fill("50");
  await page.getByTestId("book-jump-submit").click();

  await expect(page).toHaveURL(/\/doc-sach\/50$/);
  await expect(page.getByTestId("book-label")).toHaveText("Trang 50/112 · sách in: 51");
});

test("số trang không hợp lệ thì báo tại chỗ, không điều hướng", async ({ page }) => {
  await login(page);
  await page.goto("/doc-sach/5");

  await page.getByTestId("book-jump-input").fill("999");
  await page.getByTestId("book-jump-submit").click();

  await expect(page.getByTestId("book-jump-error")).toBeVisible();
  await expect(page).toHaveURL(/\/doc-sach\/5$/);
});

test("phím mũi tên lật trang", async ({ page }) => {
  await login(page);
  await page.goto("/doc-sach/5");

  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/doc-sach\/6$/);

  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(/\/doc-sach\/5$/);
});

test("phím mũi tên không cướp phím khi đang gõ vào ô số trang", async ({ page }) => {
  await login(page);
  await page.goto("/doc-sach/5");

  await page.getByTestId("book-jump-input").click();
  await page.keyboard.press("ArrowRight");

  // Vẫn ở trang 5: mũi tên lúc này là để di chuyển con trỏ trong ô nhập.
  await expect(page).toHaveURL(/\/doc-sach\/5$/);
});
