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
  // Dọn bài đang làm dở của CHÍNH tài khoản test, đúng khuôn `exam.spec.ts` —
  // chỉ số một-phần `assessments_one_in_progress` chỉ cho MỘT bài in_progress
  // mỗi người, và bộ e2e chạy `workers: 1` trên một tài khoản dùng chung. Bài
  // ôn tập nhóm (nút `on-tap-N`) tạo một dòng `assessments` y hệt bài buổi —
  // đi cùng đường xoá. `word_mastery` dọn riêng: kịch bản trả lời đủ 60 câu
  // bên dưới ghi một dòng mastery cho mỗi câu (qua `applyWordMastery` trong
  // `recordAnswer`), không cascade theo `assessments` khi xoá.
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

test("ô Ôn tập không còn ghi sắp có", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await expect(page.getByText("sắp có")).toHaveCount(0);
});

test("bấm ô Ôn tập vào được bài thi 60 câu", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("on-tap-1").click();

  await expect(page).toHaveURL(/\/exam\/\d+$/);
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 1/60");
  await expect(page.getByTestId("exam-option")).toHaveCount(4);
});

/* ───────────────── Yêu cầu F: tiêu đề và đường bỏ bài của bài ôn tập ───────────────── */

test("tiêu đề bài ôn tập nêu đúng tên nhóm; bỏ bài đưa về /vocab, không về buổi đầu (F)", async ({
  page,
}) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("on-tap-1").click();
  await expect(page).toHaveURL(/\/exam\/\d+$/);
  // Trước bản vá, `ExamRunner` gõ cứng `loaiBai: "lesson" | "remedial"` nên
  // một bài `review` rơi vào nhánh mặc định và hiện "Bài buổi ?" — không nói
  // được đang thi cái gì giữa 60 câu.
  await expect(page.getByTestId("exam-heading")).toHaveText("Bài ôn tập nhóm 1");

  await page.getByTestId("exam-bo-bai").click();
  // Trước bản vá, `boBaiThi` luôn đọc `scope[0]` (buổi ĐẦU của nhóm) bất kể
  // loại bài — đưa người bỏ dở một bài ôn tập nhóm về `/vocab/learn/1` thay
  // vì `/vocab`, nơi ô Ôn tập thật sự sống.
  await expect(page).toHaveURL(/\/vocab$/);
});

/* ───────────────── Yêu cầu D + E: bổ túc và làm lại bài từ bài ôn tập nhóm
   phải phủ ĐỦ HAI buổi — chặn hồi quy lỗi đọc `scope[0]` ───────────────── */
