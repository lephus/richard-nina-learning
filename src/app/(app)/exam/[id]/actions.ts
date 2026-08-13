"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  baiDangLamCua, boBaiDangLam, recordAnswer, submitExam, timHoacDungBaiThi,
  type KetQuaTraLoi,
} from "@/lib/exam/run";
import { napPhamVi } from "@/lib/exam/load-scope";
import { lessonsOf, phamViThuocNhom } from "@/lib/curriculum/groups";

/** Dựng bài thi cho một buổi rồi chuyển thẳng vào bài. */
export async function batDauBaiThi(lessonId: number): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Kiểm TRƯỚC khi dựng bài mới, SỚM nhất có thể — trước cả hai lượt đọc
  // lesson_words/blank_answers_for_lesson bên dưới, để nhánh "làm tiếp" (case
  // thường gặp nhất của bẫy bỏ dở, yêu cầu C bàn giao) không phải trả giá hai
  // vòng mạng vô ích chỉ để rồi redirect. Đây là một TỐI ƯU đặt CHỒNG lên
  // trên sự đúng đắn mà `timHoacDungBaiThi` bên dưới tự đảm bảo được ngay cả
  // khi thiếu bước này (nó tự kiểm lại) — không phải điều kiện bắt buộc để
  // tránh 23505.
  // Finding 5 (vòng soát cuối): kèm buổi/loại bài VỪA BẤM vào query string khi
  // redirect sang một bài `in_progress` CÓ SẴN — trang `/exam/[id]` (page.tsx)
  // đọc lại hai tham số này để biết có phải người học đang bị đưa vào MỘT BÀI
  // KHÁC (buổi khác, hoặc bài bổ túc thay vì bài buổi) với thứ họ vừa bấm hay
  // không, và cảnh báo rõ thay vì im lặng — trước bản vá này, bấm LÀM BÀI ở
  // buổi B trong khi còn bài `in_progress` của buổi A lặng lẽ đưa thẳng vào
  // 30 câu của buổi A mà không một dấu hiệu nào cho biết đó không phải buổi
  // vừa bấm.
  const dangLam = await baiDangLamCua(supabase, user.id);
  // `tuBuoi` ở nhánh SỚM này vẫn mang `lessonId` (route param, một
  // `lessons.id`) CHƯA tra ngược thành ordinal — tra trước khi biết có cần
  // dựng bài mới hay không sẽ trả giá đúng một vòng mạng mà tấm chắn sớm này
  // tồn tại để tránh (xem khối chú thích ngay trên). Vô hại: `tuBuoi` ở đây
  // chỉ để `/exam/[id]` SO SÁNH với `scope[0]` của bài `in_progress` tìm được,
  // và `lessons.id === ordinal` cho cả 20 dòng hôm nay (`tests/db-integrity.test.ts`)
  // nên so sánh vẫn đúng — cùng mức tin cậy vào sự trùng hợp đó mà
  // `progress.ts`/`stats/compute.ts` đã dựa vào từ trước, không phải một nợ
  // MỚI phát sinh ở đây.
  if (dangLam !== null) redirect(`/exam/${dangLam}?tuLoai=lesson&tuBuoi=${lessonId}`);

  // SỬA Ở VÒNG SOÁT CUỐI lát 2c (mục 2): `napPhamVi` đòi ORDINAL buổi (nó tự
  // `.in("ordinal", …)` bên trong) — nhưng `lessonId` truyền vào hàm này là
  // `lessons.id` (route `/vocab/learn/[lessonId]` truyền thẳng khoá chính,
  // xem page.tsx ở đó). Bản TRƯỚC vòng soát này truyền thẳng `[lessonId]` vào
  // CẢ `napPhamVi` LẪN `scope` ghi xuống `assessments` — tức GHI một id rồi
  // mọi nơi khác (`progress.ts`, `stats/compute.ts`, chính `napPhamVi`) lại
  // ĐỌC LẠI đúng giá trị đó như một ordinal. "Đúng" trước đây chỉ vì
  // `lessons.id` trùng `ordinal` cho cả 20 dòng (`tests/db-integrity.test.ts`,
  // "lessons.id trùng với ordinal") — KHÔNG đúng bằng cấu trúc, hai nghĩa
  // khác nhau của cùng một cột chỉ tình cờ trùng số. Tra NGƯỢC một lần Ở ĐÂY
  // (`id -> ordinal`) rồi dùng đúng ordinal đó cho CẢ `napPhamVi` LẪN `scope`
  // — sau bản vá `scope` chỉ còn MỘT nghĩa (ordinal) ở khắp nơi. Rẻ để sửa
  // NGAY BÂY GIỜ trong khi bất biến id===ordinal còn được test trên giữ cho
  // vỡ ra thành tiếng nếu ai re-seed; sẽ đắt hơn nhiều nếu để tới lúc bất biến
  // đó vỡ thật (mọi bài `lesson`/`remedial` đã ghi từ trước sẽ mang `scope`
  // sai nghĩa, không migrate được bằng suy luận ngược).
  const { data: buoi, error: buoiErr } = await supabase
    .from("lessons").select("ordinal").eq("id", lessonId).single();
  if (buoiErr) throw buoiErr;
  const ordinal = buoi.ordinal as number;

  const { words, blankAnswers } = await napPhamVi(supabase, [ordinal]);

  // `timHoacDungBaiThi` chứ không `createVocabExam` thẳng: nó tự kiểm lại
  // (đường đua TOCTOU hiếm — hai request cùng lúc, ví dụ bấm đúp — có thể lọt
  // qua tấm chắn sớm ở trên) và tìm lại đúng bài đã thắng cuộc đua nếu insert
  // vẫn đâm 23505, thay vì để lỗi thô rơi xuống error.tsx.
  const id = await timHoacDungBaiThi(
    supabase, user.id, "lesson", [ordinal], words, blankAnswers, Date.now(),
  );
  redirect(`/exam/${id}`);
}

