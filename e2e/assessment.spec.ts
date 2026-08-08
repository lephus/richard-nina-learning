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

/**
 * Ghi thẳng `user_lesson_progress` cho các buổi trong `ordinals` thành
 * 'completed' — cùng cơ chế `afterEach` đang dùng, cắt thời gian từ hàng chục
 * phút (bấm qua 135 item/buổi) xuống một lượt ghi.
 */
async function completeLessons(
  admin: SupabaseClient,
  userId: string,
  ordinals: number[],
): Promise<void> {
  const { data: lessons, error } = await admin
    .from("lessons")
    .select("id, ordinal")
    .in("ordinal", ordinals);
  if (error) throw error;

  const rows = (lessons ?? []).map((l) => ({
    user_id: userId,
    lesson_id: l.id as number,
    status: "completed",
    position: 135,
    final_correct: 12,
    score: 80,
    completed_at: new Date().toISOString(),
  }));
  const { error: upsertErr } = await admin
    .from("user_lesson_progress")
    .upsert(rows, { onConflict: "user_id,lesson_id" });
  if (upsertErr) throw upsertErr;
}

/**
 * Ghi thẳng MỘT dòng `assessments` đã "đạt" — dùng để nhử `nextStep` đi qua
 * slot ôn tập mà không phải thật sự làm 25 câu. Không cần `assessment_items`:
 * dòng này không bao giờ được mở lại (đã `submitted`, `passed=true`).
 */
async function seedPassedReview(
  admin: SupabaseClient,
  userId: string,
  scope: number[],
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin.from("assessments").insert({
    user_id: userId,
    type: "review",
    scope,
    status: "submitted",
    score: 100,
    passed: true,
    started_at: now,
    expires_at: now,
    submitted_at: now,
  });
  if (error) throw error;
}

/** Buổi 1–4 xong, cả hai ôn tập đã đạt — đúng điều kiện để slot kế tiếp là bài kiểm tra(1–4). */
async function unlockTestSlot(admin: SupabaseClient, userId: string): Promise<void> {
  await completeLessons(admin, userId, [1, 2, 3, 4]);
  await seedPassedReview(admin, userId, [1, 2]);
  await seedPassedReview(admin, userId, [3, 4]);
}

/**
 * Bấm nút "Học tiếp" trên dashboard (đã điều hướng sẵn tới đó) và trả về id
 * bài đánh giá vừa tạo, đọc từ URL sau khi Server Action redirect xong.
 */
async function startFromDashboard(page: Page): Promise<number> {
  await page.getByTestId("continue-link").click();
  await page.waitForURL(/\/assessment\/\d+$/);
  const match = /\/assessment\/(\d+)$/.exec(page.url());
  if (!match) throw new Error(`không lấy được id bài đánh giá từ URL: ${page.url()}`);
  return Number(match[1]);
}

/** "04:59" → 299 (giây). */
function parseMmSs(text: string): number {
  const [m, s] = text.split(":").map(Number);
  return (m ?? 0) * 60 + (s ?? 0);
}

test.afterEach(async () => {
  // Dọn tiến độ/bài đánh giá của CHÍNH tài khoản test, không đụng ai khác —
  // cùng khuôn lesson.spec.ts, cộng thêm `assessments` (cascade xoá
  // `assessment_items` — xem 0003_user_state.sql:53 `on delete cascade`).
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const u = data?.users.find((x) => x.email === TEST_EMAIL);
  if (u) {
    await admin.from("assessments").delete().eq("user_id", u.id);
    await admin.from("user_lesson_progress").delete().eq("user_id", u.id);
    await admin.from("word_mastery").delete().eq("user_id", u.id);
    await admin.from("grammar_mastery").delete().eq("user_id", u.id);
  }
});

/* ─────────────────────── Ba kịch bản gốc của brief ─────────────────────── */

test("bắt đầu bài ôn tập và thấy câu đầu tiên", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = adminClient();
  const userId = await getUserId(admin);
  await completeLessons(admin, userId, [1, 2]);

  await login(page);
  await startFromDashboard(page);

  await expect(page.getByTestId("assessment-prompt")).toBeVisible();
  await expect(page.getByTestId("assessment-progress")).toHaveText("1 / 25");
});

