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
  // Không dọn thì kịch bản đầu bấm LÀM BÀI để lại đúng một bài `in_progress`,
  // và kịch bản SAU gọi `batDauBaiThi` lần nữa sẽ vỡ ngay ở `insert` với lỗi
  // khoá trùng 23505 — đã đo thật khi chạy lần đầu. Xoá `assessments` là đủ
  // cho MỤC ĐÍCH này: `assessment_items.assessment_id` tham chiếu
  // `on delete cascade` (0003_user_state.sql), nên xoá theo tầng luôn.
  //
  // `word_mastery` dọn RIÊNG, thêm ở Task 6: kịch bản "trả lời sai hết..."
  // trả lời đủ 30 câu, mỗi câu ghi một dòng `word_mastery` qua
  // `applyWordMastery` (gọi trong `recordAnswer`) — cột này KHÔNG cascade
  // theo `assessments` (mastery của một từ độc lập với bài thi chứa nó, xem
  // chú thích `boBaiDangLam` ở `lib/exam/run.ts`), nên sống sót qua lượt xoá
  // `assessments` trên và RÒ sang `stats.spec.ts` chạy sau (đo thật: bài đó
  // kỳ vọng "chưa học gì" nhưng thấy 10 wrong-word rớt vào từ đây). Cùng
  // khuôn `word_mastery`/`grammar_mastery` mà `stats.spec.ts` đã tự dọn cho
  // chính nó.
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const u = data?.users.find((x) => x.email === TEST_EMAIL);
  if (u) {
    const delAssessments = await admin.from("assessments").delete().eq("user_id", u.id);
    if (delAssessments.error) throw delAssessments.error;
    const delWordMastery = await admin.from("word_mastery").delete().eq("user_id", u.id);
    if (delWordMastery.error) throw delWordMastery.error;
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

test("trả lời sai hết thì thấy điểm, trạng thái chưa đạt, và nút bổ túc", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  await page.goto("/vocab/learn/2");
  await page.getByTestId("exam-button").click();
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 1/30");

  // Luôn chọn phương án đầu: có câu trúng có câu trượt, nhưng chắc chắn
  // không đạt 24/30 — đủ để lộ ra nhánh chưa đạt.
  for (let n = 1; n <= 30; n++) {
    await expect(page.getByTestId("exam-tien-do")).toHaveText(`Câu ${n}/30`);
    await page.getByTestId("exam-option").first().click();
  }

  // `hangDoi` (ExamRunner.tsx) gửi 30 câu trả lời TUẦN TỰ — mỗi câu một vòng
  // mạng thật tới Supabase (~1s/câu đo được), không song song. Vòng lặp trên
  // đã lướt qua UI trong vài giây (setI không đợi mạng), nhưng hàng đợi phía
  // sau còn phải rút cạn hết rồi `nopBai` mới gọi được — có thể mất hơn
  // 5000ms mặc định của `expect`. Nới timeout CHO ĐÚNG khẳng định này (không
  // phải cắt bớt 30 câu để chạy nhanh hơn — bản bàn giao yêu cầu giữ nguyên
  // độ phủ) thay vì chỉ dựa vào `test.setTimeout` tổng, vốn không nới hạn của
  // riêng một lệnh `expect`.
  await expect(page).toHaveURL(/\/exam\/\d+\/ket-qua$/, { timeout: 60_000 });
  await expect(page.getByTestId("ket-qua-diem")).toBeVisible();
  await expect(page.getByTestId("ket-qua-bo-tuc")).toBeVisible();

  await page.getByTestId("ket-qua-bo-tuc").click();
  await expect(page).toHaveURL(/\/exam\/\d+$/);
  await expect(page.getByTestId("exam-option")).toHaveCount(4);
});

/* ───────────────── Yêu cầu C: khoá bẫy bài thi bỏ dở ───────────────── */
//
// `assessments_one_in_progress` (0010_phase2_reset.sql:73) chỉ cho MỖI NGƯỜI
// DÙNG một bài `in_progress` tại một thời điểm, không phân biệt buổi/loại.
// Người học bỏ dở một bài (đóng tab, rời trang mà không nộp) rồi bấm LÀM BÀI
// lại trước đây khiến `createVocabExam` đâm thẳng vào chỉ số đó (23505), và
// tấm chắn chung duy nhất bắt được lỗi đó là `src/app/(app)/error.tsx` —
// thông báo sai sự thật ("mất mạng") và nút "Thử lại" của nó chạy lại ĐÚNG
// hành động vừa vỡ, khoá người học ra khỏi MỌI bài thi vĩnh viễn. Hai kịch
// bản dưới đây khẳng định cả hai lối thoát: làm tiếp bài cũ, và bỏ hẳn để
// làm bài mới.

test("bỏ dở bài rồi bấm LÀM BÀI lại thì vào lại đúng bài cũ, không vỡ trang lỗi", async ({
  page,
}) => {
  await login(page);
  await page.goto("/vocab/learn/3");
  await page.getByTestId("exam-button").click();
  await expect(page).toHaveURL(/\/exam\/\d+$/);
  const idCu = page.url().match(/\/exam\/(\d+)$/)?.[1];
  expect(idCu).toBeTruthy();

  // Bỏ dở: rời trang thi mà KHÔNG nộp câu nào — y hệt đóng tab giữa chừng.
  await page.goto("/vocab/learn/3");
  await page.getByTestId("exam-button").click();

  // Phải vào lại ĐÚNG bài cũ (không insert bài mới đâm vào chỉ số một-phần),
  // và chắc chắn không phải trang lỗi chung — error.tsx không render
  // exam-option nào cả.
  await expect(page).toHaveURL(new RegExp(`/exam/${idCu}$`));
  await expect(page.getByTestId("exam-option")).toHaveCount(4);
});

test("bỏ bài bằng nút exam-bo-bai rồi làm bài mới thành công", async ({ page }) => {
  await login(page);
  await page.goto("/vocab/learn/4");
  await page.getByTestId("exam-button").click();
  await expect(page).toHaveURL(/\/exam\/\d+$/);

  await page.getByTestId("exam-bo-bai").click();
  await expect(page).toHaveURL(/\/vocab\/learn\/4$/);

  // Dựng bài MỚI thành công — chứng minh chỗ trống trong
  // assessments_one_in_progress đã thật sự được giải phóng (dòng cũ bị xoá),
  // không chỉ điều hướng đi nơi khác trong khi dòng in_progress cũ còn nguyên.
  await page.getByTestId("exam-button").click();
  await expect(page).toHaveURL(/\/exam\/\d+$/);
  await expect(page.getByTestId("exam-option")).toHaveCount(4);
});
