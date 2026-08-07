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
  | { kind: "flashcard"; word: VocabLite }
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

/** Khoét mọi lần xuất hiện của từ đích khỏi câu ví dụ, không phân biệt hoa thường. */
function blankOut(sentence: string, answer: string): string {
  const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return sentence.replace(new RegExp(escaped, "gi"), "___");
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
  const seed = ctx.seed + spec.index * 7919; // 7919 là số nguyên tố, tách seed giữa các item

  if (spec.kind === "flashcard") {
    return { kind: "flashcard", word: at(ctx.lessonWords, spec.index) };
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
    const word = at(ctx.lessonWords, spec.index);
    return {
      kind: "fill",
      wordId: word.id,
      sentence: blankOut(word.exampleEn, word.blankAnswer),
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