test("đồng hồ bài kiểm tra còn đúng sau khi tải lại", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = adminClient();
  const userId = await getUserId(admin);
  await unlockTestSlot(admin, userId);

  await login(page);
  await startFromDashboard(page);

  const countdown = page.getByTestId("countdown");
  await expect(countdown).toBeVisible();
  const before = parseMmSs(await countdown.innerText());

  // Đợi ít nhất một giây thật để chắc chắn đồng hồ đã tích thêm ít nhất một
  // nấc trước khi so sánh — nếu không, tải lại quá nhanh có thể đọc lại đúng
  // giây cũ và phép so sánh "nhỏ hơn" trở nên vô nghĩa dù logic có đúng.
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(countdown).toBeVisible();
  const after = parseMmSs(await countdown.innerText());

  // Bằng chứng đồng hồ đọc từ `expires_at` (server) chứ không đếm lại từ lúc
  // mở trang: nếu nó đếm lại từ đầu mỗi lần tải trang, `after` sẽ bằng hệt
  // (hoặc lớn hơn) `before`, không bao giờ nhỏ hơn.
  expect(after).toBeLessThan(before);
  expect(after).toBeGreaterThan(0);
});

test("nộp bài rồi thấy điểm và kết quả", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = adminClient();
  const userId = await getUserId(admin);
  await completeLessons(admin, userId, [1, 2]);

  await login(page);
  await startFromDashboard(page);

  const progress = page.getByTestId("assessment-progress");
  for (let i = 0; i < 25; i++) {
    await page.getByTestId("choice-option").first().click();
    if (i < 24) await expect(progress).toHaveText(`${i + 2} / 25`);
  }
  await expect(progress).toHaveText("25 / 25");

  await page.getByTestId("submit-button").click();
  await expect(page.getByTestId("assessment-score")).toBeVisible();
  await expect(page.getByTestId("assessment-verdict")).toHaveAttribute(
    "data-passed",
    /^(true|false)$/,
  );
});

/* ───────────── Kịch bản thêm — chỉ trình duyệt thật mới phân xử được ───────────── */

test("đáp án không lộ ra qua thân phản hồi mạng khi bấm chọn một phương án", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = adminClient();
  const userId = await getUserId(admin);
  await completeLessons(admin, userId, [1, 2]);

  await login(page);
  await startFromDashboard(page);
  const pageUrl = page.url();

  // Server Action POST thẳng tới URL của chính trang đang mở. Đọc kiểu trả về
  // của answerAction (`{ ok }`) chỉ chứng minh được KIỂU, không chứng minh
  // được phần TUẦN TỰ HOÁ thật gửi qua dây — đây là lớp duy nhất bắt được một
  // hồi quy kiểu "return answerItem(...)" (đã từng xảy ra ở review Task 6).
  //
  // Dùng `page.waitForResponse` (chạy trên nền tảng `page.on('response', …)`
  // của chính Playwright) thay vì tự dựng `new Promise` + gắn listener tay:
  // bản tự dựng ban đầu có lúc treo tới hết `test.setTimeout` khi chạy chung
  // cả bộ (không phải khi chạy riêng file này) — trang vẫn cập nhật đúng
  // (round trip THẬT SỰ thành công, xác nhận qua `assessment-progress` sau
  // đó), nghĩa là lỗi nằm ở cách tự dựng Promise của kịch bản, không phải ở
  // sản phẩm: có khả năng `response.text()` không settle (resolve lẫn
  // reject) cho MỌI response trong mọi điều kiện tải, và nhánh `.catch(() =>
  // {})` khi đó nuốt luôn thất bại mà không bao giờ gọi `resolve()`, treo
  // vĩnh viễn. `waitForResponse` là API đã được Playwright kiểm thử kỹ cho
  // đúng việc này, và nếu đọc thân phản hồi lỗi thật sự, nó ném lỗi RÕ RÀNG
  // thay vì treo âm thầm.
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url() === pageUrl,
  );
  await page.getByTestId("choice-option").first().click();
  const response = await responsePromise;
  const body = await response.text();

  // Bắt cả "correct" lẫn "is_correct" bằng một lần kiểm chuỗi con —
  // answerAction chỉ được phép trả `{ ok }`, không trường nào trong thân phản
  // hồi được chứa từ này.
  expect(body.toLowerCase()).not.toContain("correct");
});

