import { describe, expect, it } from "vitest";
import { buildAssessmentItems, buildRemedialItems, COUNTS } from "@/lib/assessment/build";
import type { VocabLite, GrammarLite } from "@/lib/lesson/build-item";

const w = (id: number, pos: string): VocabLite => ({
  id, word: `word${id}`, pos, ipa: `/w${id}/`,
  meaningVi: `nghĩa ${id}`, definitionEn: `def ${id}`,
  synonyms: [`syn${id}`], exampleEn: `A ___ sentence ${id}.`,
  exampleVi: `Câu ví dụ ${id}.`, blankAnswer: `answer${id}`,
});

// 120 từ, đủ cho cả bài kiểm tra
const words: VocabLite[] = Array.from({ length: 120 }, (_, i) =>
  w(i + 1, ["n", "v", "adj", "adv"][i % 4]!),
);
const grammar: GrammarLite[] = Array.from({ length: 80 }, (_, i) => ({
  id: i + 1, stem: `Grammar ${i + 1}?`, options: [`A${i}`, `B${i}`, `C${i}`, `D${i}`],
}));

describe("buildAssessmentItems", () => {
  it("bài ôn tập đúng 25 câu: 20 từ vựng + 5 ngữ pháp", () => {
    const items = buildAssessmentItems("review", words.slice(0, 60), grammar.slice(0, 40), 42);
    expect(items).toHaveLength(25);
    expect(items.filter((i) => i.itemType === "vocab")).toHaveLength(COUNTS.review.vocab);
    expect(items.filter((i) => i.itemType === "grammar")).toHaveLength(COUNTS.review.grammar);
  });

  it("bài kiểm tra đúng 60 câu: 48 từ vựng + 12 ngữ pháp", () => {
    const items = buildAssessmentItems("test", words, grammar, 42);
    expect(items).toHaveLength(60);
    expect(items.filter((i) => i.itemType === "vocab")).toHaveLength(COUNTS.test.vocab);
    expect(items.filter((i) => i.itemType === "grammar")).toHaveLength(COUNTS.test.grammar);
  });

  it("position đánh số liên tục từ 0", () => {
    const items = buildAssessmentItems("review", words.slice(0, 60), grammar.slice(0, 40), 42);
    expect(items.map((i) => i.position)).toEqual(Array.from({ length: 25 }, (_, i) => i));
  });

  it("không câu nào hỏi lại cùng một từ hoặc cùng một câu ngữ pháp", () => {
    const items = buildAssessmentItems("test", words, grammar, 42);
    const vocabIds = items.filter((i) => i.itemType === "vocab").map((i) => i.refId);
    const grammarIds = items.filter((i) => i.itemType === "grammar").map((i) => i.refId);
    expect(new Set(vocabIds).size).toBe(vocabIds.length);
    expect(new Set(grammarIds).size).toBe(grammarIds.length);
  });

  it("mỗi câu có đúng 4 phương án, phân biệt theo nội dung", () => {
    const items = buildAssessmentItems("test", words, grammar, 42);
    for (const it of items) {
      expect(it.payload.options).toHaveLength(4);
      expect(new Set(it.payload.options).size).toBe(4);
    }
  });

  it("tất định: cùng seed cho cùng đề", () => {
    const a = buildAssessmentItems("review", words.slice(0, 60), grammar.slice(0, 40), 7);
    const b = buildAssessmentItems("review", words.slice(0, 60), grammar.slice(0, 40), 7);
    expect(a).toEqual(b);
  });

  it("seed khác cho đề khác — bài làm lại không trùng đề cũ", () => {
    const a = buildAssessmentItems("review", words.slice(0, 60), grammar.slice(0, 40), 1);
    const b = buildAssessmentItems("review", words.slice(0, 60), grammar.slice(0, 40), 999);
    expect(a.map((i) => i.refId)).not.toEqual(b.map((i) => i.refId));
  });
});

describe("buildRemedialItems", () => {
  it("giữ nguyên nội dung câu sai và đánh số lại từ 0", () => {
    const all = buildAssessmentItems("review", words.slice(0, 60), grammar.slice(0, 40), 42);
    const wrong = [all[3]!, all[10]!, all[22]!];
    const rem = buildRemedialItems(wrong);
    expect(rem).toHaveLength(3);
    expect(rem.map((i) => i.position)).toEqual([0, 1, 2]);
    expect(rem.map((i) => i.refId)).toEqual(wrong.map((i) => i.refId));
    expect(rem[0]!.payload).toEqual(wrong[0]!.payload);
  });
});