/**
 * Dựng bài ÔN TẬP cho một nhóm (60 từ, hai buổi liên tiếp) rồi chuyển thẳng
 * vào bài — nút Ôn tập (Task 3, lát 2c) đi đúng đường này, y hệt nút LÀM BÀI
 * của buổi thường đi qua `batDauBaiThi` ở trên.
 */
export async function batDauOnTap(groupId: number): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Cùng tối ưu + cùng cảnh báo lệch phạm vi đã dùng ở `batDauBaiThi` — xem
  // chú thích tại đó. `tuBuoi` ở đây chỉ mang MỘT giá trị (trang `/exam/[id]`
  // hiện chỉ so khớp `scope[0]`) nên dùng buổi ĐẦU của nhóm — đủ để phát hiện
  // lệch nhóm/lệch loại bài, dù không phân biệt được lệch ở buổi thứ hai.
  const dangLam = await baiDangLamCua(supabase, user.id);
  if (dangLam !== null) {
    redirect(`/exam/${dangLam}?tuLoai=review&tuBuoi=${lessonsOf(groupId)[0]}`);
  }

  const { words, blankAnswers } = await napPhamVi(supabase, lessonsOf(groupId));

  // `scope` PHẢI là mảng HAI ordinal buổi, đúng thứ tự `lessonsOf` trả về —
  // KHÔNG phải `[groupId]`. `progress.ts:108` so khớp bài với ô Ôn tập bằng
  // `sameScope(r.scope, lessonsOf(group))`; ghi sai thứ tự hoặc ghi `[groupId]`
  // thì bài nộp xong sẽ không khớp ô nào và ô Ôn tập vĩnh viễn hiện "chưa làm"
  // — hỏng ÂM THẦM, không một lỗi nào bật ra (thiết kế lát 2c mục 2). Nguồn
  // nhiễu bỏ trống (không truyền `distractorPool`) là ĐÚNG ý — `buildVocabExam`
  // mặc định lấy `words` làm nguồn nhiễu khi không truyền, và `words` ở đây đã
  // là đủ 60 từ của nhóm, đúng yêu cầu "nguồn nhiễu là cả 60 từ".
  const id = await timHoacDungBaiThi(
    supabase, user.id, "review", [...lessonsOf(groupId)], words, blankAnswers, Date.now(),
  );
  redirect(`/exam/${id}`);
}

export async function traLoi(
  assessmentId: number, position: number, answer: string,
): Promise<KetQuaTraLoi> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return recordAnswer(supabase, user.id, assessmentId, position, answer);
}

export async function nopBai(assessmentId: number): Promise<void> {
  const supabase = await createClient();
  await submitExam(supabase, assessmentId);
  redirect(`/exam/${assessmentId}/ket-qua`);
}

/**
 * Bỏ bài đang làm dở — lối thoát cho người học không muốn làm tiếp bài cũ mà
 * `batDauBaiThi`/`batDauBoTuc` đưa họ vào lại (xem yêu cầu C bàn giao). Đặt ở
 * ngay trang thi (`ExamRunner`, `data-testid="exam-bo-bai"`) vì đó là chỗ
 * người học bị kẹt thật sự đang đứng.
 */