test("điều hướng giữa lúc còn một lượt ghi dở dang không bỏ sót câu", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = adminClient();
  const userId = await getUserId(admin);
  await completeLessons(admin, userId, [1, 2]);

  await login(page);
  await startFromDashboard(page);
  const pageUrl = page.url();

  // Trì hoãn ~2s MỌI POST (Server Action) gửi tới đúng trang này, để có đủ
  // thời gian bấm "Câu sau" NGAY TRONG LÚC round trip trả lời còn đang bay.
  await page.route(pageUrl, async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((r) => setTimeout(r, 2000));
    }
    await route.continue();
  });

  const progress = page.getByTestId("assessment-progress");
  const nextButton = page.getByRole("button", { name: "Câu sau" });

  // Sang câu 3 mà KHÔNG trả lời câu 1, 2 — điều hướng tự do không bị chặn.
  await nextButton.click();
  await nextButton.click();
  await expect(progress).toHaveText("3 / 25");

  await page.getByTestId("choice-option").first().click(); // bắt đầu round trip 2s cho câu 3

  // `.click()` bình thường sẽ KHÔNG bấm được vì nút đang `disabled={pending}`
  // trong lúc round trip còn bay — dispatchEvent bỏ qua đúng lớp kiểm tra
  // actionability đó, mô phỏng một sự kiện lọt qua (double-tap, trackpad lạ,
  // hay đơn giản là bấm rất nhanh trước khi React kịp áp `disabled`).
  await nextButton.dispatchEvent("click", { bubbles: true, cancelable: true });

  // Vẫn đứng yên ở câu 3 trong lúc round trip còn dở dang — `goTo` đọc
  // `pending` và trả về ngay, không nhảy. Cửa sổ ngắn (300ms) vì đây phải là
  // gần như tức thời trong một lần chạy đúng — nếu guard bị gỡ, `goTo` nhảy
  // NGAY LẬP TỨC và khẳng định này rớt trước khi kịp chạm 300ms.
  await expect(progress).toHaveText("3 / 25", { timeout: 300 });

  // Round trip xong (~2s) thì tự động sang ĐÚNG câu 4 — KHÔNG BAO GIỜ 5/25.
  // 5/25 là đúng cái sẽ xảy ra nếu `goTo` không bị chặn: nó nhảy lên 4/25
  // ngay lập tức lúc dispatchEvent, rồi callback hoàn tất của `pick` (đường
  // tự-động-sang-câu-kế) cộng thêm một bước nữa từ chỗ đã nhảy tới.
  await expect(progress).toHaveText("4 / 25", { timeout: 8000 });
});

test("hai cú bấm dồn trong cùng một tác vụ JS chỉ sinh đúng một lượt ghi", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = adminClient();
  const userId = await getUserId(admin);
  await completeLessons(admin, userId, [1, 2]);

  await login(page);
  await startFromDashboard(page);
  const pageUrl = page.url();

  const posts: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url() === pageUrl) posts.push(req.url());
  });

  // Hai dispatchEvent bên trong CÙNG một page.evaluate — cùng một tác vụ JS
  // của trình duyệt, nên React chưa có cơ hội render lại giữa hai lần bấm và
  // thuộc tính `disabled` trên nút thứ hai vẫn còn là giá trị CŨ (chưa
  // pending). Chỉ một ref đồng bộ (submittingRef, gán TRƯỚC startTransition)
  // mới chặn được lần bấm thứ hai; một guard chỉ dựa vào `disabled`/`pending`
  // (state React) sẽ KHÔNG chặn được, vì cả hai lần đọc cùng một giá trị của
  // cùng một lần render.
  await page.evaluate(() => {
    const options = document.querySelectorAll('[data-testid="choice-option"]');
    const a = options[0];
    const b = options[1];
    a?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    b?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

  await page.waitForLoadState("networkidle");
  expect(posts.length).toBe(1);
});

