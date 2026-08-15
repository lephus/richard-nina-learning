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

// SỬA Ở LÁT "dừng lại xem kết quả": kịch bản này khẳng định ĐÚNG hành vi bị
// đảo lại (spec phase 2 mục 5.4, "bấm một đáp án → sang câu sau ngay lập
// tức"). Viết lại tên và thân, KHÔNG xoá — xem mục 1 của spec thiết kế lát
// này ("đây là đảo lại một quyết định cũ, không phải sửa lỗi").
test("bấm một đáp án thì dừng lại cho xem kết quả, chưa sang câu sau", async ({ page }) => {
  await login(page);
  await page.goto("/vocab/learn/1");
  await page.getByTestId("exam-button").click();
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 1/30");

  await page.getByTestId("exam-option").first().click();

  // Vẫn ở câu 1 — đây là toàn bộ điểm của lát này.
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 1/30");
  await expect(page.getByTestId("exam-phan-hoi")).toBeVisible();
  await expect(page.getByTestId("exam-dap-an-dung")).toBeVisible();
  await expect(page.getByTestId("exam-tiep-tuc")).toBeVisible();

  await page.getByTestId("exam-tiep-tuc").click();
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 2/30");
});

test("sau khi trả lời, bấm lại một phương án không làm gì (phương án đã đóng băng)", async ({
  page,
}) => {
  await login(page);
  await page.goto("/vocab/learn/1");
  await page.getByTestId("exam-button").click();
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 1/30");

  await page.getByTestId("exam-option").first().click();
  await expect(page.getByTestId("exam-phan-hoi")).toBeVisible();

  // Bốn phương án đóng băng (`disabled`) ngay khi đã có kết quả — khẳng định
  // tường minh thuộc tính này trước, vì Playwright coi một phần tử `disabled`
  // là KHÔNG thể thao tác được và `click()` thường sẽ tự chờ nó "actionable"
  // rồi hết hạn (không phải hành vi ta muốn kiểm ở đây).
  const soPhuongAn = await page.getByTestId("exam-option").count();
  for (let k = 0; k < soPhuongAn; k++) {
    await expect(page.getByTestId("exam-option").nth(k)).toBeDisabled();
  }

  // SỬA Ở VÒNG SỬA 1 (review, Minor 5): chú thích BẢN TRƯỚC nói `force: true`
  // "khẳng định handler phía component tự chặn (xem `chon`)" — QUÁ MỨC đã
  // kiểm thật: `force: true` chỉ bỏ qua các kiểm tra "actionable" của RIÊNG
  // Playwright (hiển thị, không bị che…), KHÔNG bỏ qua được thuộc tính
  // `disabled` của chính trình duyệt — một `<button disabled>` không phát sự
  // kiện `click` nào cả dù bấm kiểu gì, nên `onClick`/`chon` trong
  // `ExamRunner.tsx` KHÔNG hề chạy ở đây; lớp phòng thủ tường minh trong
  // `chon` (chặn theo `trangThai.loai`) bảo vệ một đường KHÁC — một cú bấm
  // lọt qua TRƯỚC khi React kịp re-render nút thành `disabled` — không phải
  // đường kịch bản này đang đi qua. Khẳng định dưới đây vẫn hợp lệ, chỉ hẹp
  // hơn: nó xác nhận đúng điều người dùng thật trải nghiệm — thuộc tính
  // `disabled` một mình đã đủ để không cú bấm chuột nào đổi được gì. Không có
  // gì đổi: vẫn câu 1, vẫn đúng khối phản hồi cũ.
  await page.getByTestId("exam-option").nth(1).click({ force: true });
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 1/30");
  await expect(page.getByTestId("exam-phan-hoi")).toBeVisible();
  await expect(page.getByTestId("exam-tiep-tuc")).toBeVisible();
});

test("trang sắp có cũ không còn tồn tại", async ({ page }) => {
  await login(page);
  const res = await page.goto("/vocab/learn/1/sap-co");
  expect(res?.status()).toBe(404);
});

