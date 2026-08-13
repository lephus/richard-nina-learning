import { expect, test, type Page } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "./test-user";
import { adminClient } from "./admin";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

test.afterEach(async () => {
  // Dọn bài thi của CHÍNH tài khoản test, đúng khuôn `stats.spec.ts` —
  // KHÔNG có trong bản brief gốc, nhưng bắt buộc: mỗi người dùng chỉ được
  // MỘT dòng `assessments.status = 'in_progress'` tại một thời điểm (chỉ số
  // một-phần `assessments_one_in_progress`, 0007_assessment_parent.sql).
  // Không dọn thì kịch bản đầu bấm LÀM BÀI để lại đúng một bài `in_progress`
  // (không có kịch bản nào trong tệp này trả lời hết 30 câu để bài tự
  // chuyển 'submitted'), và kịch bản SAU gọi `batDauBaiThi` lần nữa sẽ vỡ
  // ngay ở `insert` với lỗi khoá trùng 23505 — đã đo thật khi chạy lần đầu.
  // Xoá `assessments` là đủ: `assessment_items.assessment_id` tham chiếu
  // `on delete cascade` (0003_user_state.sql), nên xoá theo tầng luôn.
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const u = data?.users.find((x) => x.email === TEST_EMAIL);
  if (u) {
    const delAssessments = await admin.from("assessments").delete().eq("user_id", u.id);
    if (delAssessments.error) throw delAssessments.error;
  }
});

test("bấm LÀM BÀI vào thẳng bài thi, không còn trang sắp có", async ({ page }) => {
  await login(page);
  await page.goto("/vocab/learn/1");
  await page.getByTestId("exam-button").click();

  await expect(page).toHaveURL(/\/exam\/\d+$/);
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 1/30");
  await expect(page.getByTestId("exam-option")).toHaveCount(4);
});

test("bấm một đáp án là sang câu sau ngay", async ({ page }) => {
  await login(page);
  await page.goto("/vocab/learn/1");
  await page.getByTestId("exam-button").click();
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 1/30");

  // Đợi đúng response gửi đáp án này trước khi kịch bản kết thúc: `chon()`
  // sang câu kế NGAY, không đợi mạng (đúng thiết kế "bấm nhanh hơn mạng"),
  // nhưng `afterEach` ngay trên xoá `assessments` của tài khoản test SAU MỖI
  // kịch bản. Không đợi thì lệnh xoá đó có thể chạy trước khi request
  // `traLoi()` còn đang bay tới nơi — `recordAnswer` đọc `assessment_items`
  // của một bài vừa bị xoá giữa chừng, ném `PGRST116` (đã tái hiện thật khi
  // chạy lần đầu). Không làm hỏng kịch bản nào (server chỉ log lỗi), nhưng là
  // nhiễu tự gây ra — cùng khuôn `vocab.spec.ts` đợi response trước khi rời
  // trang/dọn dẹp.
  const guiDapAn = page.waitForResponse((r) => r.request().method() === "POST");
  await page.getByTestId("exam-option").first().click();

  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 2/30");
  await guiDapAn;
});

test("trang sắp có cũ không còn tồn tại", async ({ page }) => {
  await login(page);
  const res = await page.goto("/vocab/learn/1/sap-co");
  expect(res?.status()).toBe(404);
});
