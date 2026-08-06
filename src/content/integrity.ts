import { LESSON_COUNT, WORDS_PER_LESSON } from "./lesson-manifest";
import type { GrammarLesson, GrammarQuestion, LessonPlan, VocabWord } from "./types";

export interface Violation { kind: string; detail: string }

export interface ContentBundle {
  vocab: VocabWord[];
  grammar: GrammarLesson[];
  questions: GrammarQuestion[];
  plan: LessonPlan[];
}

export function checkIntegrity(b: ContentBundle): Violation[] {
  const v: Violation[] = [];
  const push = (kind: string, detail: string) => v.push({ kind, detail });

  if (b.plan.length !== LESSON_COUNT) push("wrong-lesson-count", `có ${b.plan.length} buổi`);
  if (b.grammar.length !== LESSON_COUNT) push("wrong-grammar-count", `có ${b.grammar.length} bài`);

  const wordOrdinals = new Set(b.vocab.map((w) => w.ordinal));
  const slugs = new Set(b.grammar.map((g) => g.slug));
  const seen = new Set<number>();

  for (const p of b.plan) {
    if (p.wordOrdinals.length !== WORDS_PER_LESSON) {
      push("wrong-word-count", `buổi ${p.ordinal} có ${p.wordOrdinals.length} từ`);
    }
    if (!slugs.has(p.grammarSlug)) {
      push("missing-grammar", `buổi ${p.ordinal} trỏ tới "${p.grammarSlug}"`);
    }
    for (const o of p.wordOrdinals) {
      if (!wordOrdinals.has(o)) push("missing-word", `buổi ${p.ordinal} trỏ tới từ #${o}`);
      if (seen.has(o)) push("duplicate-word", `từ #${o} xuất hiện ở nhiều buổi`);
      seen.add(o);
    }
  }

  for (const g of b.grammar) {
    const n = b.questions.filter((q) => q.lessonSlug === g.slug).length;
    if (n < 20) push("too-few-questions", `bài ${g.slug} chỉ có ${n} câu`);
  }

  return v;
}
