import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGrammarExam, type GrammarQuestionLite } from "@/lib/exam/build-grammar";

interface RawQ { lessonSlug: string; stem: string; options: string[]; answer: string }
const raw = JSON.parse(readFileSync("data/clean/questions.json", "utf8")) as RawQ[];
const slugs = [...new Set(raw.map((q) => q.lessonSlug))];

function cauCuaBai(slug: string): GrammarQuestionLite[] {
  return raw
    .filter((q) => q.lessonSlug === slug)
    .map((q, i) => ({ id: i + 1, stem: q.stem, options: q.options, answer: q.answer }));
}

describe("buildGrammarExam", () => {
  it("lấy hết câu của bài, mỗi câu đúng một lần", () => {
    const nguon = cauCuaBai(slugs[0]!);
    const de = buildGrammarExam(nguon, 1);
    expect(de).toHaveLength(nguon.length);
    expect(new Set(de.map((c) => c.questionId)).size).toBe(nguon.length);
  });

  it("phương án lấy nguyên từ dữ liệu, không sinh thêm", () => {
    const nguon = cauCuaBai(slugs[0]!);
    for (const c of buildGrammarExam(nguon, 5)) {
      const goc = nguon.find((q) => q.id === c.questionId)!;
      expect([...c.options].sort()).toEqual([...goc.options].sort());
    }
  });

  it("đáp án là CHỮ HIỂN THỊ đúng, suy từ chữ cái A–D", () => {
    const nguon = cauCuaBai(slugs[0]!);
    for (const c of buildGrammarExam(nguon, 5)) {
      const goc = nguon.find((q) => q.id === c.questionId)!;
      const chiSo = goc.answer.charCodeAt(0) - "A".charCodeAt(0);
      expect(c.answer).toBe(goc.options[chiSo]);
      expect(c.options).toContain(c.answer);
    }
  });

  it("cùng seed cho cùng đề", () => {
    const nguon = cauCuaBai(slugs[0]!);
    expect(buildGrammarExam(nguon, 42)).toEqual(buildGrammarExam(nguon, 42));
  });

  it("nổ khi bài không có câu nào, thay vì trả đề rỗng", () => {
    expect(() => buildGrammarExam([], 1)).toThrow();
  });

  // Cùng lý do như lát 2b: một bài không dựng được đề nghĩa là người học
  // không vào thi được bài đó, và lỗi chỉ lộ khi có người thật bấm vào.
  it("dựng được đề cho cả 20 bài", () => {
    expect(slugs).toHaveLength(20);
    for (const [i, s] of slugs.entries()) {
      const nguon = cauCuaBai(s);
      expect(() => buildGrammarExam(nguon, i + 1)).not.toThrow();
      expect(buildGrammarExam(nguon, i + 1)).toHaveLength(nguon.length);
    }
  });
});
