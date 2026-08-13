"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { baiDangLamCua, timHoacDungBaiThi } from "@/lib/exam/run";
import { napPhamVi } from "@/lib/exam/load-scope";
import { toVocabLite, type VocabLite } from "@/lib/vocab/word";

/**
 * Một dòng `vocab_words` đọc qua quan hệ nhúng — cùng khuôn với `exam/[id]/actions.ts`.
 *
 * CÒN DÙNG Ở ĐÂY: chỉ còn một nơi gọi trong tệp này (`lamLaiBai`, cuối tệp) —
 * `batDauBoTuc` đã chuyển sang `napPhamVi` (lát 2c) nên không còn cần bản chép
 * này nữa. `lamLaiBai` KHÔNG nằm trong phạm vi Task 2 (không được liệt trong
 * bàn giao), nên giữ nguyên bản chép tay của nó ở đây thay vì rewiring luôn —
 * xoá interface này sẽ làm `lamLaiBai` không biên dịch được (`tsc` xác nhận
 * điều này khi thử xoá thẳng).
 */
interface VocabWordRow {
  id: number; word: string; pos: string; ipa: string;
  meaning_vi: string; definition_en: string; synonyms: string[];
  example_en: string; example_vi: string;
}
interface LessonWordRow {
  word_id: number;
  vocab_words: VocabWordRow | VocabWordRow[];
}

/**
 * Dựng bài bổ túc từ các từ SAI của bài cha.
 *
 * Nguồn nhiễu là phạm vi (scope) của bài CHA — TOÀN BỘ phạm vi đó, không phải
 * danh sách từ sai: sai 2 từ thì không đủ 4 phương án, và `buildVocabExam` sẽ
 * nổ đúng như thiết kế ("không đủ phương án nhiễu"). Bảng đáp án câu điền vì
 * lý do tương tự cũng phải phủ TOÀN BỘ phạm vi cha: `buildVocabExam` tra
 * `blankAnswers.get(...)` cho từng ứng viên nhiễu lấy từ `distractorPool`
 * (toàn bộ phạm vi cha), không chỉ từ các từ sai. Bài cha là `lesson`/`remedial`
 * thì đó là 30 từ một buổi; bài cha là `review` (lát 2c) thì đó là 60 từ hai
 * buổi — `napPhamVi` bên dưới xử lý cả hai như nhau, nhận bao nhiêu ordinal
 * cũng gộp đủ.
 */
