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
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const u = data?.users.find((x) => x.email === TEST_EMAIL);
  if (u) {
    const delAssessments = await admin.from("assessments").delete().eq("user_id", u.id);
    if (delAssessments.error) throw delAssessments.error;
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
  test.setTimeout(120_000);
  await login(page);
  await page.goto("/grammar/1");
  await page.getByTestId("exam-button").click();
  await expect(page).toHaveURL(/\/exam\/\d+$/);

  // Bài 1 có đúng 20 câu (task-2-report.md/task-3-report.md) — luôn chọn
  // phương án đầu, không quan tâm đạt/chưa đạt: kịch bản này chỉ khẳng định
  // trang kết quả AN TOÀN và ĐÚNG hình dạng cho loại bài `grammar`, không
  // khẳng định lại logic chấm điểm (đã có `tests/exam-grammar.test.ts`).
  for (let n = 0; n < 20; n++) {
    await page.getByTestId("exam-option").first().click();
  }

  await expect(page).toHaveURL(/\/exam\/\d+\/ket-qua$/, { timeout: 30_000 });
  await expect(page.getByTestId("ket-qua-diem")).toBeVisible();
  // Mục 3.3 (thiết kế phase 2) + §6 (thiết kế lát 2d): bài ngữ pháp KHÔNG có
  // bổ túc — nút này không được phép hiện dù đạt hay không đạt.
  await expect(page.getByTestId("ket-qua-bo-tuc")).toHaveCount(0);

  await page.getByText("Quay lại Ngữ pháp").click();
  await expect(page).toHaveURL(/\/grammar$/);
});
