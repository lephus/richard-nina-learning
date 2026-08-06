import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkIntegrity } from "@content/integrity";
import type { GrammarLesson, GrammarQuestion, LessonPlan, VocabWord } from "@content/types";

const read = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const bundle = {
  vocab: read<VocabWord[]>("data/clean/vocab.json"),
  grammar: read<GrammarLesson[]>("data/clean/grammar.json"),
  questions: read<GrammarQuestion[]>("data/clean/questions.json"),
  plan: read<LessonPlan[]>("data/clean/lesson-plan.json"),
};

describe("toàn vẹn nội dung", () => {
  it("không có vi phạm nào trong bộ dữ liệu thật", () => {
    expect(checkIntegrity(bundle)).toEqual([]);
  });

  it("phát hiện từ bị dùng ở hai buổi", () => {
    const broken = { ...bundle, plan: bundle.plan.map((p, i) =>
      i === 1 ? { ...p, wordOrdinals: bundle.plan[0]!.wordOrdinals } : p) };
    expect(checkIntegrity(broken).some((v) => v.kind === "duplicate-word")).toBe(true);
  });

  it("phát hiện buổi trỏ tới bài ngữ pháp không tồn tại", () => {
    const broken = { ...bundle, plan: bundle.plan.map((p, i) =>
      i === 0 ? { ...p, grammarSlug: "khong-ton-tai" } : p) };
    expect(checkIntegrity(broken).some((v) => v.kind === "missing-grammar")).toBe(true);
  });

  it("phát hiện buổi thiếu từ", () => {
    const broken = { ...bundle, plan: bundle.plan.map((p, i) =>
      i === 0 ? { ...p, wordOrdinals: p.wordOrdinals.slice(0, 29) } : p) };
    expect(checkIntegrity(broken).some((v) => v.kind === "wrong-word-count")).toBe(true);
  });
});
