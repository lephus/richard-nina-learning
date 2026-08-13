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

  // Trả lời 3 câu đầu, đợi ĐÚNG response của từng câu trước khi bấm câu kế —
  // cùng lý do đã ghi ở kịch bản "bấm một đáp án là sang câu sau ngay": phải
  // chắc chắn câu trả lời đã NẰM TRONG DATABASE trước khi tải lại trang bên
  // dưới, nếu không việc "mất tiến độ" đo được có thể chỉ là do request còn
  // đang bay, không phải do lỗi ở logic khôi phục.
  for (let n = 1; n <= 3; n++) {
    const guiDapAn = page.waitForResponse((r) => r.request().method() === "POST");
    await page.getByTestId("exam-option").first().click();
    await guiDapAn;
  }
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 4/30");

  // SỬA SAU VÒNG SOÁT CUỐI: trước bản vá, `/exam/[id]` luôn khởi động
  // `ExamRunner` ở câu 1 bất kể đã trả lời bao nhiêu câu — tải lại trang ở
  // đây sẽ tụt về lại "Câu 1/30" dù 3 câu đầu đã ghi xong trong database.
  await page.reload();
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 4/30");
  // Không có dải "câu trước: đúng/sai" nào — trang không đọc được `is_correct`
  // (cột đã bị thu hồi khỏi `authenticated`), nên không được đoán bừa cho một
  // câu vừa hiện lên sau khi tải lại trang mà chưa hề vừa được bấm trong
  // phiên này.
  await expect(page.getByTestId("exam-ket-qua-truoc")).toHaveCount(0);
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
  test.setTimeout(180_000);
  await login(page);
  await page.goto("/vocab/learn/9");
  await page.getByTestId("exam-button").click();
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 1/30");

  for (let n = 1; n <= 30; n++) {
    await expect(page.getByTestId("exam-tien-do")).toHaveText(`Câu ${n}/30`);
    await page.getByTestId("exam-option").first().click();
  }
  await expect(page).toHaveURL(/\/exam\/\d+\/ket-qua$/, { timeout: 60_000 });
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
