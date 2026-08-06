import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GrammarLesson } from "@content/types";

const lessons = JSON.parse(readFileSync("data/clean/grammar.json", "utf8")) as GrammarLesson[];

describe("bộ bài ngữ pháp", () => {
  it("có đúng 20 bài", () => {
    expect(lessons).toHaveLength(20);
  });

  it("số thứ tự liên tục 1..20", () => {
    expect(lessons.map((l) => l.ordinal).sort((a, b) => a - b))
      .toEqual([...Array(20)].map((_, i) => i + 1));
  });

  it("slug không trùng nhau", () => {
    expect(new Set(lessons.map((l) => l.slug)).size).toBe(20);
  });

  it("mọi bài có nội dung đủ dài để học một buổi", () => {
    for (const l of lessons) {
      expect(l.contentMd.split(/\s+/).length, `bài ${l.slug} quá ngắn`).toBeGreaterThan(400);
    }
  });

  it("mọi bài có tóm tắt tiếng Việt", () => {
    for (const l of lessons) expect(l.summary.length).toBeGreaterThan(20);
  });
});
