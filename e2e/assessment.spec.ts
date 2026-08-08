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
    // Mỗi lượt xoá đọc `error` riêng và ném ngay — nuốt lỗi ở đây thì dòng
    // còn sót lại rò sang kịch bản kế tiếp mà `afterEach` vẫn báo "xong",
    // đúng constraint "không bao giờ nuốt lỗi Supabase" của cả lát này.
    const delAssessments = await admin.from("assessments").delete().eq("user_id", u.id);
    if (delAssessments.error) throw delAssessments.error;
    const delProgress = await admin.from("user_lesson_progress").delete().eq("user_id", u.id);
    if (delProgress.error) throw delProgress.error;
    const delWord = await admin.from("word_mastery").delete().eq("user_id", u.id);
    if (delWord.error) throw delWord.error;
    const delGrammar = await admin.from("grammar_mastery").delete().eq("user_id", u.id);
    if (delGrammar.error) throw delGrammar.error;
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
  // ĐÃ QUA HAI CÁCH ĐỌC THÂN PHẢN HỒI TRƯỚC, CẢ HAI ĐỀU KHÔNG ỔN ĐỊNH dưới
  // tải khi chạy CHUNG cả bộ (không phải khi chạy riêng file này — trang vẫn
  // cập nhật đúng, round trip THẬT SỰ thành công, nên lỗi cả hai lần đều nằm
  // ở CÁCH bài test đọc thân phản hồi, không phải ở sản phẩm):
  //   1. Tự dựng `new Promise` + gắn tay `page.on('response', …)`: có lúc
  //      treo tới hết `test.setTimeout`.
  //   2. `page.waitForResponse(...)` rồi `await response.text()` riêng: có
  //      lúc ném "Response body is not available for a response that was
  //      navigated away from" — đọc thân phản hồi SAU KHI sự kiện 'response'
  //      đã bắn ra ngoài đôi lúc thua một cuộc đua với vòng đời trang ở CDP,
  //      dưới tải nặng của việc chạy tuần tự nhiều chục kịch bản.
  //
  // Cách thứ BA, dùng `page.route` + `route.fetch()` + `route.fulfill()`:
  // thay vì CHỜ một response đã xảy ra rồi mới đọc, kịch bản tự THỰC HIỆN
  // request đó (qua `route.fetch()`, chạy trong tiến trình Playwright, không
  // phụ thuộc vòng đời trang) rồi mới chuyển tiếp y nguyên xuống trang (qua
  // `route.fulfill({ response })`, để `answerAction` phía client vẫn nhận
  // đúng dữ liệu, hành vi ứng dụng không đổi). Không còn cuộc đua nào với
  // trình duyệt để thắng hay thua.
  let capturedBody: string | null = null;
  await page.route(pageUrl, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    capturedBody = await response.text();
    await route.fulfill({ response });
  });

  await page.getByTestId("choice-option").first().click();
  await expect.poll(() => capturedBody !== null, { timeout: 10_000 }).toBe(true);
  const body = capturedBody!;

  // BẮT BUỘC (review round 3, finding 6): xác nhận round trip THẬT SỰ THÀNH
  // CÔNG trước khi tin bất kỳ điều gì về NỘI DUNG thân phản hồi — một phản
  // hồi lỗi/redirect (bài đã hết hạn, mất phiên, …) cũng có thân KHÔNG rỗng
  // và cũng không chứa "correct", nên hai khẳng định dưới đây tự chúng có
  // thể pass trên một round trip THẤT BẠI. Chỉ khi answerAction thật sự ghi
  // nhận câu trả lời, trang mới tự động sang câu 2 — đây là bằng chứng độc
  // lập với nội dung `body`.
  await expect(page.getByTestId("assessment-progress")).toHaveText("2 / 25");

  // Thân KHÔNG được rỗng — nếu không, `not.toContain("correct")` phía dưới
  // đúng một cách vô nghĩa (chuỗi rỗng không chứa gì cả). Đây là khẳng định
  // xác nhận bài test THẬT SỰ đọc được nội dung phản hồi, không phải phép so
  // đang so với "".
  expect(body.length).toBeGreaterThan(0);

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

  // ĐÂY LÀ KHẲNG ĐỊNH PHÂN BIỆT ĐƯỢC của kịch bản này (dòng dưới, "4 / 25",
  // KHÔNG phải — xem giải thích ngay sau). `goTo` đọc `pending` và trả về
  // ngay nếu guard đó còn nguyên. Cửa sổ ngắn (300ms, tức đọc gần như tức
  // thời) vì nếu guard bị gỡ, `setIndex` trong `goTo` chạy NGAY LẬP TỨC lúc
  // dispatchEvent — progress sẽ đã là "4 / 25" chỉ vài mili giây sau, không
  // phải "3 / 25", và khẳng định này rớt trước khi kịp chạm 300ms.
  await expect(progress).toHaveText("3 / 25", { timeout: 300 });

  // Sau khi round trip xong (~2s), progress LUÔN kết thúc ở "4 / 25" — CẢ HAI
  // trường hợp (guard `goTo` còn hay đã bị gỡ) đều hội tụ về đúng giá trị
  // này, nên dòng dưới đây KHÔNG phải khẳng định phân biệt lỗi (chỉ là khẳng
  // định "bài vẫn tiến triển đúng, không kẹt"): `pick`'s auto-advance so
  // TUYỆT ĐỐI với `answeringIndex` đã chụp lúc bấm (2), không cộng dồn tương
  // đối — nếu `goTo` đã nhảy index lên 3 từ trước (guard bị gỡ), lúc round
  // trip xong `i(3) !== answeringIndex(2)` nên auto-advance là no-op, GIỮ
  // NGUYÊN 3 (tức "4 / 25"); nếu `goTo` bị chặn (guard còn), auto-advance tự
  // cộng từ 2 lên 3 (cũng "4 / 25"). "5 / 25" không xảy ra được ở CẢ HAI
  // trường hợp — bất biến `answeringIndex` tuyệt đối này đã được kiểm riêng ở
  // Task 6 review, không phải điều kịch bản này lập ra để bắt.
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

  // Kéo hạn về rất gần hiện tại (30 giây) thay vì đợi 60 phút thật — ghi
  // thẳng `expires_at`, cùng cơ chế "seed trực tiếp" đã dùng cho tiến độ buổi.
  // 30s (không phải 15s) để phần "setup" phía dưới (một round trip DB cho
  // `update expires_at`, cộng một `page.reload()` TRỌN VẸN của bản build
  // production — không phải dev) có đủ dư địa trước khi bấm, không ăn hết
  // ngân sách còn lại.
  const desiredRemainingMs = 30_000;
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
  expect(remainingAtStart).toBeGreaterThan(10); // đủ thời gian để bấm TRƯỚC khi hết hạn

  // Bấm MỘT đáp án để tạo ra request đang bay — nó treo mãi (route ở trên
  // không bao giờ trả lời), nên `pending` không bao giờ tự về false, và
  // "đường nhanh" (chờ `!pending`) không bao giờ chạy được. Chỉ còn hẹn giờ
  // dự phòng (vô điều kiện, 5s kể từ lúc hết hạn) có thể cứu người học khỏi
  // đứng hình vĩnh viễn.
  await page.getByTestId("choice-option").first().click();

  // Chờ route xử lý thô của đường dự phòng nhận được request. Hạn của CHÍNH
  // `expect.poll` này (KHÔNG phải khẳng định về độ trễ — đó là dòng dưới)
  // phải rộng hơn `desiredRemainingMs` (30s): nếu phần setup phía trên (đăng
  // nhập, tạo bài kiểm tra 60 câu thật, ghi `expires_at`, tải lại) nhanh bất
  // thường, gần như toàn bộ 30 giây đó vẫn còn nguyên lúc bấm — cộng thêm 5s
  // hẹn giờ dự phòng và hao phí, tổng có thể chạm gần 35-36s. 45s chừa đủ
  // biên trong MỌI trường hợp (kể cả trường hợp "nhanh" đó), không chỉ
  // trường hợp thường gặp.
  await expect.poll(() => fallbackPostTimestamps.length, { timeout: 45_000 }).toBeGreaterThanOrEqual(1);
  const submitAt = fallbackPostTimestamps[0]!;

  // Cửa sổ có biên: tối đa một nấc đồng hồ (đến 1s) cộng hẹn giờ dự phòng
  // (5s) cộng hao phí gửi request — không được giữ người học quá xa mốc này
  // sau hạn. Đây là khẳng định sẽ KHÔNG BAO GIỜ đạt được nếu hẹn giờ dự phòng
  // bị gỡ khỏi mã, hoặc nếu ai đó "dọn gọn" đường dự phòng về gọi lại
  // `submitAction` (Server Action) như cũ: khi đó `fallbackPostTimestamps`
  // mãi mãi rỗng, và chính `expect.poll` phía trên sẽ hết hạn (45s) trước khi
  // tới được dòng này.
  expect(submitAt - expiryDeadline).toBeLessThan(10_000);

  // Gỡ route treo NGAY khi đã có bằng chứng đường dự phòng thật sự bắn ra
  // request (review round 3, finding 3): kịch bản này chỉ định treo
  // `answerAction` để buộc đường dự phòng phải hoạt động — nó KHÔNG có ý định
  // kiểm tra `finalize` (chấm + backfill + đóng bài, chạy trên Supabase thật)
  // hoàn tất trong đúng `RAW_FETCH_TIMEOUT_MS`. Nếu Supabase production chậm
  // bất thường đúng lúc này, `fetch` của `submitViaRawFetch` có thể tự
  // `AbortController` trước khi server ghi xong, trang tải lại trong lúc dòng
  // `assessments` vẫn `in_progress`, và (residual finding 5 đã sửa) đường
  // NHANH trên trang tải lại sẽ tự thử lại qua route thô — nhưng nếu vẫn còn
  // route treo `pageUrl` từ trước, một `submitAction` sót lại ở đâu đó (hiện
  // tại không còn, nhưng đây là lớp phòng thủ cho TƯƠNG LAI) sẽ lại kẹt. Gỡ
  // route ở đây tách bạch rõ: từ điểm này trở đi, kịch bản chỉ còn đo "trang
  // có tới được màn hình kết quả hay không", không còn phụ thuộc độ trễ thật
  // của Supabase production kết hợp với việc route có bị treo hay không.
  await page.unroute(pageUrl);

  // Bằng chứng MẠNH hơn một request đơn thuần đã rời trình duyệt: người học
  // THẬT SỰ thoát khỏi màn hình khoá cứng (mọi nút `disabled={pending}`
  // vĩnh viễn) và thấy được kết quả — route xử lý thô nộp xong rồi tự
  // `window.location.reload()`. 20s (không phải 15s): chừa thêm biên cho khả
  // năng `finalize` chưa hoàn tất trước khi trang tải lại lần đầu, khiến
  // trang phải thử lại một round trip nữa (giờ không còn bị route nào chặn).
  await expect(page.getByTestId("assessment-verdict")).toBeVisible({ timeout: 20_000 });
});

