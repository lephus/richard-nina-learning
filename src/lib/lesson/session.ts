import type { SupabaseClient } from "@supabase/supabase-js";
import { hashString } from "@content/shuffle-options";
import { itemAt, type ItemSpec } from "./item-plan";
import type { BuildContext, GrammarLite } from "./build-item";
import { buildItem, toVocabLite } from "./build-item";

/**
 * Đọc mọi thứ cần để dựng item của một buổi.
 *
 * Đáp án câu ngữ pháp CHỈ đọc được qua RPC `security definer`
 * (0006_lesson_position.sql), không đọc thẳng được bằng client thường của
 * `authenticated`. `blankAnswer` của cả buổi đọc qua một RPC `security
 * definer` khác — `blank_answers_for_lesson` (0007_assessment_parent.sql) —
 * MỘT lượt gọi cho cả 30 từ thay vì 30 lượt gọi `answer_for_word` riêng lẻ.
 * Hàm này chạy trên server nên dùng client thường, nhưng KHÔNG bao giờ trả
 * nguyên `BuildContext` xuống trình duyệt — `blankAnswer` có giá trị thật
 * trong `ctx.lessonWords`, và chỉ nhánh flashcard của `buildItem` được đọc nó
 * (rồi loại nó khỏi payload trả về, kiểu `blankAnswer?: never` chặn ở tầng
 * biên dịch — xem BuiltItem trong build-item.ts).
 */
export async function loadContext(
  supabase: SupabaseClient,
  lessonId: number,
  userId: string,
): Promise<BuildContext> {
  // `grammarLessonIdOf` phải xong trước vì truy vấn câu ngữ pháp lọc theo nó.
  // Trước đây nó được `await` NGAY TRONG đối số của `.eq()`, khiến ba truy vấn
  // chạy nối đuôi nhau; nay chỉ còn một lượt chờ rồi các truy vấn còn lại đi
  // song song.
  const grammarLessonId = await grammarLessonIdOf(supabase, lessonId);

  const [lwRes, gqRes, blankRes] = await Promise.all([
    supabase
      .from("lesson_words")
      .select(
        "position, vocab_words(id, word, pos, ipa, meaning_vi, definition_en, synonyms, example_en, example_vi)",
      )
      .eq("lesson_id", lessonId)
      .order("position"),
    supabase
      .from("grammar_questions")
      .select("id, stem, options, lesson_id")
      .eq("lesson_id", grammarLessonId)
      .order("id"),
    // Trả `{ "<word_id>": "<blank_answer>" }` cho ĐÚNG 30 từ của buổi này —
    // không mở lại cả cột. Không phụ thuộc grammarLessonId nên chạy song song
    // được với hai truy vấn trên, không cần chờ `grammarLessonIdOf`.
    supabase.rpc("blank_answers_for_lesson", { p_lesson_id: lessonId }),
  ]);
  if (lwRes.error) throw lwRes.error;
  if (gqRes.error) throw gqRes.error;
  if (blankRes.error) throw blankRes.error;

  // Không có generic Database trên client nên postgrest-js suy luận MỌI quan
  // hệ nhúng có sub-field là mảng, bất kể FK thật sự là 1-1 hay 1-n (xem
  // node_modules/@supabase/postgrest-js/src/select-query-parser/result.ts và
  // src/app/(app)/dashboard/page.tsx:35-40 cho cùng vấn đề). Ép qua `unknown`
  // trước vì TS không cho ép thẳng hai kiểu không giao nhau đủ. Runtime thực
  // sự trả về một đối tượng vì lesson_words.word_id là khoá ngoại tới
  // vocab_words(id) (supabase/migrations/0002_curriculum.sql:9-14).
  const lessonWordRows = (lwRes.data ?? []) as unknown as LessonWordRow[];
  const blankAnswers = (blankRes.data ?? {}) as Record<string, string>;
  const lessonWords = lessonWordRows.map((r) => {
    const lite = toVocabLite(r.vocab_words);
    // Khoá jsonb là text (`jsonb_object_agg(v.id::text, ...)` ở migration) —
    // ép id sang chuỗi để tra đúng. Từ nào không có mặt (không nên xảy ra vì
    // RPC lọc đúng theo lessonId) thì giữ nguyên "" như toVocabLite đã đặt,
    // thay vì `undefined` lọt xuống buildItem.
    return { ...lite, blankAnswer: blankAnswers[String(lite.id)] ?? lite.blankAnswer };
  });

  const grammar: GrammarLite[] = (gqRes.data ?? []).map((q) => ({
    id: q.id as number,
    stem: q.stem as string,
    options: q.options as string[],
  }));

  // KHÔNG tải kho 605 từ ở đây. Bậc 3 của pickDistractors chỉ chạy khi bậc
  // 1+2 thiếu ứng viên, mà một buổi luôn có đúng 30 từ → 29 ứng viên cho 3 chỗ
  // nhiễu. `ctx.bank` để trống nghĩa là "không có bậc 3", đúng với thực tế.
  return { lessonWords, grammar, grammarLessonId, seed: hashString(`${userId}:${lessonId}`) };
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
    example_vi: string;
  };
}

async function grammarLessonIdOf(supabase: SupabaseClient, lessonId: number): Promise<number> {
  const { data, error } = await supabase
    .from("lessons").select("grammar_lesson_id").eq("id", lessonId).single();
  if (error) throw error;
  return data!.grammar_lesson_id as number;
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
    // CÓ CHỦ ĐÍCH không đọc `ctx.lessonWords[i].blankAnswer` — từ 1c,
    // `loadContext` đã điền giá trị THẬT vào đó cho cả buổi (RPC
    // `blank_answers_for_lesson`, 0007), nên về lý thuyết có thể lấy thẳng
    // từ `ctx` mà không cần round-trip này. Giữ đường độc lập qua
    // `answer_for_word` vì đây là hàm CHẤM ĐIỂM: nếu `ctx.blankAnswer` từng
    // bị điền sai (bug ở `loadContext`, khoá jsonb sai, RPC trả thiếu…), dùng
    // lại chính giá trị đó để chấm sẽ khiến lỗi tự-nhất-quán — chấm "đúng"
    // một đáp án sai theo đúng cách nó bị điền sai, không test nào bắt được.
    // Tách hai đường (một đường điền hiển thị, một đường chấm điểm) đổi lấy
    // một round-trip mạng mỗi câu điền từ, chấp nhận được so với việc mất
    // khả năng tự phát hiện lỗi ở đúng chỗ quan trọng nhất.
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
