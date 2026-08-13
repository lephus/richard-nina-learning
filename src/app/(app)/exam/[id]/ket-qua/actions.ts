"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { baiDangLamCua, timHoacDungBaiThi } from "@/lib/exam/run";
import { toVocabLite, type VocabLite } from "@/lib/vocab/word";

/** Một dòng `vocab_words` đọc qua quan hệ nhúng — cùng khuôn với `exam/[id]/actions.ts`. */
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
 * Nguồn nhiễu là phạm vi (scope) của bài CHA — TOÀN BỘ buổi, không phải danh
 * sách từ sai: sai 2 từ thì không đủ 4 phương án, và `buildVocabExam` sẽ nổ
 * đúng như thiết kế ("không đủ phương án nhiễu"). Bảng đáp án câu điền
 * (`blank_answers_for_lesson`) vì lý do tương tự cũng phải phủ TOÀN BỘ buổi:
 * `buildVocabExam` tra `blankAnswers.get(...)` cho từng ứng viên nhiễu lấy từ
 * `distractorPool` (toàn buổi), không chỉ từ các từ sai.
 */
export async function batDauBoTuc(assessmentId: number): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Cùng tấm chắn với `batDauBaiThi` (yêu cầu C bàn giao), và cùng lý do CHỈ
  // là một TỐI ƯU (bỏ qua ba lượt đọc bên dưới khi biết chắc sẽ redirect) —
  // xem chú thích tại chỗ gọi tương ứng trong `batDauBaiThi`. Bổ túc là một
  // đường dựng bài NGANG HÀNG với LÀM BÀI — cùng bẫy bỏ dở áp dụng y hệt: bấm
  // Bổ túc, bỏ dở bài bổ túc, quay lại trang kết quả bấm Bổ túc lần nữa sẽ
  // đâm vào đúng chỉ số đó nếu không kiểm trước.
  const dangLam = await baiDangLamCua(supabase, user.id);
  if (dangLam !== null) redirect(`/exam/${dangLam}`);

  const { data: sai, error: saiErr } = await supabase
    .rpc("wrong_items_for_assessment", { p_assessment_id: assessmentId });
  if (saiErr) throw saiErr;
  const idSai = (sai as { ref_id: number }[]).map((r) => r.ref_id);
  if (idSai.length === 0) redirect(`/exam/${assessmentId}/ket-qua`);

  const { data: cha, error: chaErr } = await supabase
    .from("assessments").select("scope").eq("id", assessmentId).single();
  if (chaErr) throw chaErr;
  // `noUncheckedIndexedAccess` suy chỉ số mảng ra `number | undefined` dù
  // `scope` là cột `int[] not null` và bài lesson/remedial luôn ghi đúng một
  // phần tử (xem `createVocabExam`) — chặn tường minh ở đây thay vì ép kiểu,
  // cùng khuôn `ExamRunner.tsx` đã dùng cho chính vấn đề này.
  const lessonId = (cha.scope as number[])[0];
  if (lessonId === undefined) {
    throw new Error(`bài ${assessmentId} có scope rỗng, không xác định được buổi`);
  }

  const { data: lw, error: lwErr } = await supabase
    .from("lesson_words")
    .select("word_id, vocab_words(id, word, pos, ipa, meaning_vi, definition_en, synonyms, example_en, example_vi)")
    .eq("lesson_id", lessonId).order("position");
  if (lwErr) throw lwErr;

  // Cùng cách chuẩn hoá quan hệ nhúng như `batDauBaiThi` — postgrest-js đôi
  // khi trả quan hệ 1-1 thành MẢNG.
  const rows = (lw ?? []) as unknown as LessonWordRow[];
  const toanBuoi: VocabLite[] = rows.map((r) => {
    const v = Array.isArray(r.vocab_words) ? r.vocab_words[0] : r.vocab_words;
    if (!v) throw new Error(`thiếu vocab_words cho word_id ${r.word_id}`);
    return toVocabLite(v);
  });

  const { data: blanks, error: blankErr } = await supabase
    .rpc("blank_answers_for_lesson", { p_lesson_id: lessonId });
  if (blankErr) throw blankErr;
  // RPC trả về MỘT object JSONB, không phải mảng — xem chú thích tại
  // `batDauBaiThi` (exam/[id]/actions.ts) đã đo lỗi này thật.
  const bang = new Map(
    Object.entries(blanks as Record<string, string>).map(
      ([wordId, blankAnswer]) => [Number(wordId), blankAnswer] as [number, string],
    ),
  );

  const tuSai = toanBuoi.filter((w) => idSai.includes(w.id));
  // `timHoacDungBaiThi` chứ không `createVocabExam` thẳng — cùng lý do đã
  // ghi ở `batDauBaiThi`: tự đóng đường đua TOCTOU nếu tấm chắn sớm ở trên
  // lọt (hai request cùng lúc), tìm lại đúng bài đã thắng thay vì để 23505
  // thô rơi xuống error.tsx.
  const id = await timHoacDungBaiThi(
    supabase, user.id, "remedial", [lessonId], tuSai, bang, Date.now(),
    assessmentId, toanBuoi,
  );
  redirect(`/exam/${id}`);
}