export async function boBaiThi(assessmentId: number): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const baiDaXoa = await boBaiDangLam(supabase, user.id, assessmentId);
  if (baiDaXoa === null) {
    // `boBaiDangLam` khớp 0 dòng — CAS trong chính lệnh xoá thua (SỬA SAU
    // VÒNG SOÁT 1, finding 1): bài không còn `in_progress` đúng vào lúc lệnh
    // xoá chạy tới, HOẶC không tồn tại/không phải của người dùng này. Đọc
    // LẠI ở đây (không dùng bất kỳ giá trị nào đọc TRƯỚC lệnh xoá —
    // đó chính là khe hở TOCTOU vừa đóng) để phân biệt ba trường hợp:
    //   - Đã `submitted`: một tab khác vừa nộp giữa lúc người học bấm Bỏ bài
    //     — đưa thẳng sang trang kết quả THẬT của bài đó, đúng tinh thần yêu
    //     cầu C (không để người học rơi vào error.tsx với thông điệp sai
    //     "mất mạng" — finding 3 vòng soát 1 chỉ đích danh chính cái bẫy này).
    //   - Không còn dòng nào (dù CỦA user_id này hay không): SỬA SAU VÒNG
    //     SOÁT CUỐI (mục "Also") — trước bản vá này nhánh này ném lỗi thật,
    //     rơi xuống error.tsx với thông điệp sai "mất mạng", cho CẢ trường
    //     hợp lành tính "bấm Bỏ bài LẦN HAI (tab khác, double-click) sau khi
    //     lần đầu đã xoá xong" — dòng đã biến mất chính là điều người học
    //     MUỐN, không phải một lỗi. Coi nó là THÀNH CÔNG: quay lại `/vocab`
    //     thay vì báo lỗi. Nhánh còn lại (bài của người dùng khác) rơi vào
    //     đúng chỗ này cũng vô hại — hành vi giống hệt "không tìm thấy",
    //     không lộ thêm thông tin nào so với trước.
    const { data: bai, error: baiErr } = await supabase
      .from("assessments")
      .select("status")
      .eq("id", assessmentId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (baiErr) throw baiErr;
    if (bai?.status === "submitted") redirect(`/exam/${assessmentId}/ket-qua`);
    if (bai === null) redirect("/vocab");
    throw new Error(`không bỏ được bài ${assessmentId} — không phải của bạn`);
  }

  // SỬA Ở LÁT 2c (yêu cầu F), MỞ RỘNG Ở VÒNG SOÁT CUỐI (mục 1): bài `review`
  // (ôn tập nhóm) không thuộc buổi nào — bản gốc của bản vá F chỉ chặn theo
  // `type === "review"`, bỏ sót đúng MỘT trường hợp: một bài `remedial` SINH
  // RA từ một bài `review` (xem `batDauBoTuc`) giữ nguyên `type: "remedial"`
  // nhưng vẫn mang `scope` HAI phần tử của cha — bỏ dở nó rồi lại rơi xuống
  // nhánh dưới, đọc `scope[0]` (buổi ĐẦU của nhóm) và đưa người học về
  // `/vocab/learn/<buổi đầu>` thay vì `/vocab`, đúng cái bẫy mà bản vá F được
  // viết ra để đóng, chỉ lọt qua một cửa khác. `phamViThuocNhom` (đếm phần tử
  // `scope`, không đọc `type`) là predicate DUY NHẤT cho "phạm vi này thuộc
  // một NHÓM, không phải một buổi" — dùng chung ở đây, ở trang kết quả, và ở
  // tiêu đề `ExamRunner`, để ba chỗ này không trôi dạt khỏi nhau lần nữa.
  if (phamViThuocNhom(baiDaXoa.scope)) redirect("/vocab");

  // `scope` rỗng không nên xảy ra (bài lesson/remedial của MỘT buổi luôn ghi
  // đúng một phần tử vào scope, xem createVocabExam) — SỬA chú thích ở vòng
  // soát cuối: khẳng định cũ "bài lesson/remedial luôn ghi đúng một buổi" bỏ
  // sót đúng trường hợp vừa chặn ở nhánh trên (remedial sinh từ review, HAI
  // phần tử) — nhánh đó đã redirect và return ở trên, nên xuống tới đây chỉ
  // còn bài một-buổi thật sự. Chặn tường minh thay vì âm thầm điều hướng tới
  // `/vocab/learn/undefined`.
  const lessonId = baiDaXoa.scope[0];
  if (lessonId === undefined) {
    throw new Error(`bài ${assessmentId} có scope rỗng, không xác định được buổi để quay lại`);
  }
  redirect(`/vocab/learn/${lessonId}`);
}