test("request treo không giữ người học quá hạn — có cửa sổ dự phòng nộp bài", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = adminClient();
  const userId = await getUserId(admin);
  await unlockTestSlot(admin, userId);

  await login(page);
  const assessmentId = await startFromDashboard(page);

  // Kéo hạn về rất gần hiện tại (15 giây) thay vì đợi 60 phút thật — ghi
  // thẳng `expires_at`, cùng cơ chế "seed trực tiếp" đã dùng cho tiến độ buổi.
  const desiredRemainingMs = 15_000;
  const expiryDeadline = Date.now() + desiredRemainingMs;
  const { error: updateErr } = await admin
    .from("assessments")
    .update({ expires_at: new Date(expiryDeadline).toISOString() })
    .eq("id", assessmentId)
    .eq("user_id", userId);
  if (updateErr) throw updateErr;
  await page.reload(); // trang phải tải lại để Countdown nhận expiresAt mới

  const pageUrl = page.url();
  // Route xử lý thô riêng cho đường dự phòng (`/api/assessment/[id]/submit`,
  // xem JSDoc tại route đó) — CỐ Ý một URL KHÁC `pageUrl`. `answerAction` và
  // `submitAction` (Server Action bình thường) đều POST tới `pageUrl`; nếu
  // đường dự phòng cũng gọi qua đó, nó sẽ bị kẹt sau lưng `answerAction` đang
  // treo (cả hai đi qua CHUNG một hàng đợi hành động của Next — không có cách
  // nào phân biệt được hai request đó ở tầng ứng dụng để "chen ngang"). Route
  // riêng này là bằng chứng route xử lý thô THẬT SỰ được gọi, không phải
  // Server Action bị kẹt tình cờ resolve.
  const fallbackSubmitUrl = new URL(`/api/assessment/${assessmentId}/submit`, pageUrl).toString();
  const fallbackPostTimestamps: number[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url() === fallbackSubmitUrl) fallbackPostTimestamps.push(Date.now());
  });

  // Treo VÔ THỜI HẠN mọi POST Server Action (answerAction/submitAction) tới
  // đúng trang này — mô phỏng một request mất mạng giữa chừng, không bao giờ
  // resolve/reject. KHÔNG treo `/api/assessment/[id]/submit`: đường dự phòng
  // phải tới được đó để thoát khỏi hàng đợi mà chính request treo này gây ra.
  await page.route(pageUrl, async (route) => {
    if (route.request().method() === "POST") {
      await new Promise(() => {
        /* không bao giờ resolve — đúng ý nghĩa "treo" */
      });
      return;
    }
    await route.continue();
  });

  const countdown = page.getByTestId("countdown");
  await expect(countdown).toBeVisible();
  const remainingAtStart = parseMmSs(await countdown.innerText());
  expect(remainingAtStart).toBeGreaterThan(3); // đủ thời gian để bấm TRƯỚC khi hết hạn

  // Bấm MỘT đáp án để tạo ra request đang bay — nó treo mãi (route ở trên
  // không bao giờ trả lời), nên `pending` không bao giờ tự về false, và
  // "đường nhanh" (chờ `!pending`) không bao giờ chạy được. Chỉ còn hẹn giờ
  // dự phòng (vô điều kiện, 5s kể từ lúc hết hạn) có thể cứu người học khỏi
  // đứng hình vĩnh viễn.
  await page.getByTestId("choice-option").first().click();

  // Chờ route xử lý thô của đường dự phòng nhận được request.
  await expect.poll(() => fallbackPostTimestamps.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  const submitAt = fallbackPostTimestamps[0]!;

  // Cửa sổ có biên: tối đa một nấc đồng hồ (đến 1s) cộng hẹn giờ dự phòng
  // (5s) cộng hao phí gửi request — không được giữ người học quá xa mốc này
  // sau hạn. Đây là khẳng định sẽ KHÔNG BAO GIỜ đạt được nếu hẹn giờ dự phòng
  // bị gỡ khỏi mã, hoặc nếu ai đó "dọn gọn" đường dự phòng về gọi lại
  // `submitAction` (Server Action) như cũ: khi đó `fallbackPostTimestamps`
  // mãi mãi rỗng, và chính `expect.poll` phía trên sẽ hết hạn (30s) trước khi
  // tới được dòng này.
  expect(submitAt - expiryDeadline).toBeLessThan(10_000);

  // Bằng chứng MẠNH hơn một request đơn thuần đã rời trình duyệt: người học
  // THẬT SỰ thoát khỏi màn hình khoá cứng (mọi nút `disabled={pending}`
  // vĩnh viễn) và thấy được kết quả — route xử lý thô nộp xong rồi tự
  // `window.location.reload()`.
  await expect(page.getByTestId("assessment-verdict")).toBeVisible({ timeout: 15_000 });
});