test("trả lời sai hết thì thấy điểm, trạng thái chưa đạt, và nút bổ túc", async ({ page }) => {
  // SỬA Ở LÁT "dừng lại xem kết quả": 240s (trước 180s) — mỗi câu giờ tốn
  // HAI cú bấm (chọn phương án rồi Tiếp tục/Nộp bài, xem vòng lặp bên dưới)
  // thay vì một, và cú bấm thứ hai phải CHỜ khối `exam-phan-hoi` hiện ra
  // trước khi actionable — không chỉ đơn thuần gấp đôi số cú bấm mà còn cộng
  // thêm độ trễ chờ UI giữa hai cú bấm của cùng một câu.
  test.setTimeout(240_000);
  await login(page);
  await page.goto("/vocab/learn/2");
  await page.getByTestId("exam-button").click();
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 1/30");

  // Luôn chọn phương án đầu: có câu trúng có câu trượt, nhưng chắc chắn
  // không đạt 24/30 — đủ để lộ ra nhánh chưa đạt.
  //
  // SỬA Ở LÁT "dừng lại xem kết quả": vòng lặp giờ có HAI cú bấm mỗi câu —
  // chọn phương án (dừng lại xem kết quả, không tự sang câu kế như bản trước
  // lát này), rồi bấm nút `exam-tiep-tuc` để thật sự sang câu kế. Nút đó cùng
  // `data-testid` cho cả 29 câu giữa ("Tiếp tục") lẫn câu 30 ("Nộp bài" —
  // xem `ExamRunner.tsx`), nên vòng lặp không cần rẽ nhánh theo vị trí; câu
  // cuối bấm xong `exam-tiep-tuc` chính là bấm nộp bài.
  for (let n = 1; n <= 30; n++) {
    await expect(page.getByTestId("exam-tien-do")).toHaveText(`Câu ${n}/30`);
    await page.getByTestId("exam-option").first().click();
    await expect(page.getByTestId("exam-tiep-tuc")).toBeVisible();
    await page.getByTestId("exam-tiep-tuc").click();
  }

  // `traLoi` gửi mỗi câu trả lời qua một vòng mạng thật tới Supabase
  // (~1s/câu đo được), TUẦN TỰ (giao diện đứng chờ từng câu trước khi cho
  // bấm Tiếp tục — xem `ExamRunner.tsx`), cộng thêm thời gian chờ UI cập
  // nhật giữa hai cú bấm mỗi câu. Nới timeout CHO ĐÚNG khẳng định này (không
  // phải cắt bớt 30 câu để chạy nhanh hơn — bản bàn giao yêu cầu giữ nguyên
  // độ phủ) thay vì chỉ dựa vào `test.setTimeout` tổng, vốn không nới hạn của
  // riêng một lệnh `expect`.
  await expect(page).toHaveURL(/\/exam\/\d+\/ket-qua$/, { timeout: 90_000 });
  await expect(page.getByTestId("ket-qua-diem")).toBeVisible();
  await expect(page.getByTestId("ket-qua-bo-tuc")).toBeVisible();

  // Finding 6 (vòng soát cuối): spec §4 đòi "danh sách từ sai kèm nghĩa" —
  // trước bản vá, `wrong_items_for_assessment` chỉ được dùng để đếm
  // (`.length`), không render ra gì. Luôn chọn phương án đầu trên 30 câu thì
  // chắc chắn có ít nhất một câu sai (nếu không đã không rơi vào nhánh "chưa
  // đạt" và không có nút bổ túc ở trên).
  await expect(page.getByTestId("ket-qua-tu-sai")).toBeVisible();
  await expect(page.getByTestId("ket-qua-tu-sai").locator("li").first()).toBeVisible();

  const idBaiGoc = page.url().match(/\/exam\/(\d+)\/ket-qua$/)?.[1];
  expect(idBaiGoc).toBeTruthy();

  await page.getByTestId("ket-qua-bo-tuc").click();
  await expect(page).toHaveURL(/\/exam\/\d+$/);
  await expect(page.getByTestId("exam-option")).toHaveCount(4);

  // Yêu cầu C, finding 3 (SỬA SAU VÒNG SOÁT 1): quay lại đúng bài GỐC đã
  // nộp (không phải bài bổ túc vừa dựng ở trên) — mô phỏng bấm "quay lại"
  // của trình duyệt ngay sau khi vừa nộp, một thao tác bình thường, không
  // phải tấn công. Trước bản vá, `/exam/[id]` không rẽ nhánh theo `status`
  // nên vẫn hiện lại đủ 30 câu VÀ nút "Bỏ bài" — bấm nút đó ném lỗi thật (bài
  // đã nộp không xoá được), rơi xuống `error.tsx` với thông điệp sai "mất
  // mạng", tái tạo đúng cái bẫy yêu cầu C tồn tại để loại bỏ.
  await page.goto(`/exam/${idBaiGoc}`);
  await expect(page).toHaveURL(new RegExp(`/exam/${idBaiGoc}/ket-qua$`));
  await expect(page.getByTestId("ket-qua-diem")).toBeVisible();
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
  // exam-option nào cả. SỬA SAU VÒNG SOÁT CUỐI (finding 5): URL giờ mang
  // thêm `?tuLoai=lesson&tuBuoi=3` — `batDauBaiThi` LUÔN đính kèm buổi/loại
  // vừa bấm khi redirect vào một bài `in_progress` có sẵn (xem
  // `exam/[id]/actions.ts`), kể cả khi (như ở đây) đó CHÍNH là bài vừa bấm,
  // không phải một buổi khác — page.tsx tự so sánh và không hiện cảnh báo
  // lệch buổi trong trường hợp này, khẳng định ngay dưới đây.
  await expect(page).toHaveURL(new RegExp(`/exam/${idCu}(\\?.*)?$`));
  await expect(page.getByTestId("exam-option")).toHaveCount(4);
  await expect(page.getByTestId("exam-lech-buoi")).toHaveCount(0);
});

