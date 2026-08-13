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

  // CẬP NHẬT Ở LÁT 2d (Task 4): `track-grammar` KHÔNG còn là placeholder
  // "Sắp có" — nó là một `<Link>` thật dẫn tới `/grammar`, cùng khuôn
  // `track-vocab` (xem `src/app/(app)/dashboard/page.tsx`). Đây là chữ "Sắp
  // có" CUỐI CÙNG của toàn app đã bị gỡ (mục tiêu ghi ở đầu thiết kế lát 2d).
  // Ở đây vẫn chỉ giữ phép kiểm HÌNH DẠNG — cả hai thẻ đều hiện VÀ không còn
  // chữ "Sắp có" — vì nội dung chi tiết của từng thẻ (số liệu, đường dẫn,
  // hành vi bấm vào) đã có phép kiểm riêng, sâu hơn "toBeVisible", trong
  // e2e/vocab.spec.ts (track-vocab) và e2e/grammar.spec.ts (track-grammar,
  // Task 4) — cùng lý do track-vocab không được kiểm sâu ở FILE NÀY.
  await expect(page.getByTestId("track-vocab")).toBeVisible();
  await expect(page.getByTestId("track-grammar")).toBeVisible();
  await expect(page.getByTestId("track-grammar")).not.toContainText("Sắp có");
});

// Task 14 (dashboard thật): quyết định XOÁ hẳn kịch bản "Học tiếp" từng bị
// skip ở đây, không viết lại tại chỗ. Lý do: dashboard thật không còn nút
// bấm một-phát-tới-buổi nào nữa — "Tiếp tục" giờ chỉ là DÒNG CHỮ gợi ý
// (data-testid="continue-hint"), không phải link hay nút (xem comment tại
// nextActivity trong progress.ts: "GỢI Ý, không phải luật"). Hành vi tương
// đương thật sự — từ dashboard đi đúng đường thì tới đúng Buổi 1 — giờ nằm ở
// e2e/vocab.spec.ts: kịch bản "dashboard dẫn sang trang từ vựng..." canh
// dòng gợi ý và cú bấm thẻ Từ vựng. vocab.spec.ts vốn đã an toàn cho việc
// này (afterEach dọn lesson_cursor theo user_id), còn auth.spec.ts thì không
// có hạ tầng dọn tương đương — đây vẫn là lý do KHÔNG viết lại tại chỗ.
//
// (Vòng soát cuối 2a — sửa câu đã lỗi thời ở đây: từng nói tiếp một kịch bản
// "canh quan hệ nhúng lessons(ordinal)" đi từ dòng gợi ý vào đúng buổi 1 và
// canh cả định dạng tiêu đề mới. Kịch bản đó đã bị XOÁ khỏi vocab.spec.ts
// (Vòng sửa 1, soát Task 14): quan hệ nhúng nó canh không còn trong mã nguồn
// — dashboard/page.tsx bỏ hẳn truy vấn `lesson_cursor` — nên không còn gì để
// một test "canh cửa". Phần định dạng tiêu đề "Nhóm N · Buổi M" còn giá trị
// thật thì vocab.spec.ts giữ lại dưới một tên đúng với thứ nó kiểm, không
// mượn danh "canh quan hệ nhúng" nữa; xem vocab.spec.ts dòng ~474-487.)

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
