import type { SupabaseClient } from "@supabase/supabase-js";
import { hashString } from "@content/shuffle-options";
import { itemAt, type ItemSpec } from "./item-plan";
import type { BuildContext, GrammarLite, VocabLite } from "./build-item";
import { buildItem } from "./build-item";

/**
 * Đọc mọi thứ cần để dựng item của một buổi.
 *
 * `blankAnswer` và đáp án câu ngữ pháp CHỈ đọc được qua hai hàm RPC
 * `security definer` (0006_lesson_position.sql), không đọc thẳng được bằng
 * client thường của `authenticated`. Hàm này chạy trên server nên dùng
 * client thường, nhưng KHÔNG bao giờ trả nguyên `BuildContext` xuống trình
 * duyệt — `blankAnswer` ở đây luôn là chuỗi rỗng, xem `toVocabLite`.
 */
export async function loadContext(
  supabase: SupabaseClient,
  lessonId: number,
  userId: string,
): Promise<BuildContext> {
  const { data: lw, error: lwErr } = await supabase
    .from("lesson_words")
    .select("position, vocab_words(id, word, pos, ipa, meaning_vi, definition_en, synonyms, example_en)")
    .eq("lesson_id", lessonId)
    .order("position");
  if (lwErr) throw lwErr;

  // Không có generic Database trên client nên postgrest-js suy luận MỌI quan
  // hệ nhúng có sub-field là mảng, bất kể FK thật sự là 1-1 hay 1-n (xem
  // node_modules/@supabase/postgrest-js/src/select-query-parser/result.ts và
  // src/app/(app)/dashboard/page.tsx:35-40 cho cùng vấn đề). Ép qua `unknown`
  // trước vì TS không cho ép thẳng hai kiểu không giao nhau đủ. Runtime thực
  // sự trả về một đối tượng vì lesson_words.word_id là khoá ngoại tới
  // vocab_words(id) (supabase/migrations/0002_curriculum.sql:9-14).
  const lessonWordRows = (lw ?? []) as unknown as LessonWordRow[];
  const lessonWords = lessonWordRows.map((r) => toVocabLite(r.vocab_words));

  const { data: bankRows, error: bankErr } = await supabase
    .from("vocab_words")
    .select("id, word, pos, ipa, meaning_vi, definition_en, synonyms, example_en")
    .order("ordinal");
  if (bankErr) throw bankErr;
  const bank = (bankRows ?? []).map(toVocabLite);

  const { data: gq, error: gqErr } = await supabase
    .from("grammar_questions")
    .select("id, stem, options, lesson_id")
    .eq("lesson_id", await grammarLessonIdOf(supabase, lessonId))
    .order("id");
  if (gqErr) throw gqErr;
  const grammar: GrammarLite[] = (gq ?? []).map((q) => ({
    id: q.id as number,
    stem: q.stem as string,
    options: q.options as string[],
  }));

  return { lessonWords, bank, grammar, seed: hashString(`${userId}:${lessonId}`) };
}

interface LessonWordRow {
  position: number;
  vocab_words: {
    id: number;
    word: string;
    pos: string;
    ipa: string;
    meaning_vi: string;
    definition_en: string;
    synonyms: string[];
    example_en: string;
  };
}

async function grammarLessonIdOf(supabase: SupabaseClient, lessonId: number): Promise<number> {
  const { data, error } = await supabase
    .from("lessons").select("grammar_lesson_id").eq("id", lessonId).single();
  if (error) throw error;
  return data!.grammar_lesson_id as number;
}

function toVocabLite(row: unknown): VocabLite {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as number,
    word: r.word as string,
    pos: r.pos as string,
    ipa: r.ipa as string,
    meaningVi: r.meaning_vi as string,
    definitionEn: r.definition_en as string,
    synonyms: r.synonyms as string[],
    exampleEn: r.example_en as string,
    blankAnswer: "", // điền riêng ở secretFor — không mang xuống client
  };
}

/** Dựng item để GỬI XUỐNG trình duyệt. Không chứa đáp án. */
export function publicItem(spec: ItemSpec, ctx: BuildContext) {
  return buildItem(spec, ctx);
}

/**
 * Lấy đáp án đúng của item, gọi bằng client thường của người dùng (không
 * phải service role — khoá đó không được lên Vercel).
 *
 * `vocab_words.blank_answer` và `grammar_questions.answer` đã bị thu hồi
 * khỏi `authenticated` ở 0004_rls.sql:41-48, nên đọc thẳng bằng client
 * thường sẽ không thấy hai cột đó. Hai hàm RPC `security definer`
 * (`answer_for_word`, `answer_for_question`) là đường hợp lệ duy nhất: chúng
 * chạy bằng quyền chủ sở hữu bảng nhưng chỉ trả về đúng một chuỗi đáp án cho
 * đúng một item, không mở lại cả cột — xem 0006_lesson_position.sql.
 */
export async function secretFor(
  supabase: SupabaseClient,
  spec: ItemSpec,
  ctx: BuildContext,
): Promise<string> {
  const item = buildItem(spec, ctx);

  if (item.kind === "meaning") {
    const w = ctx.lessonWords.find((x) => x.id === item.wordId);
    return w!.meaningVi;
  }
  if (item.kind === "synonym") {
    const w = ctx.lessonWords.find((x) => x.id === item.wordId);
    return w!.synonyms[0]!;
  }
  if (item.kind === "fill") {
    const { data, error } = await supabase.rpc("answer_for_word", {
      p_word_id: item.wordId,
    });
    if (error) throw error;
    return data as string;
  }
  if (item.kind === "grammar") {
    const { data, error } = await supabase.rpc("answer_for_question", {
      p_question_id: item.questionId,
    });
    if (error) throw error;
    return data as string;
  }
  throw new Error("thẻ gặp từ không có đáp án");
}

export { itemAt };
