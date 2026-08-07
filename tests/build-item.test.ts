import { describe, expect, it } from "vitest";
import { pickDistractors, buildItem } from "@/lib/lesson/build-item";
import type { VocabLite, GrammarLite } from "@/lib/lesson/build-item";

const w = (id: number, pos: string): VocabLite => ({
  id,
  word: `word${id}`,
  pos,
  ipa: `/w${id}/`,
  meaningVi: `nghĩa ${id}`,
  definitionEn: `definition ${id}`,
  synonyms: [`syn${id}`],
  exampleEn: `A word${id} sentence.`,
  blankAnswer: `word${id}`,
});

// 30 từ: 20 danh từ (id 1..20), 9 động từ (21..29), 1 giới từ (30)
const lessonWords: VocabLite[] = [
  ...Array.from({ length: 20 }, (_, i) => w(i + 1, "n")),
  ...Array.from({ length: 9 }, (_, i) => w(i + 21, "v")),
  w(30, "prep"),
];
const bank: VocabLite[] = [...lessonWords, ...Array.from({ length: 50 }, (_, i) => w(i + 100, "adj"))];

describe("pickDistractors", () => {
  it("lấy đủ 3 phương án và không bao giờ lấy chính từ đích", () => {
    const target = lessonWords[0]!;
    const picked = pickDistractors(target, lessonWords, bank, 42);
    expect(picked).toHaveLength(3);
    expect(picked.some((p) => p.id === target.id)).toBe(false);
  });

  it("bậc 1: ưu tiên từ cùng buổi cùng loại từ", () => {
    const target = lessonWords[0]!; // danh từ, còn 19 danh từ khác cùng buổi
    const picked = pickDistractors(target, lessonWords, bank, 42);
    expect(picked.every((p) => p.pos === "n")).toBe(true);
  });

  it("bậc 2: hết từ cùng loại thì lấy từ khác loại trong cùng buổi", () => {
    // Giới từ chỉ có 1 từ trong buổi — toàn kho thật cũng chỉ có 2 giới từ.
    const target = lessonWords[29]!;
    expect(target.pos).toBe("prep");
    const picked = pickDistractors(target, lessonWords, bank, 42);
    expect(picked).toHaveLength(3);
    expect(picked.every((p) => lessonWords.some((l) => l.id === p.id))).toBe(true);
  });

  it("bậc 3: buổi quá nhỏ thì mở rộng ra toàn kho", () => {
    const tiny = [lessonWords[0]!, lessonWords[1]!];
    const got = pickDistractors(tiny[0]!, tiny, bank, 42);
    expect(got).toHaveLength(3);
    expect(got.some((p) => !tiny.some((t) => t.id === p.id))).toBe(true);
  });

  it("tất định: cùng seed luôn cho cùng kết quả", () => {
    const a = pickDistractors(lessonWords[0]!, lessonWords, bank, 7);
    const b = pickDistractors(lessonWords[0]!, lessonWords, bank, 7);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });

  it("seed khác thì kết quả khác", () => {
    const a = pickDistractors(lessonWords[0]!, lessonWords, bank, 1);
    const b = pickDistractors(lessonWords[0]!, lessonWords, bank, 999);
    expect(a.map((x) => x.id)).not.toEqual(b.map((x) => x.id));
  });
});

const grammar: GrammarLite[] = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  stem: `Grammar question ${i + 1}?`,
  options: ["A1", "B1", "C1", "D1"],
}));

const ctx = { lessonWords, bank, grammar, seed: 12345 };

describe("buildItem", () => {
  it("thẻ gặp từ mang đủ dữ liệu hiển thị và không có phương án", () => {
    const item = buildItem({ kind: "flashcard", index: 3 }, ctx);
    expect(item.kind).toBe("flashcard");
    if (item.kind !== "flashcard") throw new Error("sai nhánh");
    expect(item.word.id).toBe(lessonWords[3]!.id);
  });

  it("thẻ gặp từ không mang blankAnswer xuống client", () => {
    const item = buildItem({ kind: "flashcard", index: 3 }, ctx);
    if (item.kind !== "flashcard") throw new Error("sai nhánh");
    expect(item.word).not.toHaveProperty("blankAnswer");
  });

  it("câu nghĩa có 4 phương án, trong đó đúng một phương án là nghĩa đúng", () => {
    const item = buildItem({ kind: "meaning", index: 0 }, ctx);
    if (item.kind !== "meaning") throw new Error("sai nhánh");
    expect(item.options).toHaveLength(4);
    expect(item.options.filter((o) => o === lessonWords[0]!.meaningVi)).toHaveLength(1);
  });

  it("câu đồng nghĩa có 4 phương án và chứa từ đồng nghĩa của từ đích", () => {
    const item = buildItem({ kind: "synonym", index: 0 }, ctx);
    if (item.kind !== "synonym") throw new Error("sai nhánh");
    expect(item.options).toHaveLength(4);
    expect(item.options).toContain(lessonWords[0]!.synonyms[0]);
  });

  it("câu điền khoét từ đích khỏi câu ví dụ", () => {
    const item = buildItem({ kind: "fill", index: 0 }, ctx);
    if (item.kind !== "fill") throw new Error("sai nhánh");
    expect(item.sentence).not.toContain(lessonWords[0]!.blankAnswer);
    expect(item.sentence).toContain("___");
  });

  it("10 câu chốt buổi lấy từ cả 30 từ và không trùng nhau", () => {
    const ids = Array.from({ length: 10 }, (_, i) => {
      const item = buildItem({ kind: "final-meaning", index: i }, ctx);
      if (item.kind !== "meaning") throw new Error("chốt buổi phải là câu nghĩa");
      return item.wordId;
    });
    expect(new Set(ids).size).toBe(10);
  });

  it("5 câu ngữ pháp lấy từ kho câu hỏi của bài và không trùng nhau", () => {
    const ids = Array.from({ length: 5 }, (_, i) => {
      const item = buildItem({ kind: "grammar", index: i }, ctx);
      if (item.kind !== "grammar") throw new Error("sai nhánh");
      return item.questionId;
    });
    expect(new Set(ids).size).toBe(5);
  });

  it("tất định: dựng lại cùng vị trí cho cùng phương án", () => {
    const a = buildItem({ kind: "meaning", index: 5 }, ctx);
    const b = buildItem({ kind: "meaning", index: 5 }, ctx);
    expect(a).toEqual(b);
  });

  it("câu nghĩa và câu đồng nghĩa của cùng một từ (cùng index) không dùng chung hoán vị phương án", () => {
    // item-plan.ts cố ý cho meaning và synonym của cùng một từ chung index.
    // Nếu seed chỉ phụ thuộc index (bỏ qua kind), seededShuffle sẽ cho ra
    // cùng một hoán vị 4 phần tử cho cả hai câu — đáp án đúng luôn rơi vào
    // cùng một vị trí, học viên đoán được câu sau mà không cần biết nghĩa.
    const meaning = buildItem({ kind: "meaning", index: 0 }, ctx);
    const synonym = buildItem({ kind: "synonym", index: 0 }, ctx);
    if (meaning.kind !== "meaning") throw new Error("sai nhánh");
    if (synonym.kind !== "synonym") throw new Error("sai nhánh");

    const meaningPos = meaning.options.indexOf(lessonWords[0]!.meaningVi);
    const synonymPos = synonym.options.indexOf(lessonWords[0]!.synonyms[0]!);
    expect(meaningPos).not.toBe(-1);
    expect(synonymPos).not.toBe(-1);
    expect(meaningPos).not.toBe(synonymPos);
  });
});
