import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildVocabExam } from "@/lib/exam/build";
import type { VocabLite } from "@/lib/vocab/word";

interface RawWord {
  ordinal: number; word: string; pos: string; ipa: string;
  meaningVi: string; definitionEn: string; synonyms: string[];
  exampleEn: string; exampleVi: string; blankAnswer: string;
}
const raw = JSON.parse(readFileSync("data/clean/vocab.json", "utf8")) as RawWord[];

/** Dựng VocabLite + bảng đáp án từ dữ liệu sách thật, không phải fixture bịa. */
function lieu(tu: number, den: number) {
  const lat = raw.slice(tu, den);
  const words: VocabLite[] = lat.map((w) => ({
    id: w.ordinal, word: w.word, pos: w.pos, ipa: w.ipa,
    meaningVi: w.meaningVi, definitionEn: w.definitionEn,
    synonyms: w.synonyms, exampleEn: w.exampleEn, exampleVi: w.exampleVi,
    // Cố ý để rỗng, đúng như VocabLite thật ở phía client: cột blank_answer đã
    // bị thu hồi khỏi `authenticated` nên object này không bao giờ mang đáp án.
    // Nhờ vậy bộ test còn chứng minh thêm một điều: buildVocabExam lấy đáp án
    // câu điền từ tham số `blankAnswers`, không thể lỡ đọc trộm từ chính từ.
    blankAnswer: "",
  }));
  const blanks = new Map(lat.map((w) => [w.ordinal, w.blankAnswer]));
  return { words, blanks };
}

describe("buildVocabExam", () => {
  it("30 từ cho đúng 30 câu, mỗi từ đúng một câu", () => {
    const { words, blanks } = lieu(0, 30);
    const cau = buildVocabExam(words, blanks, 1);
    expect(cau).toHaveLength(30);
    expect(new Set(cau.map((c) => c.wordId)).size).toBe(30);
  });

  it("chia 15 câu nghĩa và 15 câu điền", () => {
    const { words, blanks } = lieu(0, 30);
    const cau = buildVocabExam(words, blanks, 1);
    expect(cau.filter((c) => c.kind === "nghia")).toHaveLength(15);
    expect(cau.filter((c) => c.kind === "dien")).toHaveLength(15);
  });

  it("mỗi câu có đúng 4 phương án khác nhau, và đáp án nằm trong đó", () => {
    const { words, blanks } = lieu(0, 30);
    for (const c of buildVocabExam(words, blanks, 7)) {
      expect(c.options).toHaveLength(4);
      expect(new Set(c.options).size).toBe(4);
      expect(c.options).toContain(c.answer);
    }
  });

  it("câu điền lấy cả 4 phương án ở dạng biến cách, không phải dạng gốc", () => {
    // blankAnswer co the la "openings" trong khi word la "opening". Neu nhieu
    // de o dang goc thi dap an dung tu lo — no thanh phuong an duy nhat khop
    // ngu phap. Kiem: moi phuong an cua cau dien phai la mot blankAnswer nao do.
    const { words, blanks } = lieu(0, 30);
    const hopLe = new Set(blanks.values());
    for (const c of buildVocabExam(words, blanks, 3).filter((c) => c.kind === "dien")) {
      for (const p of c.options) expect(hopLe.has(p)).toBe(true);
    }
  });

  it("cùng seed cho cùng đề — tải lại trang không đổi câu hỏi", () => {
    const { words, blanks } = lieu(0, 30);
    expect(buildVocabExam(words, blanks, 42)).toEqual(buildVocabExam(words, blanks, 42));
  });

  it("nổ khi nguồn quá hẹp thay vì lặng lẽ trả đề ngắn hơn", () => {
    const { words, blanks } = lieu(0, 2);
    expect(() => buildVocabExam(words, blanks, 1)).toThrow();
  });

  it("phạm vi hẹp vẫn dựng được khi có nguồn nhiễu mở rộng — đường của bài bổ túc", () => {
    const { words, blanks } = lieu(0, 30);
    const hep = words.slice(0, 2);
    const cau = buildVocabExam(hep, blanks, 1, words);
    expect(cau).toHaveLength(2);
    for (const c of cau) expect(c.options).toHaveLength(4);
  });

  // Bai thi la lan dau nguoi hoc gap phan cham diem. Neu build no tren MOT buoi
  // cu the thi buoi do khong vao thi duoc — nen kiem ca 20 buoi, khong phai mot
  // buoi mau. Xem muc 8 cua spec.
  it("dựng được đề cho cả 20 buổi, không buổi nào nổ", () => {
    for (let buoi = 0; buoi < 20; buoi++) {
      const { words, blanks } = lieu(buoi * 30, buoi * 30 + 30);
      expect(() => buildVocabExam(words, blanks, buoi + 1)).not.toThrow();
    }
  });
});