export async function batDauBoTuc(assessmentId: number): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // SỬA SAU VÒNG SOÁT CUỐI (finding 5): đọc `scope` của bài CHA trước khi
  // kiểm `dangLam`, khác thứ tự bản gốc (đọc scope SAU, chỉ khi chắc chắn cần
  // dựng bài mới) — đổi lại vì tấm chắn `dangLam` bên dưới giờ cần mang theo
  // buổi/loại bài VỪA BẤM trên query string để `/exam/[id]` biết cảnh báo
  // đúng khi bài `in_progress` tìm thấy KHÔNG phải bài bổ túc này (xem
  // `page.tsx`). Cái giá: một lượt đọc PK rẻ (`assessments` theo `id`) chạy
  // cả khi sắp redirect — vẫn còn bỏ được ba lượt đọc nặng hơn phía dưới
  // (RPC wrong_items, lesson_words, blank_answers_for_lesson qua `napPhamVi`),
  // nên phần lớn tối ưu gốc vẫn giữ nguyên.
  const { data: cha, error: chaErr } = await supabase
    .from("assessments").select("scope").eq("id", assessmentId).single();
  if (chaErr) throw chaErr;
  // SỬA Ở LÁT 2c: bản trước đọc `(cha.scope as number[])[0]` với chú thích
  // khẳng định "bài lesson/remedial luôn ghi đúng một phần tử" — khẳng định
  // đó SAI kể từ khi bài `review` tồn tại (`batDauOnTap`, exam/[id]/actions.ts,
  // ghi `scope = lessonsOf(group)`, HAI phần tử). Bổ túc dựng từ một bài
  // `review` trượt mà chỉ đọc `scope[0]` sẽ nạp phạm vi nhiễu CHỈ MỘT buổi —
  // nếu từ sai thuộc buổi còn lại, nó bị lọc mất khỏi `tuSai` bên dưới một
  // cách ÂM THẦM (không ném lỗi gì) và bài bổ túc thiếu đúng từ người học cần
  // ôn lại nhất. Nạp TOÀN BỘ `phamViCha` — không giới hạn ở phần tử đầu.
  const phamViCha = cha.scope as number[];
  if (phamViCha.length === 0) {
    throw new Error(`bài ${assessmentId} có scope rỗng, không xác định được buổi`);
  }

  // Cùng tấm chắn với `batDauBaiThi` (yêu cầu C bàn giao) — bổ túc là một
  // đường dựng bài NGANG HÀNG với LÀM BÀI — cùng bẫy bỏ dở áp dụng y hệt: bấm
  // Bổ túc, bỏ dở bài bổ túc, quay lại trang kết quả bấm Bổ túc lần nữa sẽ
  // đâm vào đúng chỉ số đó nếu không kiểm trước. `tuBuoi` chỉ mang MỘT giá
  // trị (trang `/exam/[id]` hiện chỉ so khớp `scope[0]`, xem page.tsx) — dùng
  // buổi ĐẦU của phạm vi cha, đủ để cảnh báo lệch bài/lệch nhóm.
  const dangLam = await baiDangLamCua(supabase, user.id);
  if (dangLam !== null) {
    redirect(`/exam/${dangLam}?tuLoai=remedial&tuBuoi=${phamViCha[0]}`);
  }

  const { data: sai, error: saiErr } = await supabase
    .rpc("wrong_items_for_assessment", { p_assessment_id: assessmentId });
  if (saiErr) throw saiErr;
  const idSai = (sai as { ref_id: number }[]).map((r) => r.ref_id);
  if (idSai.length === 0) redirect(`/exam/${assessmentId}/ket-qua`);

  // `napPhamVi` (lát 2c) thay cho bản chép tay lesson_words/blank_answers_for_lesson
  // từng nằm ở đây — gộp đủ TOÀN BỘ `phamViCha`, dù một hay hai ordinal.
  const { words: toanBoPhamVi, blankAnswers: bang } = await napPhamVi(supabase, phamViCha);

  const tuSai = toanBoPhamVi.filter((w) => idSai.includes(w.id));
  // `timHoacDungBaiThi` chứ không `createVocabExam` thẳng — cùng lý do đã
  // ghi ở `batDauBaiThi`: tự đóng đường đua TOCTOU nếu tấm chắn sớm ở trên
  // lọt (hai request cùng lúc), tìm lại đúng bài đã thắng thay vì để 23505
  // thô rơi xuống error.tsx.
  // `scope` của bài bổ túc mới PHẢN ÁNH ĐÚNG phạm vi bài cha — `phamViCha`
  // nguyên vẹn (một hay hai ordinal), không thu hẹp về một phần tử: giữ đúng
  // bất biến "bổ túc mang cùng phạm vi với cha" cho cả hai loại cha (`lesson`
  // lẫn `review`), thay vì chỉ đúng cho `lesson` như bản trước.
  const id = await timHoacDungBaiThi(
    supabase, user.id, "remedial", phamViCha, tuSai, bang, Date.now(),
    assessmentId, toanBoPhamVi,
  );
  redirect(`/exam/${id}`);
}