test("bỏ bài bằng nút exam-bo-bai rồi làm bài mới thành công", async ({ page }) => {
  await login(page);
  await page.goto("/vocab/learn/4");
  await page.getByTestId("exam-button").click();
  await expect(page).toHaveURL(/\/exam\/\d+$/);
  // SỬA SAU VÒNG SOÁT 1 (finding 2): bắt buộc phải nắm được id CŨ để so sánh
  // sau — chỉ khớp pattern `/exam/\d+$/` không phân biệt được "dựng bài MỚI
  // thành công" với "delete khớp 0 dòng (thua CAS ở boBaiDangLam) rồi
  // baiDangLamCua vẫn tìm thấy đúng bài CŨ chưa hề bị xoá và lặng lẽ đưa vào
  // lại NÓ" — cả hai đều cho URL khớp `/exam/\d+$/` và 4 phương án, nhưng chỉ
  // một trong hai là "dựng bài mới" như tên kịch bản khẳng định.
  const idCu = page.url().match(/\/exam\/(\d+)$/)?.[1];
  expect(idCu).toBeTruthy();

  await page.getByTestId("exam-bo-bai").click();
  await expect(page).toHaveURL(/\/vocab\/learn\/4$/);

  // Dựng bài MỚI thành công — chứng minh chỗ trống trong
  // assessments_one_in_progress đã thật sự được giải phóng (dòng cũ bị xoá),
  // không chỉ điều hướng đi nơi khác trong khi dòng in_progress cũ còn nguyên.
  await page.getByTestId("exam-button").click();
  await expect(page).toHaveURL(/\/exam\/\d+$/);
  const idMoi = page.url().match(/\/exam\/(\d+)$/)?.[1];
  expect(idMoi).toBeTruthy();
  // Khẳng định THÊM: id phải KHÁC id cũ — bằng chứng trực tiếp rằng dòng
  // `assessments` cũ đã bị XOÁ THẬT (không phải chỉ "chuyển trang rồi quay
  // lại đúng chỗ cũ").
  expect(idMoi).not.toBe(idCu);
  await expect(page.getByTestId("exam-option")).toHaveCount(4);
});

