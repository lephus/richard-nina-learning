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
  // Dọn bài đang làm dở của CHÍNH tài khoản test, đúng khuôn `e2e/exam.spec.ts`
  // (bàn giao Task 4 yêu cầu tường minh) — chỉ số một-phần
  // `assessments_one_in_progress` không phân biệt `type`, nên kịch bản "bấm
  // Làm bài" bên dưới để lại một bài `in_progress` sẽ khoá MỌI kịch bản chạy
  // sau (kể cả những kịch bản khác file, vì `workers: 1` chạy tuần tự trên
  // CÙNG một tài khoản) — đâm 23505 nếu không dọn.
  //
  // SỬA Ở VÒNG SOÁT CUỐI (mục minor): thêm dọn `grammar_mastery` — bỏ sót so
  // với `e2e/stats.spec.ts` (cùng khuôn, dọn cả `word_mastery` LẪN
  // `grammar_mastery`). Kịch bản "nộp bài ngữ pháp xong…" bên dưới trả lời
  // đủ 20 câu, mỗi câu ghi một dòng qua `applyGrammarMastery` (gọi trong
  // `recordAnswer`) — cột này KHÔNG cascade theo `assessments` (mastery của
  // một bài học độc lập với bài thi chứa nó, cùng lý do `word_mastery` không
  // cascade), nên sống sót qua lượt xoá `assessments` ở trên và RÒ sang bất
  // kỳ kịch bản nào chạy sau kỳ vọng "chưa học ngữ pháp gì" (ví dụ
  // `stats.spec.ts`, nếu chạy sau file này trong cùng `workers: 1`).
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const u = data?.users.find((x) => x.email === TEST_EMAIL);
  if (u) {
    const delAssessments = await admin.from("assessments").delete().eq("user_id", u.id);
    if (delAssessments.error) throw delAssessments.error;
    const delGrammarMastery = await admin.from("grammar_mastery").delete().eq("user_id", u.id);
    if (delGrammarMastery.error) throw delGrammarMastery.error;
  }
});

test("thẻ NGỮ PHÁP trên dashboard là link, không còn 'Sắp có', dẫn tới /grammar", async ({
  page,
}) => {
  await login(page);
  const the = page.getByTestId("track-grammar");
  await expect(the).toBeVisible();
  await expect(the).not.toContainText("Sắp có");

  await the.click();
  await expect(page).toHaveURL(/\/grammar$/);
});

test("/grammar liệt kê đúng 20 bài", async ({ page }) => {
  await login(page);
  await page.goto("/grammar");
  await expect(page.getByTestId("grammar-row")).toHaveCount(20);
});

test("mở bài có bảng so sánh thấy <table> thật, không thấy chuỗi grid table của pandoc (đóng rủi ro 11.2)", async ({
  page,
}) => {
  await login(page);
  // Bài 4 "Thì hiện tại đơn, hiện tại tiếp diễn, quá khứ đơn, quá khứ tiếp
  // diễn" — đúng bài chứa bảng so sánh HIỆN TẠI ĐƠN/HIỆN TẠI TIẾP DIỄN nêu
  // làm ví dụ ở thiết kế lát 2d mục 1 (đã xác nhận qua `data/clean/grammar.json`:
  // đây là một trong các bài có `+====` trong `contentMd` gốc — grid table
  // của pandoc, thứ không thư viện markdown JS phổ thông nào render được).
  await page.goto("/grammar/4");
  const content = page.getByTestId("grammar-content");

  // Khẳng định ĐÓNG (không chỉ "có vẻ đúng"): PHẢI thấy một <table> THẬT
  // (element, không phải chữ "table" xuất hiện đâu đó trong văn bản), VÀ
  // KHÔNG được thấy chuỗi literal "+====" — dấu hiệu grid table của pandoc
  // rơi thẳng ra màn hình thay vì được dịch thành HTML.
  await expect(content.locator("table").first()).toBeVisible();
  await expect(content).not.toContainText("+====");
});