test("route nộp bài dự phòng CŨNG treo — vẫn tải lại trang, và TỰ THỬ LẠI sau khi tải lại", async ({
  page,
}) => {
  test.setTimeout(90_000);
  // Kịch bản trên chỉ treo `answerAction`, để `/api/assessment/[id]/submit`
  // hoàn tất bình thường — chứng minh route thô hoạt động, nhưng KHÔNG chứng
  // minh được `AbortController`/`setTimeout` trong `submitViaRawFetch` (review
  // round 2, finding 1). Nếu CHÍNH route thô cũng treo (mất mạng thật, không
  // phải kẹt hàng đợi Next — ví dụ Wi-Fi captive portal), `fetch()` không có
  // hạn sẽ đứng chờ vĩnh viễn và `window.location.reload()` không bao giờ tới
  // lượt — đúng lỗi gốc, chỉ dời xuống một tầng. Kịch bản này treo CẢ HAI
  // route (cả `pageUrl` lẫn route thô) để buộc phải đi qua đúng nhánh
  // `catch` mới thoát được.
  //
  // Vì cả hai route đều treo VĨNH VIỄN, `submitAssessment` không bao giờ
  // thực sự chạy — bài KHÔNG được nộp, nên không thể khẳng định
  // `assessment-verdict` xuất hiện (đó là một điều SAI trong hoàn cảnh này).
  // Điều ĐÚNG và vẫn đo được: trình duyệt phải tự TẢI LẠI trang VÀ TỰ THỬ LẠI
  // việc nộp bài SAU LẦN TẢI LẠI ĐÓ (review round 3, finding 5 — residual:
  // trước bản sửa này, đường "nhanh" trên trang tải lại vẫn gọi `submitAction`
  // — một Server Action, đi qua đúng hàng đợi hành động bị kẹt y hệt lần
  // đầu — nên một mạng còn xấu SAU reload làm người học kẹt lại đúng chỗ cũ,
  // một lần tải lại sau. Chỉ khẳng định "có MỘT lượt POST/reload" không bắt
  // được lỗi đó, vì lỗi đó nằm ở CÁI GÌ XẢY RA SAU lượt đầu tiên).
  const admin = adminClient();
  const userId = await getUserId(admin);
  await unlockTestSlot(admin, userId);

  await login(page);
  const assessmentId = await startFromDashboard(page);

  const desiredRemainingMs = 30_000;
  const expiryDeadline = Date.now() + desiredRemainingMs;
  const { error: updateErr } = await admin
    .from("assessments")
    .update({ expires_at: new Date(expiryDeadline).toISOString() })
    .eq("id", assessmentId)
    .eq("user_id", userId);
  if (updateErr) throw updateErr;
  await page.reload();

  const pageUrl = page.url();
  const fallbackSubmitUrl = new URL(`/api/assessment/${assessmentId}/submit`, pageUrl).toString();

  const fallbackPostTimestamps: number[] = [];
  const freshLoadTimestamps: number[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url() === fallbackSubmitUrl) fallbackPostTimestamps.push(Date.now());
    if (req.method() === "GET" && req.url() === pageUrl) freshLoadTimestamps.push(Date.now());
  });

  await page.route(pageUrl, async (route) => {
    if (route.request().method() === "POST") {
      await new Promise(() => {
        /* answerAction treo vĩnh viễn — không bao giờ resolve/reject */
      });
      return;
    }
    await route.continue(); // GET (tải trang thường lẫn tải lại) phải qua bình thường
  });
  // Route thô của đường dự phòng CŨNG treo vĩnh viễn — không gọi
  // route.continue()/route.fulfill() ở đây. Đăng ký NGUYÊN VĂN, không tự huỷ
  // sau lượt đầu — kịch bản này CỐ Ý để mạng "xấu vĩnh viễn" qua NHIỀU lượt
  // tải lại, đúng điều cần đo cho finding 5.
  await page.route(fallbackSubmitUrl, async () => {
    await new Promise(() => {
      /* mô phỏng route thô cũng mất mạng giữa chừng, MỌI lần gọi */
    });
  });

  const countdown = page.getByTestId("countdown");
  await expect(countdown).toBeVisible();
  const remainingAtStart = parseMmSs(await countdown.innerText());
  expect(remainingAtStart).toBeGreaterThan(10);

  // Mốc TRƯỚC khi bấm (review round 3, finding 7b): `freshLoadTimestamps`
  // đếm MỌI GET tới đúng `pageUrl` kể từ lúc đăng ký listener — nếu một GET
  // "lạc" nào đó (ví dụ do một thay đổi tương lai ở phần setup phía trên)
  // từng lọt vào trước khi bấm, khẳng định độ trễ dựa trên
  // `freshLoadTimestamps[0]` sẽ đúng một cách vô nghĩa. So với `clickAt`
  // loại khả năng đó.
  const clickAt = Date.now();
  await page.getByTestId("choice-option").first().click();

  // Chờ LƯỢT THỨ HAI, không phải lượt đầu (review round 3, finding 5):
  // lượt đầu (từ hẹn giờ dự phòng của lần MOUNT ban đầu) chỉ chứng minh
  // "route thô cũng có hạn" — không chứng minh gì về việc trang có tự cứu
  // được mình SAU KHI đã tải lại một lần. Lượt thứ hai chỉ có thể tới từ
  // đường "nhanh" của lần MOUNT LẠI (component fresh, `pending=false` ngay
  // từ đầu, `expired` bật gần như tức thời vì `expires_at` vẫn trong quá
  // khứ) — CHÍNH đường mà residual finding 5 sửa để dùng route thô thay vì
  // `submitAction`. Nếu bản sửa đó bị gỡ, lượt thứ hai không bao giờ tới
  // (đường nhanh quay lại gọi `submitAction`, kẹt trong hàng đợi hành động —
  // route `pageUrl` ở trên vẫn treo mọi POST), và `expect.poll` dưới đây hết
  // hạn.
  //
  // Ngân sách 65s: tối đa `desiredRemainingMs` (30s) + 5s hẹn giờ dự phòng +
  // 8s (RAW_FETCH_TIMEOUT_MS, xem comment tại nơi định nghĩa) cho lượt đầu +
  // vài giây cho việc tải lại/mount lại (bản build production) + gần như tức
  // thời cho lượt hai (không cần đợi thêm hẹn giờ 5s — đường nhanh chạy ngay)
  // + 8s (RAW_FETCH_TIMEOUT_MS) cho chính lượt hai + biên hao phí.
  await expect.poll(() => fallbackPostTimestamps.length, { timeout: 65_000 }).toBeGreaterThanOrEqual(2);

  expect(freshLoadTimestamps.length).toBeGreaterThanOrEqual(1);
  const reloadAt = freshLoadTimestamps[0]!;
  expect(reloadAt).toBeGreaterThan(clickAt); // finding 7b — loại khả năng GET "lạc" từ trước khi bấm
  expect(reloadAt - expiryDeadline).toBeLessThan(20_000);

  const secondPostAt = fallbackPostTimestamps[1]!;
  expect(secondPostAt).toBeGreaterThan(reloadAt); // lượt hai phải THẬT SỰ đến SAU lần tải lại đầu tiên
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
  //
  // KIỂM SOÁT ÂM đúng chỗ (review round 3, finding 1 — bản `text-slate-500`
  // ở vòng trước KHÔNG bắt được lỗi nó tự nhận là bắt): nếu `text-red-600`
  // biến mất khỏi CSS đã biên dịch, span probe mang class đó sẽ KHÔNG rơi về
  // "mặc định của trình duyệt" (thường là đen) — nó rơi về màu THỪA KẾ từ
  // `<body>`, mà `src/app/layout.tsx` đặt là `text-slate-900`
  // (rgb(15,23,42)). Probe `text-slate-500` (rgb(100,116,139)) khác
  // `text-slate-900` — nên dù `text-red-600` có mất, `referenceSlate` (vẫn
  // còn nguyên trong CSS) vẫn khác `countdownColor` (giờ rơi về
  // text-slate-900) một cách TÌNH CỜ, không phải vì kiểm soát hoạt động
  // đúng; phép `not.toBe` cũ pass giả cho đúng ca nó định bắt.
  //
  // Kiểm soát ĐÚNG: so `referenceRed` với màu THỪA KẾ THẬT (một span KHÔNG
  // gán class nào, đọc `getComputedStyle` ngay dưới `<body>`) — bình thường
  // đỏ (rgb(220,38,38)) phải khác thừa kế (rgb(15,23,42)); nếu `text-red-600`
  // bị purge khỏi CSS, probe đỏ TỰ NÓ rơi về đúng màu thừa kế đó, và phép so
  // sánh này rớt NGAY tại probe, trước khi kịp so với countdown — đúng lỗi
  // review round 3 mô tả: hôm nay `text-red-600` là literal tĩnh ở
  // `countdown.tsx:50` (Tailwind quét tĩnh thấy được, không có rủi ro purge
  // thật), nhưng kiểm soát này phòng cho TƯƠNG LAI — ví dụ nếu ai đó đổi
  // sang ghép chuỗi động kiểu `text-${color}-600`, Tailwind sẽ không quét
  // thấy và âm thầm loại class đó khỏi bản build.
  const [countdownColor, referenceRed, inherited] = await Promise.all([
    countdown.evaluate((el) => getComputedStyle(el).color),
    page.evaluate(() => {
      const probe = document.createElement("span");
      probe.className = "text-red-600";
      document.body.appendChild(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    }),
    page.evaluate(() => {
      const probe = document.createElement("span"); // không gán class nào
      document.body.appendChild(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    }),
  ]);

  expect(referenceRed).not.toBe(inherited); // xác nhận `text-red-600` THẬT SỰ đổi màu, không chỉ trùng hợp với mặc định
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

/* ───── Route /api/assessment/[id]/submit — kiểm cấp route, không qua UI ───── */
// Dùng fixture `request` (APIRequestContext RIÊNG của Playwright, không mang
// theo bất kỳ cookie phiên nào của `page`) thay vì `page` — đúng ý "chưa đăng
// nhập" mà không cần đăng xuất tài khoản dùng chung, và gọi route thẳng bằng
// HTTP, không cần trình duyệt cho hai nhánh lỗi sớm này.

test("route /api/assessment/[id]/submit — id không hợp lệ trả 400", async ({ request }) => {
  const res = await request.post("/api/assessment/abc/submit");
  expect(res.status()).toBe(400);
});

test("route /api/assessment/[id]/submit — chưa đăng nhập trả 401", async ({ request }) => {
  // Id hợp lệ (để chắc chắn KHÔNG rớt ở nhánh 400 trước đó) nhưng không có
  // cookie phiên nào — `request` fixture không chia sẻ trạng thái với `page`.
  const res = await request.post("/api/assessment/1/submit");
  expect(res.status()).toBe(401);
});