/* ───────────────── Vòng soát cuối — finding 3, 5, 6, và "Also" ───────────────── */

test("tải lại trang giữa bài thi thì vào lại đúng câu tiếp theo, không hiện dải câu trước sai (finding 3)", async ({
  page,
}) => {
  await login(page);
  await page.goto("/vocab/learn/5");
  await page.getByTestId("exam-button").click();
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 1/30");

  // Trả lời 3 câu đầu, đợi ĐÚNG response của từng câu trước khi bấm Tiếp tục
  // — cùng lý do đã ghi ở kịch bản "bấm một đáp án thì dừng lại cho xem kết
  // quả": phải chắc chắn câu trả lời đã NẰM TRONG DATABASE trước khi tải lại
  // trang bên dưới, nếu không việc "mất tiến độ" đo được có thể chỉ là do
  // request còn đang bay, không phải do lỗi ở logic khôi phục.
  //
  // SỬA Ở LÁT "dừng lại xem kết quả": mỗi câu giờ hai cú bấm — chọn phương án
  // (chờ ĐÚNG response POST của nó, như trước), rồi bấm `exam-tiep-tuc` để
  // thật sự sang câu kế. Cú bấm thứ hai không cần đợi mạng riêng (không gửi
  // request nào, chỉ đổi state cục bộ), `click()` tự chờ nút actionable.
  for (let n = 1; n <= 3; n++) {
    const guiDapAn = page.waitForResponse((r) => r.request().method() === "POST");
    await page.getByTestId("exam-option").first().click();
    await guiDapAn;
    await expect(page.getByTestId("exam-tiep-tuc")).toBeVisible();
    await page.getByTestId("exam-tiep-tuc").click();
  }
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 4/30");

  // SỬA SAU VÒNG SOÁT CUỐI: trước bản vá, `/exam/[id]` luôn khởi động
  // `ExamRunner` ở câu 1 bất kể đã trả lời bao nhiêu câu — tải lại trang ở
  // đây sẽ tụt về lại "Câu 1/30" dù 3 câu đầu đã ghi xong trong database.
  await page.reload();
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 4/30");
  // SỬA Ở LÁT "dừng lại xem kết quả": dải "câu trước: đúng/sai" ở đầu trang
  // (testid cũ `exam-ket-qua-truoc`) bị BỎ HẲN khỏi `ExamRunner` (mục 5 spec
  // thiết kế) — phản hồi giờ nằm trong khối `exam-phan-hoi` tại ĐÚNG câu vừa
  // làm, không còn hiện ở đầu trang khi đã sang câu khác nữa. Sau khi tải
  // lại trang, câu 4 vừa hiện lên CHƯA từng được bấm trong phiên này nên
  // không có khối phản hồi nào cho nó — khẳng định luôn `exam-phan-hoi` cũng
  // vắng mặt, không chỉ testid cũ đã chết.
  await expect(page.getByTestId("exam-ket-qua-truoc")).toHaveCount(0);
  await expect(page.getByTestId("exam-phan-hoi")).toHaveCount(0);
});

test("làm bài buổi khác trong khi còn bài dang dở thì thấy cảnh báo lệch buổi (finding 5)", async ({ page }) => {
  await login(page);
  await page.goto("/vocab/learn/6");
  await page.getByTestId("exam-button").click();
  await expect(page).toHaveURL(/\/exam\/\d+$/);
  await expect(page.getByTestId("exam-heading")).toHaveText("Bài buổi 6");
  // Chưa có bài nào khác — chưa có gì để lệch.
  await expect(page.getByTestId("exam-lech-buoi")).toHaveCount(0);

  // Bấm LÀM BÀI ở một buổi KHÁC trong khi bài buổi 6 còn đang làm dở —
  // `batDauBaiThi` đưa thẳng vào lại bài buổi 6 (không phải buổi 7), kèm
  // buổi/loại VỪA BẤM trên query string.
  await page.goto("/vocab/learn/7");
  await page.getByTestId("exam-button").click();
  await expect(page).toHaveURL(/\/exam\/\d+\?tuLoai=lesson&tuBuoi=7$/);
  await expect(page.getByTestId("exam-heading")).toHaveText("Bài buổi 6");
  await expect(page.getByTestId("exam-lech-buoi")).toBeVisible();
});