test("bảng số câu dùng được trên điện thoại — không tràn ngang, đủ 4 phương án, ba trạng thái phân biệt bằng computed style", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const admin = adminClient();
  const userId = await getUserId(admin);
  await unlockTestSlot(admin, userId); // bài kiểm tra 60 câu

  await page.setViewportSize({ width: 375, height: 667 });
  await login(page);
  await startFromDashboard(page);

  await expect(page.getByTestId("assessment-prompt")).toBeVisible();

  // Không tràn ngang ở bề rộng 375px — bảng số câu (60 nút) là phần tử dễ vỡ
  // layout nhất trên trang này.
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

  // Bảng số câu không đụng tên với các nút phương án — đúng 4, không nhiều
  // hơn (chứng minh hai thành phần không lẫn testid vào nhau).
  await expect(page.getByTestId("choice-option")).toHaveCount(4);

  // Trả lời câu 1 để có đủ BA trạng thái cùng lúc trên bảng số câu: câu 1 đã
  // làm (không phải câu hiện tại), câu 2 hiện tại (chưa làm), câu 3 chưa làm
  // (không phải câu hiện tại) — ba nút, ba trạng thái, đọc qua aria-label/
  // aria-current đã có sẵn trong mã (không cần thêm testid mới).
  await page.getByTestId("choice-option").first().click();
  await expect(page.getByTestId("assessment-progress")).toHaveText("2 / 60");

  const answered = page.locator('[aria-label="Câu 1, đã làm"]');
  const current = page.locator('[aria-current="true"]');
  const untouched = page.locator('[aria-label="Câu 3, chưa làm"]');
  await expect(current).toHaveAttribute("aria-label", "Câu 2, chưa làm");

  const [answeredBg, currentBg, untouchedBg] = await Promise.all([
    answered.evaluate((el) => getComputedStyle(el).backgroundColor),
    current.evaluate((el) => getComputedStyle(el).backgroundColor),
    untouched.evaluate((el) => getComputedStyle(el).backgroundColor),
  ]);

  // Phân biệt bằng MÀU THẬT đã render, không phải bằng tên class: ba giá trị
  // phải đôi một khác nhau.
  expect(new Set([answeredBg, currentBg, untouchedBg]).size).toBe(3);
});

test("đồng hồ chuyển đỏ khi còn dưới 5 phút", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = adminClient();
  const userId = await getUserId(admin);
  await unlockTestSlot(admin, userId);

  await login(page);
  const assessmentId = await startFromDashboard(page);

  const { error: updateErr } = await admin
    .from("assessments")
    .update({ expires_at: new Date(Date.now() + 4 * 60 * 1000).toISOString() })
    .eq("id", assessmentId)
    .eq("user_id", userId);
  if (updateErr) throw updateErr;
  await page.reload();

  const countdown = page.getByTestId("countdown");
  await expect(countdown).toBeVisible();

  // So màu THẬT ĐÃ RENDER với một phần tử dò mang đúng lớp `text-red-600` mà
  // Countdown dùng dưới ngưỡng 5 phút — không so chuỗi class, không đoán giá
  // trị hex tay (Tailwind v4 có thể không serialize màu ra dạng rgb() cổ điển
  // nữa): cả hai đọc từ CÙNG một stylesheet đã tải trên trang, nên phép so
  // sánh đúng bất kể định dạng màu computed style trả về là gì.
  const [countdownColor, referenceRed] = await Promise.all([
    countdown.evaluate((el) => getComputedStyle(el).color),
    page.evaluate(() => {
      const probe = document.createElement("span");
      probe.className = "text-red-600";
      document.body.appendChild(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    }),
  ]);

  expect(countdownColor).toBe(referenceRed);
});

test("bài ôn tập không hiển thị đồng hồ đếm ngược", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = adminClient();
  const userId = await getUserId(admin);
  await completeLessons(admin, userId, [1, 2]);

  await login(page);
  await startFromDashboard(page);

  await expect(page.getByTestId("assessment-prompt")).toBeVisible();
  await expect(page.getByTestId("countdown")).toHaveCount(0);
});
