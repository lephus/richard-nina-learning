import { describe, expect, it } from "vitest";
import { buildLessonPlan } from "@content/lesson-manifest";

const words = [...Array(605)].map((_, i) => i + 1);
const slugs = [...Array(20)].map((_, i) => `bai-${i + 1}`);

describe("buildLessonPlan", () => {
  it("tạo đúng 20 buổi", () => {
    expect(buildLessonPlan(words, slugs)).toHaveLength(20);
  });

  it("mỗi buổi đúng 30 từ", () => {
    for (const l of buildLessonPlan(words, slugs)) expect(l.wordOrdinals).toHaveLength(30);
  });

  it("không từ nào xuất hiện ở hai buổi", () => {
    const used = buildLessonPlan(words, slugs).flatMap((l) => l.wordOrdinals);
    expect(new Set(used).size).toBe(used.length);
  });

  it("giữ nguyên thứ tự sách — buổi 1 là 30 từ đầu", () => {
    expect(buildLessonPlan(words, slugs)[0]!.wordOrdinals).toEqual(words.slice(0, 30));
  });

  it("mỗi buổi gắn đúng một bài ngữ pháp, không trùng", () => {
    const g = buildLessonPlan(words, slugs).map((l) => l.grammarSlug);
    expect(new Set(g).size).toBe(20);
  });

  it("báo lỗi rõ ràng khi không đủ 600 từ", () => {
    expect(() => buildLessonPlan(words.slice(0, 599), slugs)).toThrow(/599/);
  });

  it("báo lỗi rõ ràng khi không đủ 20 bài ngữ pháp", () => {
    expect(() => buildLessonPlan(words, slugs.slice(0, 19))).toThrow(/19/);
  });
});