test("bỏ bài lần hai từ tab khác (đã bị tab kia xoá trước) thì quay về /vocab, không rơi vào trang lỗi (Also)", async ({
  page,
  context,
}) => {
  await login(page);
  await page.goto("/vocab/learn/8");
  await page.getByTestId("exam-button").click();
  await expect(page).toHaveURL(/\/exam\/\d+$/);

  // Tab thứ hai, CÙNG một phiên đăng nhập (cùng context → cùng cookie) — mở
  // đúng bài đang làm dở, mô phỏng người học có hai tab cùng trỏ vào một bài.
  const tabHai = await context.newPage();
  await tabHai.goto(page.url());
  await expect(tabHai.getByTestId("exam-bo-bai")).toBeVisible();

  // Tab một bỏ bài trước — thành công, dòng `assessments` biến mất thật.
  await page.getByTestId("exam-bo-bai").click();
  await expect(page).toHaveURL(/\/vocab\/learn\/8$/);

  // Tab hai, KHÔNG biết dòng đã bị xoá, bấm "Bỏ bài" trên chính bài đó lần
  // NỮA. Trước bản vá (mục "Also"), nhánh "không tìm thấy dòng nào" ném lỗi
  // thật, rơi xuống error.tsx với thông điệp sai "mất mạng" — dòng đã biến
  // mất chính là điều người học MUỐN, không phải một lỗi.
  await tabHai.getByTestId("exam-bo-bai").click();
  await expect(tabHai).toHaveURL(/\/vocab$/);

  await tabHai.close();
});

test("đạt bài bổ túc thì thấy nút Làm lại bài, bấm vào dựng được bài chính mới (finding 6)", async ({ page }) => {
  // SỬA Ở LÁT "dừng lại xem kết quả": 240s (trước 180s) — cùng lý do đã ghi ở
  // kịch bản "trả lời sai hết...": mỗi câu giờ hai cú bấm thay vì một.
  test.setTimeout(240_000);
  await login(page);
  await page.goto("/vocab/learn/9");
  await page.getByTestId("exam-button").click();
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 1/30");

  // SỬA Ở LÁT "dừng lại xem kết quả": thêm cú bấm `exam-tiep-tuc` sau mỗi
  // phương án — cùng khuôn đã dùng ở kịch bản "trả lời sai hết...".
  for (let n = 1; n <= 30; n++) {
    await expect(page.getByTestId("exam-tien-do")).toHaveText(`Câu ${n}/30`);
    await page.getByTestId("exam-option").first().click();
    await expect(page.getByTestId("exam-tiep-tuc")).toBeVisible();
    await page.getByTestId("exam-tiep-tuc").click();
  }
  await expect(page).toHaveURL(/\/exam\/\d+\/ket-qua$/, { timeout: 90_000 });
  await expect(page.getByTestId("ket-qua-bo-tuc")).toBeVisible();

  await page.getByTestId("ket-qua-bo-tuc").click();
  await expect(page).toHaveURL(/\/exam\/\d+$/);
  const idBoTuc = page.url().match(/\/exam\/(\d+)$/)?.[1];
  expect(idBoTuc).toBeTruthy();

  // Ép bài bổ túc này ĐẠT trực tiếp qua admin (service role, bỏ qua RLS).
  // Mục tiêu của kịch bản này là GIAO DIỆN trang kết quả khi đã đạt bổ túc
  // (nút "Làm lại bài", spec §4) — không phải kiểm lại logic chấm điểm (đã có
  // tests/exam-security.test.ts lo phần đó). Trả lời đúng 30/30 một bài bổ
  // túc qua UI đòi biết trước đáp án thật của từng câu — thứ trang không hề
  // lộ ra, đúng thiết kế bảo mật của lát này (`payload` không bao giờ chứa
  // đáp án).
  const admin = adminClient();
  const { error } = await admin
    .from("assessments")
    .update({ status: "submitted", score: 100, passed: true, submitted_at: new Date().toISOString() })
    .eq("id", Number(idBoTuc));
  if (error) throw error;

  await page.goto(`/exam/${idBoTuc}/ket-qua`);
  await expect(page.getByTestId("ket-qua-lam-lai")).toBeVisible();

  await page.getByTestId("ket-qua-lam-lai").click();
  // Bài MỚI, dựng lại đúng BÀI CHÍNH (buổi 9) chứ không phải bài bổ túc.
  await expect(page).toHaveURL(/\/exam\/\d+$/);
  await expect(page.getByTestId("exam-heading")).toHaveText("Bài buổi 9");
  await expect(page.getByTestId("exam-option")).toHaveCount(4);
});