test("bấm 'Làm bài' ở một bài ngữ pháp vào /exam/[id], thấy 4 phương án", async ({
  page,
}) => {
  await login(page);
  // Bài 1 "Cấu trúc câu" — bài NHỎ NHẤT (20 câu, xem task-2-report.md/task-3-report.md)
  // trong 20 bài, chọn để kịch bản chạy nhanh vì `buildGrammarExam` lấy TOÀN
  // BỘ câu hỏi của bài, không cắt bớt.
  await page.goto("/grammar/1");
  await page.getByTestId("exam-button").click();

  await expect(page).toHaveURL(/\/exam\/\d+$/);
  await expect(page.getByTestId("exam-option")).toHaveCount(4);
});

// KỊCH BẢN THỨ 5, NGOÀI bốn kịch bản brief đòi — thêm vì lý do bắt buộc, ghi
// lại đầy đủ trong báo cáo Task 4: `nopBai` (exam/[id]/actions.ts) redirect
// MỌI bài vừa nộp, kể cả `grammar`, sang `/exam/[id]/ket-qua` — một trang viết
// riêng cho vocab (đọc `scope[0]` để suy "buổi", tra `vocab_words` cho "từ
// sai"). Đọc thẳng code phát hiện: nếu không sửa, trang đó THROW ngay 100%
// các lần cho MỌI bài ngữ pháp vừa nộp (`scope` luôn rỗng), và nếu có sửa nửa
// vời (chỉ tránh throw mà không chặn khối "từ sai") sẽ tra `vocab_words` bằng
// id CÂU HỎI ngữ pháp — hai dải id CHỒNG LẤN thật (`grammar_questions` 537
// dòng, `vocab_words` 605 dòng, cùng bắt đầu từ 1) — hiện ra "từ sai" không hề
// liên quan gì tới bài vừa thi, hỏng ÂM THẦM. Kịch bản này khẳng định cả bài
// nộp xong LẪN hai điều trên không xảy ra.
test("nộp bài ngữ pháp xong thấy điểm, không có nút bổ túc (mục 3.3: ngữ pháp không có bổ túc)", async ({
  page,
}) => {
  // SỬA Ở LÁT "dừng lại xem kết quả" (Task 4): 180s (trước 120s) — mỗi câu
  // giờ tốn HAI cú bấm (chọn phương án rồi `exam-tiep-tuc`, xem vòng lặp bên
  // dưới) thay vì một, và cú bấm thứ hai phải CHỜ khối `exam-phan-hoi` hiện ra
  // trước khi actionable — cùng lý do đã ghi ở `e2e/exam.spec.ts` cho bài 30
  // câu (180s → 240s ở đó); bài này chỉ 20 câu nên mức tăng thấp hơn.
  test.setTimeout(180_000);
  await login(page);
  await page.goto("/grammar/1");
  await page.getByTestId("exam-button").click();
  await expect(page).toHaveURL(/\/exam\/\d+$/);

  // Bài 1 có đúng 20 câu (task-2-report.md/task-3-report.md) — luôn chọn
  // phương án đầu, không quan tâm đạt/chưa đạt: kịch bản này chỉ khẳng định
  // trang kết quả AN TOÀN và ĐÚNG hình dạng cho loại bài `grammar`, không
  // khẳng định lại logic chấm điểm (đã có `tests/exam-grammar.test.ts`).
  //
  // SỬA Ở LÁT "dừng lại xem kết quả" (Task 4): vòng lặp giờ có HAI cú bấm mỗi
  // câu — chọn phương án (dừng lại xem kết quả, không tự sang câu kế), rồi
  // bấm `exam-tiep-tuc` để thật sự sang câu kế. Nút đó cùng `data-testid` cho
  // cả câu giữa ("Tiếp tục") lẫn câu cuối ("Nộp bài" — xem `ExamRunner.tsx`),
  // nên vòng lặp không cần rẽ nhánh theo vị trí; câu cuối bấm xong
  // `exam-tiep-tuc` chính là bấm nộp bài. Cùng khuôn `e2e/exam.spec.ts`.
  for (let n = 0; n < 20; n++) {
    await page.getByTestId("exam-option").first().click();
    await expect(page.getByTestId("exam-tiep-tuc")).toBeVisible();
    await page.getByTestId("exam-tiep-tuc").click();
  }

  await expect(page).toHaveURL(/\/exam\/\d+\/ket-qua$/, { timeout: 60_000 });
  await expect(page.getByTestId("ket-qua-diem")).toBeVisible();
  // Mục 3.3 (thiết kế phase 2) + §6 (thiết kế lát 2d): bài ngữ pháp KHÔNG có
  // bổ túc — nút này không được phép hiện dù đạt hay không đạt.
  await expect(page.getByTestId("ket-qua-bo-tuc")).toHaveCount(0);

  await page.getByText("Quay lại Ngữ pháp").click();
  await expect(page).toHaveURL(/\/grammar$/);
});

