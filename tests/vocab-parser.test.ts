import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseVocabPage } from "@content/vocab-parser";

const page10 = readFileSync("tests/fixtures/page-010.txt", "utf8");

describe("parseVocabPage", () => {
  it("tách được 4 mục từ trang 10", () => {
    expect(parseVocabPage(page10, 10)).toHaveLength(4);
  });

  it("lấy đúng số thứ tự, từ và từ loại", () => {
    const [first] = parseVocabPage(page10, 10);
    expect(first).toMatchObject({ ordinal: 42, word: "code", pos: "n", sourcePage: 10 });
  });

  it("lấy được danh sách từ đồng nghĩa", () => {
    const concern = parseVocabPage(page10, 10).find((e) => e.ordinal === 43)!;
    expect(concern.synonymsRaw).toContain("issue");
    expect(concern.synonymsRaw).toContain("worry");
  });

  it("chuẩn hoá từ về chữ thường (nguồn viết hoa không nhất quán)", () => {
    const policy = parseVocabPage(page10, 10).find((e) => e.ordinal === 44)!;
    expect(policy.word).toBe("policy");
  });

  it("giữ lại toàn bộ dòng gốc để bước làm sạch tham chiếu", () => {
    const [first] = parseVocabPage(page10, 10);
    expect(first.bodyLines.length).toBeGreaterThan(3);
  });

  it("bỏ qua dòng rác không khớp mẫu đầu mục", () => {
    const noise = "THỂ enon ch ban\nHil\n42. code (n). quy định, SYN: rules.\n";
    expect(parseVocabPage(noise, 1)).toHaveLength(1);
  });
});
