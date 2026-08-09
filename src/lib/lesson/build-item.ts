import { hashString, seededShuffle } from "@content/shuffle-options";
import type { ItemSpec } from "./item-plan";

/** Chỉ những cột `authenticated` được phép đọc — xem 0004_rls.sql:41-44. */
export interface VocabLite {
  id: number;
  word: string;
  pos: string;
  ipa: string;
  meaningVi: string;
  definitionEn: string;
  synonyms: string[];
  /**
   * Câu ví dụ ĐÃ BỊ KHOÉT: cả 605 dòng vocab_words đều chứa đúng một "___".
   * Câu điền từ dùng nguyên văn chuỗi này; thẻ gặp từ điền lại từ vào chỗ
   * trống trước khi hiện — xem nhánh flashcard trong buildItem.
   */
  exampleEn: string;
  /** Bản dịch tiếng Việt của câu ví dụ. Đầy đủ, không bị khoét (605/605 dòng). */
  exampleVi: string;
  /**
   * Từ bị khoét khỏi exampleEn. Cột này KHÔNG được cấp cho `authenticated`,
   * nên nó chỉ tồn tại ở phía server — không bao giờ gửi xuống trình duyệt.
   */
  blankAnswer: string;
}

/** `answer` và `explanation` KHÔNG có ở đây — xem 0004_rls.sql:46-48. */
export interface GrammarLite {
  id: number;
  stem: string;
  options: string[];
}

/**
 * Một dòng `vocab_words` (snake_case, đúng những cột `authenticated` đọc được)
 * → `VocabLite`. `blankAnswer` luôn là chuỗi rỗng Ở ĐÂY: cột đó đã bị thu hồi
 * khỏi `authenticated` (0004_rls.sql:41-44) nên nó KHÔNG có trong dòng đọc
 * lên. Hai đường hợp lệ để lấy giá trị thật: RPC `answer_for_word` cho MỘT từ
 * (xem `secretFor`), hoặc RPC `blank_answers_for_lesson` cho CẢ một buổi (xem
 * `loadContext` — nó gọi hàm này rồi GHI ĐÈ `blankAnswer` lên kết quả).
 *
 * Ở cạnh `VocabLite` chứ không nằm trong một module đọc dữ liệu cụ thể, vì cả
 * buổi học (lib/lesson/session.ts) lẫn bài đánh giá (lib/assessment/run.ts)
 * đều đọc chính bảng đó và phải quy về cùng một hình dạng.
 */
export function toVocabLite(row: unknown): VocabLite {
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
    exampleVi: r.example_vi as string,
    blankAnswer: "",
  };
}

export interface BuildContext {
  lessonWords: readonly VocabLite[];
  grammar: readonly GrammarLite[];
  seed: number;
  /**
   * Bài ngữ pháp gắn với buổi này (lessons.grammar_lesson_id). Đây là KHOÁ
   * của grammar_mastery — `(user_id, grammar_lesson_id)`, xem
   * 0003_user_state.sql:30-36 — nên nó phải đi cùng ngữ cảnh tới tận chỗ
   * chấm mastery, không thể suy ra từ question_id.
   */
  grammarLessonId: number;
  /**
   * Bậc 3 dự phòng (toàn kho 605 từ), LƯỜI — một hàm chứ không phải mảng.
   *
   * Sản xuất KHÔNG BAO GIỜ gọi tới: mỗi buổi đúng 30 từ, nên bậc 1+2 luôn
   * cung cấp 29 ứng viên cho 3 chỗ nhiễu. Trước đây `loadContext` tải sẵn cả
   * kho rồi xáo trộn Fisher-Yates ~575 phần tử ở MỖI câu hỏi, chỉ để vứt đi —
   * ~165 KB mỗi lượt chấm, ~439 MB cho một người học hết lộ trình. Nay bậc 3
   * chỉ được dựng khi bậc 1+2 thật sự thiếu, và `loadContext` bỏ hẳn truy vấn
   * tải kho nên trường này thường là `undefined`.
   */
  bank?: () => readonly VocabLite[];
}