/* ───────────────── Vòng sửa 1 (review) — Important 1 ───────────────── */
//
// Ca cụ thể mà review chỉ ra: trả lời xong câu CUỐI, đọc phản hồi, rồi đóng
// tab TRƯỚC khi bấm "Nộp bài" — chỉ có thể xảy ra SAU lát "dừng lại xem kết
// quả" (nộp bài giờ là một cú bấm RIÊNG, tách khỏi việc trả lời câu cuối).
// Mở lại bài: cả 30 câu đã có `user_answer` trong database, nhưng trước bản
// sửa `chiSoDauTienChuaTraLoi` vẫn đưa `i` về câu 30 với `trangThai =
// "chua-tra-loi"` — hiện lại y hệt như thể câu đó CHƯA làm. Bấm một phương án
// ở đó thua CAS (`ghiNhanLanNay: false`), và giao diện có thể hiện một phán
// quyết đúng/sai không khớp thứ trang kết quả sẽ chấm.

test("đóng trang sau câu cuối mà chưa bấm Nộp bài thì mở lại thấy màn nộp bài, không phải câu cuối như chưa làm", async ({
  page,
}) => {
  // Cùng lý do nới timeout đã ghi ở "trả lời sai hết...": 30 câu, mỗi câu hai
  // cú bấm (trừ câu cuối — kịch bản này CỐ Ý không bấm "Nộp bài" ở câu cuối).
  test.setTimeout(240_000);
  await login(page);
  await page.goto("/vocab/learn/10");
  await page.getByTestId("exam-button").click();
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 1/30");

  for (let n = 1; n <= 30; n++) {
    await expect(page.getByTestId("exam-tien-do")).toHaveText(`Câu ${n}/30`);
    const guiDapAn = page.waitForResponse((r) => r.request().method() === "POST");
    await page.getByTestId("exam-option").first().click();
    await guiDapAn;
    await expect(page.getByTestId("exam-tiep-tuc")).toBeVisible();
    if (n < 30) {
      await page.getByTestId("exam-tiep-tuc").click();
    }
    // n === 30: KHÔNG bấm "Nộp bài" — đây là toàn bộ điểm của kịch bản: mô
    // phỏng đóng tab NGAY sau khi đọc phản hồi câu cuối, trước khi nộp.
  }

  const idBai = page.url().match(/\/exam\/(\d+)$/)?.[1];
  expect(idBai).toBeTruthy();

  // Mở lại — bài vẫn `in_progress`, đủ 30 câu đã có `user_answer`, `nopBai`
  // chưa từng được gọi. Trước bản sửa finding 1, đoạn này sẽ hiện lại "Câu
  // 30/30" với bốn phương án như chưa làm gì.
  await page.reload();

  await expect(page.getByTestId("exam-da-tra-loi-het")).toBeVisible();
  await expect(page.getByTestId("exam-option")).toHaveCount(0);

  await page.getByTestId("exam-tiep-tuc").click();
  await expect(page).toHaveURL(new RegExp(`/exam/${idBai}/ket-qua$`));
  await expect(page.getByTestId("ket-qua-diem")).toBeVisible();
});
