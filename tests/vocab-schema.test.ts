import { describe, expect, it } from "vitest";
import { validateVocab, vocabWordSchema } from "@content/vocab-schema";

const ok = {
  ordinal: 42, word: "code", pos: "n", ipa: "/koʊd/",
  meaningVi: "quy định, quy tắc",
  definitionEn: "a system of written rules",
  definitionVi: "một hệ thống các quy tắc thành văn",
  synonyms: ["rules", "regulations"],
  exampleEn: "Employees must follow the dress ___.",
  exampleVi: "Nhân viên phải tuân theo ___ về trang phục.",
  blankAnswer: "code",
};

describe("vocabWordSchema", () => {
  it("chấp nhận bản ghi hợp lệ", () => {
    expect(vocabWordSchema.parse(ok).word).toBe("code");
  });

  it("từ chối IPA không bọc trong dấu gạch chéo", () => {
    expect(() => vocabWordSchema.parse({ ...ok, ipa: "koʊd" })).toThrow();
  });

  it("từ chối câu ví dụ thiếu chỗ trống ___", () => {
    expect(() => vocabWordSchema.parse({ ...ok, exampleEn: "Follow the code." })).toThrow();
  });

  it("từ chối danh sách đồng nghĩa rỗng", () => {
    expect(() => vocabWordSchema.parse({ ...ok, synonyms: [] })).toThrow();
  });

  it("chấp nhận meaningVi không dấu khi đó là chính tả đúng (vd 'tham gia')", () => {
    expect(vocabWordSchema.parse({ ...ok, meaningVi: "tham gia" }).meaningVi).toBe("tham gia");
  });

  it("từ chối definitionVi không có dấu (dấu hiệu OCR chưa sửa)", () => {
    expect(() =>
      vocabWordSchema.parse({ ...ok, definitionVi: "mot he thong cac quy tac thanh van" })
    ).toThrow();
  });
});

describe("validateVocab", () => {
  it("tách được bản ghi hợp lệ và không hợp lệ kèm lý do", () => {
    const r = validateVocab([ok, { ...ok, ordinal: 43, synonyms: [] }]);
    expect(r.valid).toHaveLength(1);
    expect(r.invalid).toHaveLength(1);
    expect(r.invalid[0]!.ordinal).toBe(43);
    expect(r.invalid[0]!.problems.join(" ")).toMatch(/synonyms/);
  });
});