/* ─────────────── Vòng soát cuối lát 2d — mục 1 (CRITICAL) và mục 2 ─────────────── */

// Mục 1: `boBaiThi` (exam/[id]/actions.ts) đọc `scope[0]` để suy buổi cần quay
// lại TRƯỚC KHI kiểm bài vừa xoá có phải `type === "grammar"` hay không — bài
// ngữ pháp luôn `scope` RỖNG, nên trước bản vá này nhánh đó ném lỗi thật
// ("…có scope rỗng…") ngay sau khi dòng `assessments` đã bị xoá xong, đưa học
// viên xuống `error.tsx` chung với một thông điệp nhắc tới "buổi" — khái niệm
// bài `grammar` không hề có. Tái hiện đúng hai cú bấm mô tả trong bàn giao:
// vào một bài ngữ pháp, bấm "Bỏ bài".
test("bỏ bài ngữ pháp bằng nút exam-bo-bai thì quay lại /grammar, không rơi vào trang lỗi (mục 1 vòng soát cuối, CRITICAL)", async ({
  page,
}) => {
  await login(page);
  await page.goto("/grammar/1");
  await page.getByTestId("exam-button").click();
  await expect(page).toHaveURL(/\/exam\/\d+$/);

  await page.getByTestId("exam-bo-bai").click();

  // Phải là ĐÚNG /grammar — không phải error.tsx (trang lỗi chung không có
  // route riêng, và chắc chắn không render danh sách 20 bài bên dưới) và
  // không phải một đường suy nhầm kiểu "/vocab/learn/undefined".
  await expect(page).toHaveURL(/\/grammar$/);
  await expect(page.getByTestId("grammar-row")).toHaveCount(20);

  // Bỏ bài thành công thật — chỗ trống trong assessments_one_in_progress đã
  // được giải phóng, dựng bài mới ngay được, không đâm 23505.
  await page.getByTestId("grammar-row").first().click();
  await page.getByTestId("exam-button").click();
  await expect(page).toHaveURL(/\/exam\/\d+$/);
  await expect(page.getByTestId("exam-option")).toHaveCount(4);
});

// Mục 2: `batDauBaiNguPhap` là hàm bấm-ra-bài DUY NHẤT không đính kèm
// `tuLoai`/`tuBuoi` khi redirect vào một bài `in_progress` có sẵn — trước bản
// vá này, hướng grammar → vocab (bỏ dở một bài TỪ VỰNG rồi bấm LÀM BÀI ở một
// bài NGỮ PHÁP) luôn im lặng, trong khi hướng ngược lại (đã có test ở
// `e2e/exam.spec.ts`, "làm bài buổi khác…finding 5") luôn cảnh báo — một sự
// bất đối xứng không có lý do kỹ thuật.
test("làm bài ngữ pháp trong khi còn bài từ vựng dang dở thì thấy cảnh báo lệch loại (mục 2 vòng soát cuối)", async ({
  page,
}) => {
  await login(page);
  await page.goto("/vocab/learn/1");
  await page.getByTestId("exam-button").click();
  await expect(page).toHaveURL(/\/exam\/\d+$/);
  await expect(page.getByTestId("exam-heading")).toHaveText("Bài buổi 1");
  // Chưa có gì để lệch.
  await expect(page.getByTestId("exam-lech-buoi")).toHaveCount(0);

  // Bấm LÀM BÀI ở một bài ngữ pháp trong khi bài buổi 1 (từ vựng) còn đang
  // làm dở — `batDauBaiNguPhap` phải đưa thẳng vào lại bài buổi 1 (không phải
  // dựng bài ngữ pháp mới), kèm loại/bài VỪA BẤM trên query string.
  await page.goto("/grammar/1");
  await page.getByTestId("exam-button").click();
  await expect(page).toHaveURL(/\/exam\/\d+\?tuLoai=grammar&tuBuoi=1$/);
  await expect(page.getByTestId("exam-heading")).toHaveText("Bài buổi 1");
  await expect(page.getByTestId("exam-lech-buoi")).toBeVisible();
});