//
// Cả hai lỗi mà D và E mô tả có cùng một hình dạng: một hàm đọc CHỈ phần tử
// đầu của `scope`/`cha.scope` (một buổi) thay vì TOÀN BỘ (hai buổi của
// nhóm), và hỏng ÂM THẦM — không lỗi nào bật ra, chỉ thiếu đúng từ thuộc buổi
// THỨ HAI. Unit test của Task 2 (`tests/exam-review.test.ts`) đã pin lỗi này
// cho `batDauBoTuc`, nhưng bằng cách TÁI DỰNG logic của hàm chứ không gọi
// được chính "use server" action (Next 16: `cookies()` ném lỗi ngoài request
// scope). Kịch bản dưới đây gọi ĐÚNG các Server Action thật, qua UI — đây là
// tấm chắn hồi quy DUY NHẤT của `batDauBoTuc` và `lamLaiBai` cho đường ôn tập
// nhóm.
//
// Một kịch bản DUY NHẤT cho cả hai yêu cầu (không tách hai `test()` riêng):
// mỗi lượt trả lời đủ 60 câu tốn một vòng mạng thật/câu (~1s, xem ghi chú của
// `exam.spec.ts`) — chạy lại toàn bộ 60 câu một lần nữa chỉ để kiểm D thay vì
// tiếp tục NGAY từ bài bổ túc mà E vừa dựng ra sẽ tốn gấp đôi thời gian một
// cách vô ích.
test("bổ túc và làm lại bài từ bài ôn tập nhóm đều phủ đủ hai buổi, không chỉ buổi đầu (D, E)", async ({
  page,
}) => {
  // 60 câu trả lời tuần tự + một lượt "làm lại bài" — nới rộng hơn cả kịch
  // bản 30 câu của `exam.spec.ts` (Notes bàn giao: "cho timeout rộng rãi hơn
  // là cắt bớt phạm vi chạy"). SỬA Ở LÁT "dừng lại xem kết quả" (Task 4):
  // 600s (trước 400s) — mỗi câu giờ tốn HAI cú bấm (chọn phương án rồi
  // `exam-tiep-tuc`, xem vòng lặp bên dưới) thay vì một, cú bấm thứ hai phải
  // CHỜ khối `exam-phan-hoi` hiện ra trước khi actionable — cùng lý do đã ghi
  // ở `e2e/exam.spec.ts` (180s → 240s cho 30 câu ở đó); bài này gấp đôi số câu
  // (60) nên mức tăng cũng lớn hơn tương ứng.
  test.setTimeout(600_000);
  await login(page);
  const admin = adminClient();

  // Từ ID thuộc buổi THỨ HAI của nhóm 1 (ordinal 2, `lessonsOf(1) = [1, 2]`)
  // — tra thẳng qua `lessons`/`lesson_words` thay vì suy từ vị trí câu hỏi
  // trong bài: `buildVocabExam` (src/lib/exam/build.ts) TRỘN thứ tự câu bằng
  // `seededShuffle` trước khi gán `position`, nên 30 câu đầu/sau của bài ôn
  // tập KHÔNG còn theo đúng thứ tự buổi 1/buổi 2 mà `napPhamVi` đã gộp.
  const { data: buoiHai, error: buoiHaiErr } = await admin
    .from("lessons").select("id").eq("ordinal", 2).single();
  if (buoiHaiErr) throw buoiHaiErr;
  const { data: tuBuoiHai, error: tuBuoiHaiErr } = await admin
    .from("lesson_words").select("word_id").eq("lesson_id", buoiHai.id as number);
  if (tuBuoiHaiErr) throw tuBuoiHaiErr;
  const idBuoiHai = new Set((tuBuoiHai ?? []).map((r) => r.word_id as number));
  expect(idBuoiHai.size).toBe(30);

  await page.goto("/vocab");
  await page.getByTestId("on-tap-1").click();
  await expect(page).toHaveURL(/\/exam\/\d+$/);
  const idOnTap = page.url().match(/\/exam\/(\d+)$/)?.[1];
  expect(idOnTap).toBeTruthy();

  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 1/60");
  // Luôn chọn phương án đầu — cùng cách `exam.spec.ts` dùng để chắc chắn
  // trượt (mỗi câu ~25% trúng ngẫu nhiên vì 4 phương án đã trộn ngẫu nhiên
  // theo seed, xem build.ts): xác suất CẢ 30 câu thuộc buổi hai đều trúng
  // ngẫu nhiên là (1/4)^30 — không tưởng — nên gần như chắc chắn có ít nhất
  // một từ SAI thuộc buổi thứ hai để kịch bản này kiểm được đúng thứ cần kiểm.
  //
  // SỬA Ở LÁT "dừng lại xem kết quả" (Task 4): vòng lặp giờ có HAI cú bấm mỗi
  // câu — chọn phương án (dừng lại xem kết quả, không tự sang câu kế), rồi
  // bấm `exam-tiep-tuc` để thật sự sang câu kế. Nút đó cùng `data-testid` cho
  // cả câu giữa ("Tiếp tục") lẫn câu cuối ("Nộp bài" — xem `ExamRunner.tsx`),
  // nên vòng lặp không cần rẽ nhánh theo vị trí; câu cuối bấm xong
  // `exam-tiep-tuc` chính là bấm nộp bài. Cùng khuôn `e2e/exam.spec.ts`.
  for (let n = 1; n <= 60; n++) {
    await expect(page.getByTestId("exam-tien-do")).toHaveText(`Câu ${n}/60`);
    await page.getByTestId("exam-option").first().click();
    await expect(page.getByTestId("exam-tiep-tuc")).toBeVisible();
    await page.getByTestId("exam-tiep-tuc").click();
  }
  await expect(page).toHaveURL(/\/exam\/\d+\/ket-qua$/, { timeout: 180_000 });
  await expect(page.getByTestId("ket-qua-bo-tuc")).toBeVisible();

  // THÊM Ở VÒNG SOÁT CUỐI: spec §6, dòng cuối cùng — "nộp xong thì ô hiện
  // điểm" — chưa có phép kiểm e2e nào xác nhận ô Ôn tập trên `/vocab` đổi
  // khỏi "chưa học"/"đang thi" SAU khi nộp bài ôn tập nhóm. Tận dụng CHÍNH
  // bài vừa nộp ở trên thay vì dựng thêm một bài ôn tập 60 câu khác (mỗi vòng
  // trả lời tốn ~1 vòng mạng thật/câu, xem chú thích đầu file) — đi và quay
  // lại `/vocab` không tốn gì hơn một lượt điều hướng.
  await page.goto("/vocab");
  // Nhóm 1 là hàng ĐẦU TIÊN (groupStates dựng tuần tự group 1..10), và ô Ôn
  // tập là hoạt động thứ BA trong mỗi hàng ([buổi A, buổi B, ôn tập] —
  // progress.ts). Bài vừa nộp ở trên CHẮC CHẮN trượt (mọi câu đều cố tình
  // chọn phương án đầu, không phải đáp án thật — xem vòng lặp 60 câu phía
  // trên), nên `describe()` ((list)/page.tsx) phải hiện "{score}đ · bổ túc",
  // không còn "chưa học"/"đang thi" — kiểm cả chữ "đ" (đã có điểm số) lẫn
  // `data-kind` để không khoá cứng vào một điểm cụ thể (điểm phụ thuộc đáp án
  // ngẫu nhiên theo seed).
  const onTapNhom1 = page.getByTestId("group-row").first().getByTestId("activity").nth(2);
  await expect(onTapNhom1).toContainText("đ");
  await expect(onTapNhom1).toHaveAttribute("data-kind", "chua-dat");

  // Quay lại trang kết quả để tiếp tục kịch bản D/E bên dưới — điều hướng đi
  // rồi về không đổi trạng thái bài (đã `submitted`, không phải `in_progress`
  // để có gì mất khi rời trang).
  await page.goto(`/exam/${idOnTap}/ket-qua`);
  await expect(page.getByTestId("ket-qua-bo-tuc")).toBeVisible();

  // Đọc thẳng `assessment_items` qua admin (service role, bỏ qua RLS/grant
  // cột) thay vì RPC `wrong_items_for_assessment`: RPC đó kiểm `auth.uid()`
  // bên trong thân hàm (0008_assessment_items_grants.sql) — gọi bằng service
  // role không mang JWT người dùng nên `auth.uid()` là NULL, RPC luôn từ chối.
  const { data: cauHoiOnTap, error: cauHoiErr } = await admin
    .from("assessment_items")
    .select("ref_id, is_correct")
    .eq("assessment_id", Number(idOnTap));
  if (cauHoiErr) throw cauHoiErr;
  expect(cauHoiOnTap).toHaveLength(60);
  const saiBuoiHai = (cauHoiOnTap ?? [])
    .filter((r) => r.is_correct === false && idBuoiHai.has(r.ref_id as number))
    .map((r) => r.ref_id as number);
  // Sanity trước khi khẳng định điều thật sự muốn kiểm — nếu mảng này rỗng
  // (may rủi cực hiếm) thì kịch bản không kiểm được gì cho yêu cầu D/E.
  expect(saiBuoiHai.length).toBeGreaterThan(0);

  // (E) Bổ túc: nếu `batDauBoTuc` lùi về đọc `cha.scope[0]` (chỉ buổi đầu),
  // `napPhamVi` chỉ nạp 30 từ của buổi 1 — từ sai thuộc buổi hai bị LỌC MẤT
  // ÂM THẦM khỏi `tuSai` (không khớp `toanBoPhamVi`), không một lỗi nào bật
  // ra, chỉ thiếu đúng từ người học cần ôn nhất.
  await page.getByTestId("ket-qua-bo-tuc").click();
  await expect(page).toHaveURL(/\/exam\/\d+$/);
  const idBoTuc = page.url().match(/\/exam\/(\d+)$/)?.[1];
  expect(idBoTuc).toBeTruthy();

  const { data: itemsBoTuc, error: itemsBoTucErr } = await admin
    .from("assessment_items").select("ref_id").eq("assessment_id", Number(idBoTuc));
  if (itemsBoTucErr) throw itemsBoTucErr;
  const refIdsBoTuc = new Set((itemsBoTuc ?? []).map((r) => r.ref_id as number));
  for (const id of saiBuoiHai) expect(refIdsBoTuc.has(id)).toBe(true);

  // (D) Làm lại bài: ép bài bổ túc ĐẠT trực tiếp qua admin — cùng khuôn
  // `exam.spec.ts` ("đạt bài bổ túc thì thấy nút Làm lại bài"). Trả lời đúng
  // một bài bổ túc qua UI đòi biết trước đáp án thật, không lộ qua payload.
  const { error: updErr } = await admin
    .from("assessments")
    .update({ status: "submitted", score: 100, passed: true, submitted_at: new Date().toISOString() })
    .eq("id", Number(idBoTuc));
  if (updErr) throw updErr;

  await page.goto(`/exam/${idBoTuc}/ket-qua`);
  await expect(page.getByTestId("ket-qua-lam-lai")).toBeVisible();
  await page.getByTestId("ket-qua-lam-lai").click();
  await expect(page).toHaveURL(/\/exam\/\d+$/);
  const idLamLai = page.url().match(/\/exam\/(\d+)$/)?.[1];
  expect(idLamLai).toBeTruthy();
  expect(idLamLai).not.toBe(idOnTap);

  // Nếu `lamLaiBai` lùi về đọc `(cha.scope as number[])[0]`, bài dựng lại chỉ
  // còn `scope = [1]` và 30 câu của buổi đầu. Khẳng định `scope` đủ HAI
  // ordinal, đúng thứ tự, VÀ đủ 60 câu mới chặn được đúng lỗi đó.
  const { data: baiLamLai, error: baiLamLaiErr } = await admin
    .from("assessments").select("scope, type").eq("id", Number(idLamLai)).single();
  if (baiLamLaiErr) throw baiLamLaiErr;
  expect(baiLamLai?.scope).toEqual([1, 2]);
  expect(baiLamLai?.type).toBe("review");

  const { count: soCauLamLai, error: countErr } = await admin
    .from("assessment_items")
    .select("id", { count: "exact", head: true })
    .eq("assessment_id", Number(idLamLai));
  if (countErr) throw countErr;
  expect(soCauLamLai).toBe(60);

  await expect(page.getByTestId("exam-heading")).toHaveText("Bài ôn tập nhóm 1");
  await expect(page.getByTestId("exam-option")).toHaveCount(4);
});
