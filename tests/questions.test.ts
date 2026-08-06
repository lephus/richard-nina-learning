import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GrammarLesson, GrammarQuestion } from "@content/types";

const qs = JSON.parse(readFileSync("data/clean/questions.json", "utf8")) as GrammarQuestion[];
const lessons = JSON.parse(readFileSync("data/clean/grammar.json", "utf8")) as GrammarLesson[];
const slugs = new Set(lessons.map((l) => l.slug));

describe("ngân hàng câu hỏi ngữ pháp", () => {
  it("mỗi bài có ít nhất 20 câu", () => {
    for (const s of slugs) {
      expect(qs.filter((q) => q.lessonSlug === s).length, `bài ${s} thiếu câu hỏi`)
        .toBeGreaterThanOrEqual(20);
    }
  });

  it("mọi câu trỏ tới một bài có thật", () => {
    for (const q of qs) expect(slugs.has(q.lessonSlug), `slug lạ: ${q.lessonSlug}`).toBe(true);
  });

  it("mọi câu có đúng 4 lựa chọn khác nhau", () => {
    for (const q of qs) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
    }
  });

  it("đáp án nằm trong A-D và mọi câu đều có giải thích", () => {
    for (const q of qs) {
      expect(["A", "B", "C", "D"]).toContain(q.answer);
      expect(q.explanation.length).toBeGreaterThan(10);
    }
  });

  it("đáp án phân bố không lệch — không nhãn nào chiếm quá 40%", () => {
    for (const label of ["A", "B", "C", "D"] as const) {
      expect(qs.filter((q) => q.answer === label).length / qs.length).toBeLessThan(0.4);
    }
  });
});
