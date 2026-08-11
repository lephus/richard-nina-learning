import type { SupabaseClient } from "@supabase/supabase-js";
import { toVocabLite, type VocabLite } from "./word";

/**
 * Một thẻ từ ĐÃ SẴN SÀNG gửi xuống trình duyệt.
 *
 * Khác `VocabLite` ở hai điểm, và cả hai đều có chủ đích:
 *  - `exampleEn` đã được ĐIỀN LẠI từ vào chỗ "___", nên đọc được như câu gốc.
 *  - KHÔNG có `blankAnswer`. Đó là đáp án của câu điền từ ở lát 2b; nó không
 *    bao giờ rời server. Trường này vắng mặt ở đây là hàng rào cuối cùng —
 *    nếu có, một lần `JSON.stringify` xuống props là đủ để lộ.
 */
export interface VocabCard {
  id: number;
  word: string;
  pos: string;
  ipa: string;
  meaningVi: string;
  definitionEn: string;
  synonyms: string[];
  exampleEn: string;
  exampleVi: string;
  /** Ghi chú của chính người học. Chuỗi rỗng khi chưa viết gì. */
  note: string;
}

interface LessonWordRow {
  lesson_id: number;
  position: number;
  vocab_words: {
    id: number; word: string; pos: string; ipa: string;
    meaning_vi: string; definition_en: string; synonyms: string[];
    example_en: string; example_vi: string;
  };
}

/**
 * Một từ + đáp án chỗ trống + ghi chú → thẻ sẵn sàng hiển thị. HÀM THUẦN.
 *
 * Tách khỏi `loadCards` có chủ đích: đây là đường mà `tests/corpus.test.ts`
 * chạy qua CẢ 605 từ thật trong `data/clean/vocab.json` mà không cần database.
 * Lát 1b từng có một lỗi khiến mọi câu điền từ hiển thị vỡ vụn, và nó lọt qua
 * được vì fixture của test đơn vị mô phỏng một kho dữ liệu không tồn tại. Chỗ
 * duy nhất chặn được loại lỗi đó là một hàm thuần chạy trên dữ liệu THẬT.
 */
export function renderCard(lite: VocabLite, blankAnswer: string, note: string): VocabCard {
  return {
    id: lite.id,
    word: lite.word,
    pos: lite.pos,
    ipa: lite.ipa,
    meaningVi: lite.meaningVi,
    definitionEn: lite.definitionEn,
    synonyms: lite.synonyms,
    // Phase 0 đã khoét đúng một "___" vào cả 605 câu; điền lại chính
    // `blank_answer` (chứ không phải `word`) dựng lại ĐÚNG nguyên câu gốc, kể
    // cả khi đáp án là một dạng biến cách — 183/600 từ trong chương trình rơi
    // vào trường hợp đó (đo trên data/clean/vocab.json; chú thích ở
    // 0007_assessment_parent.sql ghi 168, đếm theo cách khác).
    exampleEn: lite.exampleEn.replace("___", blankAnswer),
    exampleVi: lite.exampleVi,
    note,
  };
}

/**
 * Đọc mọi thứ pha học cần, trong MỘT đợt.
 *
 * `lessonIds` theo đúng thứ tự muốn hiển thị: một buổi (30 thẻ) hoặc hai buổi
 * của một nhóm (60 thẻ, xem lại). Thứ tự thẻ = thứ tự buổi trong mảng, rồi
 * `position` trong buổi.
 *
 * `blank_answer` bị thu hồi khỏi `authenticated` (0004_rls.sql:41-44) nên
 * không đọc thẳng được — dùng RPC `security definer`
 * `blank_answers_for_lesson` (0007), MỘT lượt cho cả buổi thay vì 30 lượt
 * `answer_for_word`. Giá trị đó CHỈ dùng để điền lại câu ví dụ ngay tại đây
 * rồi bị bỏ, không đi vào `VocabCard`.
 */
export async function loadCards(
  supabase: SupabaseClient,
  lessonIds: readonly number[],
  userId: string,
): Promise<VocabCard[]> {
  if (lessonIds.length === 0) return [];

  const [lwRes, ...blankResults] = await Promise.all([
    supabase
      .from("lesson_words")
      .select(
        "lesson_id, position, vocab_words(id, word, pos, ipa, meaning_vi, definition_en, synonyms, example_en, example_vi)",
      )
      .in("lesson_id", [...lessonIds]),
    ...lessonIds.map((id) => supabase.rpc("blank_answers_for_lesson", { p_lesson_id: id })),
  ]);
  if (lwRes.error) throw lwRes.error;

  const blanks: Record<string, string> = {};
  for (const res of blankResults) {
    if (res.error) throw res.error;
    Object.assign(blanks, (res.data ?? {}) as Record<string, string>);
  }

  // Không có generic Database trên client nên postgrest-js suy luận MỌI quan hệ
  // nhúng có sub-field là mảng, bất kể FK thật sự là 1-1 hay 1-n. Ép qua
  // `unknown` trước vì TS không cho ép thẳng hai kiểu không giao nhau đủ.
  // Runtime trả về một đối tượng vì lesson_words.word_id là khoá ngoại tới
  // vocab_words(id) — 0002_curriculum.sql:9-14.
  const rows = (lwRes.data ?? []) as unknown as LessonWordRow[];

  // Sắp thứ tự Ở ĐÂY chứ không bằng `.order()`: với hai buổi, thứ tự phải theo
  // vị trí của `lesson_id` TRONG MẢNG `lessonIds`, không phải theo giá trị id.
  const rank = new Map(lessonIds.map((id, i) => [id, i]));
  rows.sort(
    (a, b) => rank.get(a.lesson_id)! - rank.get(b.lesson_id)! || a.position - b.position,
  );

  const wordIds = rows.map((r) => r.vocab_words.id);
  const notesRes = await supabase
    .from("word_notes")
    .select("word_id, body")
    .eq("user_id", userId)
    .in("word_id", wordIds);
  if (notesRes.error) throw notesRes.error;
  const noteByWord = new Map(
    (notesRes.data ?? []).map((n) => [n.word_id as number, n.body as string]),
  );

  return rows.map((r) => {
    const lite = toVocabLite(r.vocab_words);
    // Khoá jsonb là text (`jsonb_object_agg(v.id::text, ...)` trong migration)
    // — ép id sang chuỗi để tra đúng.
    return renderCard(lite, blanks[String(lite.id)] ?? "", noteByWord.get(lite.id) ?? "");
  });
}
