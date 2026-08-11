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
  // dự án, kể cả tài khoản thật của chủ dự án (không ghi địa chỉ thật ở đây;
  // mọi ví dụ email trong bộ test này đều theo quy ước `@test.local`).
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

test("đăng nhập đúng thì thấy hai thẻ chọn lộ trình: từ vựng và ngữ pháp", async ({
  page,
}) => {
  await login(page);

  // Task 14 dựng dashboard thật: track-vocab nay là một <Link> có số liệu
  // (X/10 nhóm) và dòng "Tiếp tục" (data-testid="continue-hint"), còn
  // track-grammar vẫn là placeholder "Sắp có" (lộ trình ngữ pháp thuộc lát
  // 2c). Ở đây chỉ giữ phép kiểm HÌNH DẠNG — cả hai thẻ đều hiện — vì nội
  // dung chi tiết của track-vocab (số liệu, dòng gợi ý, đường dẫn) đã có
  // phép kiểm riêng, sâu hơn "toBeVisible", trong e2e/vocab.spec.ts.
  await expect(page.getByTestId("track-vocab")).toBeVisible();
  await expect(page.getByTestId("track-grammar")).toBeVisible();
});

// Task 14 (dashboard thật): quyết định XOÁ hẳn kịch bản "Học tiếp" từng bị
// skip ở đây, không viết lại tại chỗ. Lý do: dashboard thật không còn nút
// bấm một-phát-tới-buổi nào nữa — "Tiếp tục" giờ chỉ là DÒNG CHỮ gợi ý
// (data-testid="continue-hint"), không phải link hay nút (xem comment tại
// nextActivity trong progress.ts: "GỢI Ý, không phải luật"). Hành vi tương
// đương thật sự — từ dashboard đi đúng đường thì tới đúng Buổi 1, với đúng
// tiêu đề trang học — giờ nằm ở e2e/vocab.spec.ts: kịch bản "dashboard dẫn
// sang trang từ vựng..." canh dòng gợi ý và cú bấm thẻ Từ vựng, còn kịch bản
// canh quan hệ nhúng lessons(ordinal) đi tiếp từ đó vào đúng buổi 1 và canh
// cả định dạng tiêu đề mới ("Nhóm 1 · Buổi 1", khác "Buổi 1" của bản cũ).
// Viết lại một bản rút gọn ngay tại đây chỉ lặp lại đúng các bước đó — và
// vocab.spec.ts vốn đã an toàn cho việc này (afterEach dọn lesson_cursor
// theo user_id), còn auth.spec.ts thì không có hạ tầng dọn tương đương.

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