export type BuiltItem =
  // `Omit<VocabLite, "blankAnswer">` một mình không đủ: gán thẳng một
  // `VocabLite` (rộng hơn) vào một trường có kiểu hẹp hơn vẫn hợp lệ theo
  // structural typing — kiểm tra excess-property của TS chỉ áp dụng cho
  // object literal, không áp dụng khi gán một biến đã có kiểu sẵn. Thêm
  // `blankAnswer?: never` để field đó thực sự KHÔNG THỂ gán được, biến việc
  // rò rỉ thành lỗi biên dịch chứ không chỉ là quy ước — xem 0004_rls.sql:41-44.
  | { kind: "flashcard"; word: Omit<VocabLite, "blankAnswer"> & { blankAnswer?: never } }
  | { kind: "meaning"; wordId: number; word: string; options: string[] }
  | { kind: "synonym"; wordId: number; word: string; options: string[] }
  | { kind: "fill"; wordId: number; sentence: string }
  | { kind: "grammar"; questionId: number; stem: string; options: string[] };

export interface DistractorOptions {
  /**
   * Chữ HIỂN THỊ trên nút của một ứng viên: `meaningVi` với câu nghĩa, `word`
   * với câu đồng nghĩa. Lọc theo `id` là không đủ — hai dòng khác id vẫn hiện
   * ra hai nút y hệt nhau (17 chuỗi `meaningVi` bị hai dòng dùng chung).
   */
  textOf: (candidate: VocabLite) => string;
  /**
   * Những chữ đã bị chiếm và KHÔNG được xuất hiện thêm lần nào: đáp án đúng,
   * và với câu đồng nghĩa là TOÀN BỘ `target.synonyms`.
   */
  taken: readonly string[];
  /** Lý do loại riêng của từng loại câu, xét trên chính ứng viên. */
  reject?: (candidate: VocabLite) => boolean;
  /** Bậc 3 — xem BuildContext.bank. Không truyền thì bỏ qua bậc 3. */
  bank?: () => readonly VocabLite[];
  count?: number;
}

/**
 * Ba bậc dự phòng, theo thứ tự ưu tiên:
 *   1. cùng buổi, cùng loại từ   — khó nhất, ép phân biệt thật
 *   2. cùng buổi, khác loại từ
 *   3. toàn kho 605 từ (lười, xem BuildContext.bank)
 *
 * Bậc 2 không phải phòng xa lý thuyết: toàn kho chỉ có 2 giới từ, nên một
 * buổi chứa giới từ sẽ cạn bậc 1 ngay lập tức.
 *
 * ĐIỀU KIỆN LOẠI ỨNG VIÊN là phần quan trọng nhất của hàm này. Loại theo `id`
 * một mình từng khiến app CHẤM SAI CÂU TRẢ LỜI ĐÚNG: 185/605 từ trong kho có
 * một từ đồng nghĩa mà chính nó cũng là một từ khác trong kho, nên "phương án
 * nhiễu" đôi khi là một đáp án thật sự đúng (`revolutionary` → nhiễu
 * `innovative` trong khi `innovative` nằm ngay trong synonyms của nó). Ứng
 * viên bị loại khi: trùng chính từ đích, trùng CHỮ HIỂN THỊ với đáp án đúng,
 * trùng chữ hiển thị với một phương án đã chọn, hoặc bị `reject` gạt.
 */
