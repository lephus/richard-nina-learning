import type { SupabaseClient } from "@supabase/supabase-js";
import { toVocabLite, type VocabLite } from "@/lib/vocab/word";

/** Một dòng `vocab_words` đọc qua quan hệ nhúng — cùng khuôn với các bản gốc ở `exam/[id]/actions.ts`. */
interface VocabWordRow {
  id: number; word: string; pos: string; ipa: string;
  meaning_vi: string; definition_en: string; synonyms: string[];
  example_en: string; example_vi: string;
}
interface LessonWordRow {
  word_id: number;
  vocab_words: VocabWordRow | VocabWordRow[];
}

/** Kết quả gom từ theo một dải buổi: từ theo đúng thứ tự, và đáp án điền cho từng từ. */
export interface PhamViBaiThi {
  words: VocabLite[];
  blankAnswers: Map<number, string>;
}

/**
 * Gom `VocabLite[]` và bảng đáp án điền cho một dải buổi, theo ORDINAL buổi
 * (1..20) — không phải `lessons.id`. Dùng chung cho cả ba đường dựng bài: bài
 * buổi (`exam/[id]/actions.ts`, một ordinal), bài ôn tập nhóm (lát 2c, hai
 * ordinal của cùng một nhóm), và bài bổ túc (`ket-qua/actions.ts`, một
 * ordinal, phạm vi nhiễu vẫn phải phủ TOÀN BỘ buổi — xem chú thích tại
 * `batDauBoTuc`).
 *
 * Nhận ordinal rồi tự tra `id` bên trong, KHÔNG dựa vào `lessons.id ===
 * ordinal` — sự trùng hợp đó chỉ đúng hôm nay vì seed chưa từng reset
 * sequence (xem `tests/db-integrity.test.ts`, test "lessons.id trùng với
 * ordinal"). Hai bản chép cũ (`exam/[id]/actions.ts`, `ket-qua/actions.ts`)
 * đều nhận thẳng `lessons.id` từ route param/`assessments.scope` nên chưa
 * từng cần bước tra này; gộp vào một hàm dùng ordinal buộc phải thêm nó, kẻo
 * đường ôn tập nhóm (lát 2c) lại chép tiếp chính sự nhầm lẫn ordinal↔id mà
 * vòng soát lát 2b đã ghi thành nợ.
 *
 * Ném khi thiếu — không bao giờ trả phạm vi ngắn hơn yêu cầu, vì
 * `buildVocabExam` phía sau mới ném ở một chỗ khó truy hơn nhiều (giữa lúc
 * dựng câu điền cho buổi bị thiếu).
 */
export async function napPhamVi(
  supabase: SupabaseClient,
  lessonOrdinals: readonly number[],
): Promise<PhamViBaiThi> {
  const { data: lessons, error: lessonErr } = await supabase
    .from("lessons")
    .select("id, ordinal")
    .in("ordinal", lessonOrdinals as number[]);
  if (lessonErr) throw lessonErr;

  const idCuaOrdinal = new Map(
    (lessons ?? []).map((l) => [l.ordinal as number, l.id as number]),
  );
  // Ném ngay nếu thiếu ordinal nào — không lặng lẽ bỏ qua buổi không tồn tại.
  for (const ord of lessonOrdinals) {
    if (!idCuaOrdinal.has(ord)) {
      throw new Error(`không tìm thấy buổi ứng với ordinal ${ord}`);
    }
  }

  const words: VocabLite[] = [];
  const bang = new Map<number, string>();

  // Tuần tự theo TỪNG buổi, giữ đúng thứ tự buổi rồi mới tới thứ tự từ trong
  // buổi (yêu cầu ordering) — gộp một lượt `.in("lesson_id", ids)` duy nhất
  // sẽ trả về theo thứ tự `lesson_id, position` của Postgres chứ không chắc
  // theo thứ tự `lessonOrdinals` truyền vào.
  for (const ord of lessonOrdinals) {
    const lessonId = idCuaOrdinal.get(ord);
    if (lessonId === undefined) continue; // đã ném ở vòng kiểm trên, không tới được đây

    const { data: lw, error: lwErr } = await supabase
      .from("lesson_words")
      .select("word_id, vocab_words(id, word, pos, ipa, meaning_vi, definition_en, synonyms, example_en, example_vi)")
      .eq("lesson_id", lessonId)
      .order("position");
    if (lwErr) throw lwErr;

    // postgrest-js đôi khi trả quan hệ 1-1 thành MẢNG (không có generic
    // Database trên client để nó suy đúng bản chất FK). Không chuẩn hoá thì ô
    // render rỗng mà không có lỗi nào — đúng cái bẫy ghi ở mục 7 tài liệu bàn
    // giao. Ép qua `unknown` trước vì kiểu postgrest-js suy ra và kiểu tay
    // viết ở đây không giao nhau đủ để TS cho ép thẳng.
    const rows = (lw ?? []) as unknown as LessonWordRow[];
    for (const r of rows) {
      const v = Array.isArray(r.vocab_words) ? r.vocab_words[0] : r.vocab_words;
      if (!v) throw new Error(`thiếu vocab_words cho word_id ${r.word_id}`);
      words.push(toVocabLite(v));
    }

    const { data: blanks, error: blankErr } = await supabase
      .rpc("blank_answers_for_lesson", { p_lesson_id: lessonId });
    if (blankErr) throw blankErr;
    // RPC trả về MỘT object JSONB — `jsonb_object_agg(v.id::text,
    // v.blank_answer)` (0007_assessment_parent.sql:50-60) — KHÔNG PHẢI mảng
    // {word_id, blank_answer}[]. Dùng `Object.entries` để quy về `Map<number,
    // string>` cho khớp chữ ký `blankAnswers` mà `buildVocabExam` đòi.
    for (const [wordId, blankAnswer] of Object.entries(blanks as Record<string, string>)) {
      bang.set(Number(wordId), blankAnswer);
    }
  }

  return { words, blankAnswers: bang };
}