/**
 * "Làm lại bài" — chỉ hợp lệ trên một bài BỔ TÚC ĐÃ ĐẠT (spec mục 4: "Đạt bổ
 * túc → nút 'Làm lại bài', dựng lại bài chính cùng phạm vi, seed mới").
 *
 * Thêm ở vòng soát cuối (finding 6): đạt bổ túc KHÔNG tự đổi trạng thái của
 * lần thử CHÍNH (`src/lib/curriculum/progress.ts`, hàm `activityState`, chỉ
 * xét lần thử mới nhất CÙNG LOẠI `lesson`/`review` — bổ túc là loại khác nên
 * không lọt vào đó). Không có nút này, người trượt bài chính rồi đạt bổ túc
 * không còn đường nào quay lại "đạt" cho lần thử chính — `groupDone` đòi
 * MỌI hoạt động đều "dat" nên cả nhóm không bao giờ hoàn thành được.
 *
 * Dựng lại đúng BÀI CHA (`parent_id`) — cùng loại, cùng phạm vi, seed mới —
 * chứ không phải làm lại chính bài bổ túc: bài bổ túc chỉ phủ các từ đã sai
 * của MỘT lần trượt, còn cái cần một lần "đạt" mới là bài CHÍNH (30 từ đủ).
 */
export async function lamLaiBai(assessmentId: number): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dangLam = await baiDangLamCua(supabase, user.id);
  if (dangLam !== null) redirect(`/exam/${dangLam}`);

  const { data: bai, error: baiErr } = await supabase
    .from("assessments").select("type, parent_id").eq("id", assessmentId).single();
  if (baiErr) throw baiErr;
  const parentId = bai.parent_id as number | null;
  // Chặn tường minh thay vì giả định: `parent_id` luôn có giá trị cho một bài
  // `remedial` (xem `createVocabExam`, `batDauBoTuc` truyền `assessmentId`
  // vào tham số `parentId`) — nếu bấm nút này trên một bài KHÔNG phải bổ túc
  // (không nên xảy ra qua giao diện, nút chỉ hiện khi `type==='remedial'` và
  // `passed===true`, xem `ket-qua/page.tsx`), nói rõ thay vì âm thầm tạo
  // nhầm bài.
  if (bai.type !== "remedial" || parentId === null) {
    throw new Error(`bài ${assessmentId} không phải bài bổ túc, không "làm lại" được`);
  }

  const { data: cha, error: chaErr } = await supabase
    .from("assessments").select("type, scope").eq("id", parentId).single();
  if (chaErr) throw chaErr;
  const lessonId = (cha.scope as number[])[0];
  if (lessonId === undefined) {
    throw new Error(`bài cha ${parentId} có scope rỗng, không xác định được buổi`);
  }

  // Cùng cách đọc lesson_words/blank_answers_for_lesson như `batDauBaiThi` —
  // bài chính luôn phủ TOÀN BỘ 30 từ của buổi, không thu hẹp theo từ sai như
  // `batDauBoTuc` ở trên.
  const { data: lw, error: lwErr } = await supabase
    .from("lesson_words")
    .select("word_id, vocab_words(id, word, pos, ipa, meaning_vi, definition_en, synonyms, example_en, example_vi)")
    .eq("lesson_id", lessonId).order("position");
  if (lwErr) throw lwErr;
  const rows = (lw ?? []) as unknown as LessonWordRow[];
  const words: VocabLite[] = rows.map((r) => {
    const v = Array.isArray(r.vocab_words) ? r.vocab_words[0] : r.vocab_words;
    if (!v) throw new Error(`thiếu vocab_words cho word_id ${r.word_id}`);
    return toVocabLite(v);
  });

  const { data: blanks, error: blankErr } = await supabase
    .rpc("blank_answers_for_lesson", { p_lesson_id: lessonId });
  if (blankErr) throw blankErr;
  const bang = new Map(
    Object.entries(blanks as Record<string, string>).map(
      ([wordId, blankAnswer]) => [Number(wordId), blankAnswer] as [number, string],
    ),
  );

  // `cha.type` chỉ có thể là `"lesson"` trong phạm vi lát này (bài ngữ
  // pháp/ôn tập nhóm là lát sau — xem spec mục "Không thuộc phạm vi"); ép
  // kiểu tường minh thay vì mở rộng chữ ký `timHoacDungBaiThi` cho những loại
  // chưa ai gọi tới.
  const id = await timHoacDungBaiThi(
    supabase, user.id, cha.type as "lesson" | "remedial", [lessonId], words, bang, Date.now(),
  );
  redirect(`/exam/${id}`);
}