export function pickDistractors(
  target: VocabLite,
  lessonWords: readonly VocabLite[],
  seed: number,
  opts: DistractorOptions,
): VocabLite[] {
  const count = opts.count ?? 3;
  const rejected = opts.reject ?? (() => false);
  const eligible = (x: VocabLite): boolean => x.id !== target.id && !rejected(x);

  const used = new Set(opts.taken);
  const out: VocabLite[] = [];

  const consider = (pool: readonly VocabLite[]): void => {
    if (out.length >= count) return;
    for (const candidate of seededShuffle(pool, seed)) {
      const text = opts.textOf(candidate);
      if (used.has(text)) continue;
      used.add(text);
      out.push(candidate);
      if (out.length >= count) return;
    }
  };

  consider(lessonWords.filter((x) => eligible(x) && x.pos === target.pos));
  consider(lessonWords.filter((x) => eligible(x) && x.pos !== target.pos));

  // Bậc 3 chỉ dựng khi thật sự cần — với buổi 30 từ thì không bao giờ tới đây.
  if (out.length < count && opts.bank) {
    const inLesson = new Set(lessonWords.map((x) => x.id));
    consider(opts.bank().filter((x) => eligible(x) && !inLesson.has(x.id)));
  }

  // Lớp bảo vệ thứ hai: corpus test (tests/corpus.test.ts) đã canh hết mọi
  // buổi trong data/clean/ hiện có, nhưng canh đó chỉ chạy trên dữ liệu ĐÃ
  // qua CI — không chặn được dữ liệu thêm sau này (buổi mới, kho từ mở rộng)
  // mà chưa từng chạy qua corpus test. `.slice(0, count)` ở nơi gọi hàm này
  // im lặng trả về ít hơn `count` phương án khi kho cạn, ra một câu hỏi có
  // ít hơn 4 lựa chọn thay vì báo lỗi ngay tại chỗ sai.
  if (out.length < count) {
    throw new Error(
      `pickDistractors: từ "${target.word}" (id ${target.id}) chỉ tìm được ` +
        `${out.length}/${count} phương án nhiễu`,
    );
  }

  return out;
}

function meaningItem(
  word: VocabLite,
  ctx: BuildContext,
  seed: number,
): BuiltItem {
  const distractors = pickDistractors(word, ctx.lessonWords, seed, {
    textOf: (c) => c.meaningVi,
    taken: [word.meaningVi],
    bank: ctx.bank,
  });
  const options = seededShuffle(
    [word.meaningVi, ...distractors.map((d) => d.meaningVi)],
    seed,
  );
  return { kind: "meaning", wordId: word.id, word: word.word, options };
}

/**
 * 10 từ chốt buổi và 5 câu ngữ pháp chốt buổi phụ thuộc DUY NHẤT vào `ctx`,
 * không phụ thuộc `spec` — nhưng buildItem được gọi tới ba lần cho mỗi lượt
 * chấm, và trước đây mỗi lần lại xáo trộn lại cả mảng. Nhớ theo chính đối
 * tượng ctx (WeakMap nên không giữ ctx sống): mỗi request có ctx riêng do
 * loadContext tạo, nên không có chuyện dùng lẫn giữa hai người học.
 */
const finalWordsOf = memoPerContext((ctx) =>
  seededShuffle(ctx.lessonWords, ctx.seed).slice(0, 10),
);
const finalGrammarOf = memoPerContext((ctx) =>
  seededShuffle(ctx.grammar, ctx.seed).slice(0, 5),
);

function memoPerContext<T>(compute: (ctx: BuildContext) => T): (ctx: BuildContext) => T {
  const cache = new WeakMap<BuildContext, T>();
  return (ctx) => {
    const hit = cache.get(ctx);
    if (hit !== undefined) return hit;
    const value = compute(ctx);
    cache.set(ctx, value);
    return value;
  };
}

