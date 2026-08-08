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
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  // Nuốt lỗi ở đây thì `u` luôn undefined, không xoá gì, và afterEach báo
  // thành công giả trong khi tiến độ buổi trước vẫn còn — rò sang kịch bản
  // kế tiếp. Cùng lý do với deleteTestUser trong ./admin.
  if (error) throw error;
  const u = data?.users.find((x) => x.email === TEST_EMAIL);
  if (u) {
    await admin.from("word_mastery").delete().eq("user_id", u.id);
    // grammar_mastery nay ĐƯỢC GHI thật (applyMastery có nhánh ngữ pháp), nên
    // phải dọn cùng chỗ với hai bảng kia — vẫn chỉ theo user_id của tài khoản
    // test, không đụng ai khác.
    await admin.from("grammar_mastery").delete().eq("user_id", u.id);
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
  // 11 thao tác, mỗi thao tác là một round-trip thật. Trên localhost vừa đủ
  // 30s mặc định, nhưng khi chạy với PLAYWRIGHT_BASE_URL trỏ tới Vercel thì
  // mỗi vòng chậm hơn đáng kể và kịch bản này vượt ngân sách — dù chính tính
  // năng đó vẫn chạy đúng (kịch bản vị trí 30 làm nhiều hơn hẳn và vẫn xanh).
  test.setTimeout(90_000);

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

test("câu điền từ ở vị trí 30 hiển thị đúng câu, không bị cắt lẻ ký tự", async ({ page }) => {
  // ~50 thao tác, mỗi thao tác chấm là một round-trip thật tới Supabase —
  // timeout mặc định 30s không đủ. Chỉnh riêng kịch bản này, không đụng
  // playwright.config.ts.
  test.setTimeout(90_000);

  await login(page);
  await page.getByTestId("continue-link").click();

  // 10 thẻ gặp từ (vị trí 0-9): bấm "Tiếp" một lần là qua ngay, không có
  // bước phản hồi vì thẻ gặp từ không được chấm.
  for (let i = 0; i < 10; i++) {
    await page.getByTestId("next-button").click();
    await expect(page.getByTestId("lesson-progress")).toHaveText(`${i + 2} / 135`);
  }

  // 20 câu luyện tập nghĩa/đồng nghĩa xen kẽ (vị trí 10-29): mỗi câu phải
  // chọn phương án rồi bấm "Tiếp" ở khối phản hồi mới thực sự sang câu kế —
  // khác thẻ gặp từ vì câu này có chấm điểm.
  for (let i = 0; i < 20; i++) {
    await page.getByTestId("choice-option").first().click();
    await expect(page.getByTestId("answer-feedback")).toBeVisible();
    await page.getByTestId("next-button").click();
    await expect(page.getByTestId("lesson-progress")).toHaveText(`${i + 12} / 135`);
  }

  // Vị trí 30 là câu điền từ đầu tiên của cụm 1 (itemAt: 10 thẻ + 20 luyện
  // tập rồi mới tới 10 câu điền).
  await expect(page.getByTestId("lesson-progress")).toHaveText("31 / 135");
  await expect(page.getByTestId("fill-input")).toBeVisible();

  // Đây là lớp phòng thủ cho lỗi từng lọt qua MỌI lớp kiểm thử khác trong lát
  // này: câu điền từ hiện dạng "___I___t___ ___i___s___…" — dấu gạch bị chèn
  // giữa từng ký tự. Chọn qua data-testid chứ không qua quan hệ DOM
  // (preceding-sibling::p[1]): thêm một thẻ <p> vào form là selector kia im
  // lặng trỏ nhầm phần tử, và lớp phòng thủ biến mất mà không ai biết.
  const sentence = await page.getByTestId("fill-sentence").innerText();

  const blanks = sentence.match(/___/g) ?? [];
  expect(blanks).toHaveLength(1);
});
