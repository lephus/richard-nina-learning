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
  if (error) throw error;
  const u = data?.users.find((x) => x.email === TEST_EMAIL);
  if (u) {
    // Mỗi lượt xoá đọc `error` riêng và ném ngay: nuốt lỗi ở một trong ba
    // lượt để lại tiến độ rò sang kịch bản kế tiếp.
    const delCursor = await admin.from("lesson_cursor").delete().eq("user_id", u.id);
    if (delCursor.error) throw delCursor.error;
    const delNotes = await admin.from("word_notes").delete().eq("user_id", u.id);
    if (delNotes.error) throw delNotes.error;
    const delMastery = await admin.from("word_mastery").delete().eq("user_id", u.id);
    if (delMastery.error) throw delMastery.error;
  }
});

test("trang từ vựng liệt kê đúng 10 nhóm, mỗi nhóm 3 hoạt động", async ({ page }) => {
  await login(page);
  await page.getByTestId("vocab-link").click();
  await page.waitForURL("**/vocab");

  await expect(page.getByTestId("group-row")).toHaveCount(10);
  await expect(page.getByTestId("activity")).toHaveCount(30);
  await expect(page.getByTestId("group-summary")).toHaveText("0/10 nhóm hoàn thành");
});

test("nhóm 1 hiện đúng phạm vi từ", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await expect(page.getByTestId("group-row").first()).toContainText("NHÓM 1 · từ 1–60");
});

test("vào thẳng nhóm 7 khi chưa học nhóm nào — không còn khoá", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");

  const nhom7 = page.getByTestId("group-row").filter({ hasText: "NHÓM 7" });
  await nhom7.getByTestId("activity").first().click();

  await page.waitForURL("**/vocab/learn/**");
  await expect(page.getByTestId("deck-position")).toBeVisible();
});

test("đi tới rồi lui giữa các thẻ", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await expect(page.getByTestId("deck-position")).toHaveText("Từ 1 / 30");
  await expect(page.getByTestId("prev-button")).toBeDisabled();

  const tu1 = await page.getByTestId("card-word").textContent();

  await page.getByTestId("next-button").click();
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 2 / 30");
  await expect(page.getByTestId("card-word")).not.toHaveText(tu1!);

  await page.getByTestId("prev-button").click();
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 1 / 30");
  await expect(page.getByTestId("card-word")).toHaveText(tu1!);
});

test("phím mũi tên cũng chuyển thẻ", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 2 / 30");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 1 / 30");
});

test("câu ví dụ đã điền lại, không còn dấu gạch trống", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await expect(page.getByTestId("card-example")).not.toContainText("___");
});

test("mục lục liệt kê 30 từ và nhảy thẳng tới từ được bấm", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await expect(page.getByTestId("index-item")).toHaveCount(30);

  const muc20 = page.getByTestId("index-item").nth(19);
  const chu20 = (await muc20.textContent())!.replace(/^\s*20\s*/, "").trim();

  await muc20.click();
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 20 / 30");
  await expect(page.getByTestId("card-word")).toHaveText(chu20);
});

test("mục lục đánh dấu từ đang xem", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await expect(page.getByTestId("index-item").first()).toHaveAttribute("aria-current", "true");
  await page.getByTestId("next-button").click();
  await expect(page.getByTestId("index-item").nth(1)).toHaveAttribute("aria-current", "true");
});
