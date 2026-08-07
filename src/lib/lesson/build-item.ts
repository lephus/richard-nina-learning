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
  exampleEn: string;
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

export interface BuildContext {
  lessonWords: readonly VocabLite[];
  bank: readonly VocabLite[];
  grammar: readonly GrammarLite[];
  seed: number;
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

/**
 * Ba bậc dự phòng, theo thứ tự ưu tiên:
 *   1. cùng buổi, cùng loại từ   — khó nhất, ép phân biệt thật
 *   2. cùng buổi, khác loại từ
 *   3. toàn kho 605 từ
 *
 * Bậc 2 và 3 không phải phòng xa lý thuyết: toàn kho chỉ có 2 giới từ, nên
 * một buổi chứa giới từ sẽ cạn bậc 1 ngay lập tức.
 */
export function pickDistractors(
  target: VocabLite,
  lessonWords: readonly VocabLite[],
  bank: readonly VocabLite[],
  seed: number,
  count = 3,
): VocabLite[] {
  const inLesson = new Set(lessonWords.map((x) => x.id));
  const notTarget = (x: VocabLite) => x.id !== target.id;

  const tier1 = lessonWords.filter((x) => notTarget(x) && x.pos === target.pos);
  const tier2 = lessonWords.filter((x) => notTarget(x) && x.pos !== target.pos);
  const tier3 = bank.filter((x) => notTarget(x) && !inLesson.has(x.id));

  return [
    ...seededShuffle(tier1, seed),
    ...seededShuffle(tier2, seed),
    ...seededShuffle(tier3, seed),
  ].slice(0, count);
}

function meaningItem(
  word: VocabLite,
  ctx: BuildContext,
  seed: number,
): BuiltItem {
  const distractors = pickDistractors(word, ctx.lessonWords, ctx.bank, seed);
  const options = seededShuffle(
    [word.meaningVi, ...distractors.map((d) => d.meaningVi)],
    seed,
  );
  return { kind: "meaning", wordId: word.id, word: word.word, options };
}

export function buildItem(spec: ItemSpec, ctx: BuildContext): BuiltItem {
  // Băm theo cả `kind` lẫn `index`: meaning và synonym của cùng một từ có
  // CÙNG index (xem item-plan.ts), nên chỉ băm theo index sẽ cho hai câu hỏi
  // cùng một hoán vị 4 phương án — đáp án đúng luôn rơi vào cùng vị trí, học
  // viên đoán được câu sau nhờ nhớ vị trí ở câu trước chứ không cần biết nghĩa.
  const seed = hashString(`${ctx.seed}:${spec.kind}:${spec.index}`);

  if (spec.kind === "flashcard") {
    // Loại `blankAnswer` khỏi payload — cột này không được cấp cho
    // `authenticated`, không được phép rời khỏi server.
    const { blankAnswer: _blankAnswer, ...safeWord } = at(ctx.lessonWords, spec.index);
    return { kind: "flashcard", word: safeWord };
  }

  if (spec.kind === "meaning") {
    return meaningItem(at(ctx.lessonWords, spec.index), ctx, seed);
  }

  if (spec.kind === "final-meaning") {
    // 10 từ lấy từ cả 30, xáo trộn tất định rồi lấy theo thứ tự — không trùng nhau.
    const chosen = seededShuffle(ctx.lessonWords, ctx.seed).slice(0, 10);
    return meaningItem(at(chosen, spec.index), ctx, seed);
  }

  if (spec.kind === "synonym") {
    const word = at(ctx.lessonWords, spec.index);
    const correct = word.synonyms[0];
    if (correct === undefined) {
      throw new Error(`từ ${word.word} không có từ đồng nghĩa`);
    }
    const distractors = pickDistractors(word, ctx.lessonWords, ctx.bank, seed);
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

  // grammar
  const chosen = seededShuffle(ctx.grammar, ctx.seed).slice(0, 5);
  const q = at(chosen, spec.index);
  return {
    kind: "grammar",
    questionId: q.id,
    stem: q.stem,
    options: seededShuffle(q.options, seed),
  };
}

function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new RangeError(`chỉ số ${i} ngoài biên (dài ${arr.length})`);
  return v;
}
