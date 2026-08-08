import { expect, test } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "./test-user";
import { adminClient, deleteUserByEmail } from "./admin";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

// Địa chỉ riêng cho kịch bản đăng ký — có dấu thời gian để không đụng
// TEST_EMAIL (tài khoản cố định dùng chung cho các kịch bản khác trong file
// này, dựng ở global-setup.ts) và không trùng giữa các lần chạy.
const SIGNUP_EMAIL = `e2e-signup-${Date.now()}@test.local`;
const SIGNUP_PASSWORD = "e2e-signup-pass-12345";
const SIGNUP_DISPLAY_NAME = "Người đăng ký E2E";

test.afterAll(async () => {
  // Chỉ xoá đúng tài khoản do kịch bản đăng ký NÀY tạo ra, xác định qua
  // chính email của nó (deleteUserByEmail tra user_id trước rồi mới xoá
  // theo id đó). KHÔNG đụng TEST_EMAIL — global-teardown.ts lo phần đó —
  // và không đụng tài khoản thật nào khác trong bảng auth.users chung của
  // dự án (kể cả phulealali@gmail.com, chủ dự án).
  await deleteUserByEmail(adminClient(), SIGNUP_EMAIL);
});

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

test("đăng nhập đúng thì thấy 35 hoạt động, trong đó 20 dòng buổi học với buổi 1 mở, buổi 2 khoá, và buổi 1 có tên bài ngữ pháp", async ({
  page,
}) => {
  await login(page);

  // Lát 1c biến 20 buổi thành 35 hoạt động (buổi + ôn tập + kiểm tra) — mọi
  // dòng, bất kể loại, đều mang data-testid="lesson-row".
  const rows = page.getByTestId("lesson-row");
  await expect(rows).toHaveCount(35);

  // Chỉ đếm riêng dòng buổi học qua data-kind, không đếm mọi lesson-row nữa —
  // 20 buổi vẫn phải còn nguyên trong chuỗi 35 hoạt động.
  const lessonRows = page.locator('[data-kind="lesson"]');
  await expect(lessonRows).toHaveCount(20);
  await expect(lessonRows.nth(0)).toHaveAttribute("data-status", "available");
  await expect(lessonRows.nth(1)).toHaveAttribute("data-status", "locked");

  // Canh cửa cho ép kiểu `as unknown as LessonWithGrammar[]` trong
  // dashboard/page.tsx: nếu postgrest-js một ngày nào đó trả quan hệ nhúng
  // dạng mảng thay vì object đơn, `grammar_lessons?.title` sẽ undefined và ô
  // này render RỖNG. Assertion phải đọc đúng span chứa tên bài, không phải
  // toàn bộ text của dòng — dòng còn chứa nhãn trạng thái ("Sẵn sàng") nên
  // luôn "không rỗng" dù thiếu tên bài.
  await expect(lessonRows.nth(0)).toContainText("Buổi 1");
  const title = await lessonRows.nth(0).locator(".text-slate-600").innerText();
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

test("đăng ký không tự động đăng nhập, và đăng ký trùng email trả đúng thông điệp như lần đăng ký mới", async ({
  page,
}) => {
  await page.goto("/register");
  await page.fill('input[name="displayName"]', SIGNUP_DISPLAY_NAME);
  await page.fill('input[name="email"]', SIGNUP_EMAIL);
  await page.fill('input[name="password"]', SIGNUP_PASSWORD);
  await page.click('button[type="submit"]');

  // Đăng ký thành công KHÔNG được tự đưa thẳng vào /dashboard — đó chính là
  // nửa gây lộ kênh dò email của lỗi cũ.
  const firstMessage = page.getByTestId("auth-success");
  await expect(firstMessage).toBeVisible();
  const firstMessageText = await firstMessage.innerText();
  await expect(page).not.toHaveURL(/\/dashboard$/);

  // Chứng minh tài khoản THẬT SỰ được tạo: đăng nhập bằng đúng thông tin vừa
  // đăng ký phải vào được /dashboard.
  await page.goto("/login");
  await page.fill('input[name="email"]', SIGNUP_EMAIL);
  await page.fill('input[name="password"]', SIGNUP_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");

  // Đăng ký lại đúng địa chỉ vừa dùng. Đây là assertion ghim lỗi thật: trước
  // bản vá, nhánh "email đã tồn tại" (lỗi `user_already_exists`) trả
  // GENERIC_SIGNUP_ERROR còn nhánh "đăng ký mới thành công" tự đăng nhập rồi
  // redirect /dashboard — hai kết quả phân biệt được, để lộ email nào đã có
  // tài khoản. Sau bản vá, cả hai lần đăng ký phải trả CÙNG một thông điệp,
  // byte-for-byte, và không lần nào redirect /dashboard.
  await page.goto("/register");
  await page.fill('input[name="displayName"]', SIGNUP_DISPLAY_NAME);
  await page.fill('input[name="email"]', SIGNUP_EMAIL);
  await page.fill('input[name="password"]', SIGNUP_PASSWORD);
  await page.click('button[type="submit"]');

  const secondMessage = page.getByTestId("auth-success");
  await expect(secondMessage).toBeVisible();
  await expect(secondMessage).toHaveText(firstMessageText);
  await expect(page).not.toHaveURL(/\/dashboard$/);
});
