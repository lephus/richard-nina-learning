import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TEST_EMAIL, TEST_PASSWORD } from "./test-user";
import { adminClient } from "./admin";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

/** Id của tài khoản test dùng chung — tra qua email, không hard-code. */
async function getUserId(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const u = data.users.find((x) => x.email === TEST_EMAIL);
  if (!u) throw new Error("không tìm thấy tài khoản test — global-setup chưa chạy?");
  return u.id;
}

test.afterEach(async () => {
  // Dọn tiến độ/bài đánh giá của CHÍNH tài khoản test, không đụng ai khác —
  // đúng khuôn assessment.spec.ts. Chỉ theo user_id của tài khoản dùng chung,
  // không bao giờ rộng hơn — đây là tài khoản Supabase thật của chủ dự án,
  // không phải một môi trường test tách biệt.
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const u = data?.users.find((x) => x.email === TEST_EMAIL);
  if (u) {
    // Mỗi lượt xoá đọc `error` riêng và ném ngay — nuốt lỗi ở đây thì dòng
    // còn sót lại rò sang kịch bản kế tiếp mà `afterEach` vẫn báo "xong".
    const delAssessments = await admin.from("assessments").delete().eq("user_id", u.id);
    if (delAssessments.error) throw delAssessments.error;
    const delWord = await admin.from("word_mastery").delete().eq("user_id", u.id);
    if (delWord.error) throw delWord.error;
    const delGrammar = await admin.from("grammar_mastery").delete().eq("user_id", u.id);
    if (delGrammar.error) throw delGrammar.error;
    const delProgress = await admin.from("user_lesson_progress").delete().eq("user_id", u.id);
    if (delProgress.error) throw delProgress.error;
  }
});

/* ─────────────────────── Ba kịch bản trang /stats ─────────────────────── */

test("tài khoản chưa học gì vào /stats không thấy trang vỡ", async ({ page }) => {
  // Kịch bản quan trọng nhất: trạng thái rỗng là thứ một người dùng thật gặp
  // NGAY LẦN ĐẦU vào trang này, và là chỗ dễ vỡ nhất (chia cho 0, .map trên
  // mảng rỗng, v.v.). Không seed gì cả — afterEach của kịch bản chạy trước đã
  // dọn sạch, nên đây đúng là trạng thái "chưa học gì".
  await login(page);
  await page.goto("/stats");

  // Khẳng định DƯƠNG TÍNH trang thật sự đã render, không phải một error
  // boundary: tiêu đề trang VÀ câu mời làm bài ôn tập đầu tiên (do
  // ScoreChart hiện khi series rỗng) đều phải thấy được. Chỉ đếm "0 score-bar"
  // không đủ — một trang lỗi cũng có 0 score-bar.
  await expect(page.getByRole("heading", { name: "Thống kê học tập" })).toBeVisible();
  await expect(page.getByText("Làm bài ôn tập đầu tiên")).toBeVisible();

  await expect(page.getByTestId("stats-mastered")).toHaveText("0 / 605");
  await expect(page.getByTestId("score-bar")).toHaveCount(0);
  await expect(page.getByTestId("wrong-word")).toHaveCount(0);
});

test("có dữ liệu thì hiện đúng số — đếm cột mastered, không suy lại từ ngưỡng", async ({ page }) => {
  const admin = adminClient();
  const userId = await getUserId(admin);

  // Ba dòng word_mastery, CỐ Ý đảo ngược so với suy luận ngây thơ từ
  // (correct_count - wrong_count) >= MASTERY_THRESHOLD (= 3, xem
  // src/lib/mastery/apply.ts) — vocabProgress() ĐÚNG phải đếm thẳng cột
  // `mastered`, không suy lại ngưỡng đó (xem comment tại compute.ts). Nếu một
  // hồi quy nào đó lỡ suy lại ngưỡng, tổng "đã thuộc" sẽ ra 1 (chỉ w3 có
  // diff >= 3), không phải 2 như cột `mastered` thật sự nói:
  //  - w1: mastered=true nhưng diff = 1-0 = 1 (< 3) — suy ngây thơ nói SAI.
  //  - w2: mastered=true nhưng diff = 2-0 = 2 (< 3) — suy ngây thơ nói SAI.
  //  - w3: mastered=false nhưng diff = 8-4 = 4 (>= 3) — suy ngây thơ nói SAI
  //    ở CHIỀU NGƯỢC LẠI. w3 cũng là dòng DUY NHẤT có wrong_count > 0 (= 4,
  //    cố ý khác 1 để không trùng một giá trị mặc định hay bị gán nhầm), nên
  //    là wrong-word DUY NHẤT mong đợi.
  const { error: wordMasteryErr } = await admin.from("word_mastery").insert([
    { user_id: userId, word_id: 1, correct_count: 1, wrong_count: 0, mastered: true },
    { user_id: userId, word_id: 2, correct_count: 2, wrong_count: 0, mastered: true },
    { user_id: userId, word_id: 3, correct_count: 8, wrong_count: 4, mastered: false },
  ]);
  if (wordMasteryErr) throw wordMasteryErr;

  // Một bài đánh giá ĐÃ NỘP — status khác 'in_progress' bắt buộc, vì
  // assessments chỉ cho phép MỘT dòng 'in_progress' mỗi người dùng (chỉ số
  // một-phần ở migration 0007); seed 'submitted' tránh thẳng bẫy đó.
  const now = new Date().toISOString();
  const { error: assessmentErr } = await admin.from("assessments").insert({
    user_id: userId,
    type: "review",
    scope: [1, 2],
    status: "submitted",
    score: 88, // cố ý không phải 0 hay 100 — hai giá trị dễ trùng mặc định
    passed: true,
    started_at: now,
    expires_at: now,
    submitted_at: now,
  });
  if (assessmentErr) throw assessmentErr;

  await login(page);
  await page.goto("/stats");

  await expect(page.getByTestId("stats-mastered")).toHaveText("2 / 605");

  const scoreBars = page.getByTestId("score-bar");
  await expect(scoreBars).toHaveCount(1);
  await expect(scoreBars.first()).toHaveAttribute("data-passed", "true");
  // Ghim đúng GIÁ TRỊ score = 88 (không chỉ "có cột, đã pass") — ScoreChart
  // chỉ render con số điểm ra DOM qua thuộc tính title.
  await expect(scoreBars.first()).toHaveAttribute("title", "88%");

  await expect(page.getByTestId("wrong-word")).toHaveCount(1);
});

test("link ở header tới được /stats", async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByTestId("stats-link").click();

  await expect(page).toHaveURL(/\/stats$/);
  await expect(page.getByRole("heading", { name: "Thống kê học tập" })).toBeVisible();
});