export function buildItem(spec: ItemSpec, ctx: BuildContext): BuiltItem {
  // Băm theo cả `kind` lẫn `index`: meaning và synonym của cùng một từ có
  // CÙNG index (xem item-plan.ts), nên chỉ băm theo index sẽ cho hai câu hỏi
  // cùng một hoán vị 4 phương án — đáp án đúng luôn rơi vào cùng vị trí, học
  // viên đoán được câu sau nhờ nhớ vị trí ở câu trước chứ không cần biết nghĩa.
  const seed = hashString(`${ctx.seed}:${spec.kind}:${spec.index}`);

  if (spec.kind === "flashcard") {
    // Tách `blankAnswer` ra TRƯỚC khi loại nó khỏi payload: cột này không
    // được cấp cho `authenticated` (0004_rls.sql:41-44), không được phép rời
    // khỏi server, nhưng vẫn cần dùng ở ngay dưới đây để điền lại chỗ trống.
    const { blankAnswer, ...safeWord } = at(ctx.lessonWords, spec.index);
    return {
      kind: "flashcard",
      word: {
        ...safeWord,
        // Thẻ gặp từ là nơi DẠY, không phải nơi hỏi — nó cần câu ví dụ ĐẦY
        // ĐỦ. Phase 0 đã khoét sẵn "___" vào cả 605 câu để phục vụ câu điền
        // từ, nên ở đây phải điền ngược lại. Không rò rỉ gì: chính từ đó đang
        // hiện to ngay phía trên trên cùng một thẻ.
        //
        // Điền bằng `blankAnswer`, KHÔNG phải `safeWord.word`: `blank_answer`
        // đôi khi là một dạng biến đổi của từ (word "opening", blank_answer
        // "openings") — 169/605 từ như vậy — nên ghép lại bằng `word` từng
        // cho câu sai ngữ pháp nhẹ ("several job opening" thay vì
        // "openings"). `blankAnswer` chính là chuỗi ĐÃ BỊ khoét ra để tạo nên
        // "___", nên điền nó vào luôn dựng lại ĐÚNG NGUYÊN câu gốc, không có
        // đánh đổi nào còn lại. `loadContext` (session.ts) gọi RPC
        // `blank_answers_for_lesson` một lần cho CẢ buổi (0007), nên không
        // tốn thêm round-trip nào cho từng thẻ.
        exampleEn: safeWord.exampleEn.replace("___", blankAnswer),
      },
    };
  }

  if (spec.kind === "meaning") {
    return meaningItem(at(ctx.lessonWords, spec.index), ctx, seed);
  }

  if (spec.kind === "final-meaning") {
    // 10 từ lấy từ cả 30, xáo trộn tất định rồi lấy theo thứ tự — không trùng nhau.
    return meaningItem(at(finalWordsOf(ctx), spec.index), ctx, seed);
  }

  if (spec.kind === "synonym") {
    const word = at(ctx.lessonWords, spec.index);
    const correct = word.synonyms[0];
    if (correct === undefined) {
      throw new Error(`từ ${word.word} không có từ đồng nghĩa`);
    }
    const distractors = pickDistractors(word, ctx.lessonWords, seed, {
      textOf: (c) => c.word,
      // Cấm MỌI từ đồng nghĩa của từ đích, không riêng đáp án đang hỏi: hỏi
      // "từ nào đồng nghĩa với confident" mà chào cả `certain` lẫn
      // `self-assured` thì hai nút đều đúng, và người học chọn nút "sai" bị
      // báo "Chưa đúng" cộng một wrong_count oan.
      taken: [correct, ...word.synonyms],
      // Chiều ngược lại cũng phải cấm: từ đích không liệt kê ứng viên, nhưng
      // ứng viên liệt kê từ đích thì nó vẫn là một đáp án đúng (17 cặp như
      // vậy nằm chung buổi, ví dụ `qualified` ↔ `eligible`).
      reject: (c) => c.synonyms.includes(word.word),
      bank: ctx.bank,
    });
    const options = seededShuffle(
      [correct, ...distractors.map((d) => d.word)],
      seed,
    );
    return { kind: "synonym", wordId: word.id, word: word.word, options };
  }

  if (spec.kind === "fill") {
    // Phase 0 đã khoét sẵn `exampleEn` (chứa đúng một "___") khi dựng nội
    // dung — không khoét lại ở đây. `blankAnswer` chỉ dùng để chấm điểm ở
    // server, không xuất hiện trong exampleEn (đã kiểm chứng trên cả 605
    // dòng vocab_words) nên không có gì để khoét thêm.
    const word = at(ctx.lessonWords, spec.index);
    return {
      kind: "fill",
      wordId: word.id,
      sentence: word.exampleEn,
    };
  }

  if (spec.kind === "grammar") {
    const q = at(finalGrammarOf(ctx), spec.index);
    return {
      kind: "grammar",
      questionId: q.id,
      stem: q.stem,
      options: seededShuffle(q.options, seed),
    };
  }

  // Chốt vét cạn: thêm một ItemKind thứ 7 (lát 1c có thêm) mà quên dựng nhánh
  // cho nó sẽ là LỖI BIÊN DỊCH ngay tại đây, thay vì âm thầm rơi vào nhánh
  // ngữ pháp và hỏi sai loại câu suốt cả buổi.
  const unhandled: never = spec.kind;
  throw new Error(`ItemKind chưa được dựng: ${String(unhandled)}`);
}

function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new RangeError(`chỉ số ${i} ngoài biên (dài ${arr.length})`);
  return v;
}
