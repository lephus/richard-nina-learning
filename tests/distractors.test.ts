import { describe, expect, it } from "vitest";
import { pickDistractors } from "@/lib/exam/distractors";
import type { VocabLite } from "@/lib/vocab/word";

// exampleEn mô phỏng dữ liệu thật: Phase 0 đã khoét sẵn đúng một "___" khi
// dựng nội dung, và blankAnswer — chỉ dùng để chấm điểm ở server — không
// xuất hiện trong exampleEn (đã kiểm chứng trên cả 605 dòng vocab_words).
const w = (id: number, pos: string): VocabLite => ({
  id,
  word: `word${id}`,
  pos,
  ipa: `/w${id}/`,
  meaningVi: `nghĩa ${id}`,
  definitionEn: `definition ${id}`,
  synonyms: [`syn${id}`],
  exampleEn: `A ___ sentence for item ${id}.`,
  exampleVi: `Một câu ví dụ cho mục ${id}.`,
  blankAnswer: `answer${id}`,
});

/** Bậc 3 nay LƯỜI — truyền vào dạng hàm, và chỉ được gọi khi bậc 1+2 thiếu. */
const bankOf = (words: readonly VocabLite[]) => () => words;
/** Cấu hình mặc định của câu nghĩa: phân biệt theo CHỮ HIỂN THỊ, không theo id. */
const byMeaning = (target: VocabLite, bank?: readonly VocabLite[]) => ({
  textOf: (c: VocabLite) => c.meaningVi,
  taken: [target.meaningVi],
  ...(bank ? { bank: bankOf(bank) } : {}),
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
    const picked = pickDistractors(target, lessonWords, 42, byMeaning(target, bank));
    expect(picked).toHaveLength(3);
    expect(picked.some((p) => p.id === target.id)).toBe(false);
  });

  it("bậc 1: ưu tiên từ cùng buổi cùng loại từ", () => {
    const target = lessonWords[0]!; // danh từ, còn 19 danh từ khác cùng buổi
    const picked = pickDistractors(target, lessonWords, 42, byMeaning(target, bank));
    expect(picked.every((p) => p.pos === "n")).toBe(true);
  });

  it("bậc 2: hết từ cùng loại thì lấy từ khác loại trong cùng buổi", () => {
    // Giới từ chỉ có 1 từ trong buổi — toàn kho thật cũng chỉ có 2 giới từ.
    const target = lessonWords[29]!;
    expect(target.pos).toBe("prep");
    const picked = pickDistractors(target, lessonWords, 42, byMeaning(target, bank));
    expect(picked).toHaveLength(3);
    expect(picked.every((p) => lessonWords.some((l) => l.id === p.id))).toBe(true);
  });

  it("bậc 3: buổi quá nhỏ thì mở rộng ra toàn kho", () => {
    const tiny = [lessonWords[0]!, lessonWords[1]!];
    const got = pickDistractors(tiny[0]!, tiny, 42, byMeaning(tiny[0]!, bank));
    expect(got).toHaveLength(3);
    expect(got.some((p) => !tiny.some((t) => t.id === p.id))).toBe(true);
  });

  it("tất định: cùng seed luôn cho cùng kết quả", () => {
    const a = pickDistractors(lessonWords[0]!, lessonWords, 7, byMeaning(lessonWords[0]!, bank));
    const b = pickDistractors(lessonWords[0]!, lessonWords, 7, byMeaning(lessonWords[0]!, bank));
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });

  it("seed khác thì kết quả khác", () => {
    const a = pickDistractors(lessonWords[0]!, lessonWords, 1, byMeaning(lessonWords[0]!, bank));
    const b = pickDistractors(lessonWords[0]!, lessonWords, 999, byMeaning(lessonWords[0]!, bank));
    expect(a.map((x) => x.id)).not.toEqual(b.map((x) => x.id));
  });

  it("không lấy ứng viên trùng CHỮ HIỂN THỊ với đáp án đúng, dù khác id", () => {
    // 17 chuỗi meaningVi trong kho thật bị hai dòng khác nhau dùng chung. Lọc
    // theo id thì hai dòng đó vẫn hiện ra hai nút y hệt nhau, và một trong hai
    // nút "đúng" bị chấm sai.
    const target = w(1, "n");
    const clone = { ...w(2, "n"), meaningVi: target.meaningVi };
    const pool = [target, clone, w(3, "n"), w(4, "n"), w(5, "n")];
    const picked = pickDistractors(target, pool, 42, byMeaning(target));
    expect(picked).toHaveLength(3);
    expect(picked.some((p) => p.meaningVi === target.meaningVi)).toBe(false);
  });

  it("không lấy hai ứng viên trùng chữ hiển thị với nhau", () => {
    const target = w(1, "n");
    const twins = [w(2, "n"), w(3, "n")].map((x) => ({ ...x, meaningVi: "trùng nhau" }));
    const pool = [target, ...twins, w(4, "n"), w(5, "n")];
    const picked = pickDistractors(target, pool, 42, byMeaning(target));
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((p) => p.meaningVi)).size).toBe(3);
  });

  it("bậc 3 là LƯỜI: bậc 1+2 đủ thì không đụng tới kho", () => {
    // Đây là lý do bỏ được truy vấn tải 605 từ ở loadContext: mỗi buổi 30 từ
    // nên bậc 1+2 luôn có 29 ứng viên cho 3 chỗ.
    let calls = 0;
    const picked = pickDistractors(lessonWords[0]!, lessonWords, 42, {
      textOf: (c) => c.meaningVi,
      taken: [lessonWords[0]!.meaningVi],
      bank: () => {
        calls++;
        return bank;
      },
    });
    expect(picked).toHaveLength(3);
    expect(calls).toBe(0);
  });
});
