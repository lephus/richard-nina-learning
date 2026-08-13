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
    // blankAnswer có thể là "openings" trong khi word là "opening". Nếu nhiễu
    // để ở dạng gốc thì đáp án đúng tự lộ — nó thành phương án duy nhất khớp
    // ngữ pháp. Kiểm: mọi phương án của câu điền phải là một blankAnswer nào đó.
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

  // Bài thi là lần đầu người học gặp phần chấm điểm. Nếu build nổ trên MỘT buổi
  // cụ thể thì buổi đó không vào thi được — nên kiểm cả 20 buổi, không phải một
  // buổi mẫu. Xem mục 8 của spec.
  it("dựng được đề cho cả 20 buổi, không buổi nào nổ", () => {
    for (let buoi = 0; buoi < 20; buoi++) {
      const { words, blanks } = lieu(buoi * 30, buoi * 30 + 30);
      expect(() => buildVocabExam(words, blanks, buoi + 1)).not.toThrow();
    }
  });

  // Bẫy "đồng nghĩa hai chiều": pickDistractors chỉ chặn được chiều target →
  // ứng viên (qua tu.synonyms trong `taken`), không tự chặn chiều ngược lại vì
  // quan hệ đồng nghĩa trong kho phần lớn là MỘT CHIỀU. Một câu nghĩa có thể vì
  // vậy mang HAI đáp án đúng: đáp án thật, và một phương án nhiễu mà chính nó
  // coi đáp án thật là đồng nghĩa của nó — người học chọn đúng vẫn bị chấm sai.
  // Kiểm một seed một buổi là không đủ: rò rỉ chỉ lộ trên một phần seed (không
  // phải seed nào cũng xáo trúng cặp từ rò rỉ vào cùng một câu hỏi), nên phải
  // quét nhiều seed trên cả 20 buổi mới bắt được, đúng như cách người review
  // phát hiện ra lỗi này trên corpus thật.
  it("câu nghĩa không rò đáp án qua đồng nghĩa một chiều ngược lại", () => {
    const dongNghiaCua = new Map(raw.map((w) => [w.word, w.synonyms]));
    const roRi: string[] = [];

    for (let buoi = 0; buoi < 20; buoi++) {
      const { words, blanks } = lieu(buoi * 30, buoi * 30 + 30);
      for (let seed = 1; seed <= 20; seed++) {
        const cau = buildVocabExam(words, blanks, seed);
        for (const c of cau.filter((c) => c.kind === "nghia")) {
          for (const phuongAn of c.options) {
            if (phuongAn === c.answer) continue;
            const dongNghiaCuaNhieu = dongNghiaCua.get(phuongAn) ?? [];
            if (dongNghiaCuaNhieu.includes(c.answer)) {
              roRi.push(
                `buổi ${buoi}, seed ${seed}: đáp án "${c.answer}" bị rò rỉ bởi ` +
                  `phương án nhiễu "${phuongAn}" (synonyms của "${phuongAn}" chứa "${c.answer}")`,
              );
            }
          }
        }
      }
    }

    expect(roRi).toEqual([]);
  });

  // THÊM Ở VÒNG SOÁT CUỐI lát 2c (mục 3 minor, spec §6): bài ÔN TẬP NHÓM
  // (`batDauOnTap`) là nơi DUY NHẤT `buildVocabExam` thật sự chạy trên 60 từ —
  // `napPhamVi` gộp `lessonsOf(group)` (hai buổi liên tiếp = 60 từ) trước khi
  // gọi hàm này. Trước bản vá này không test nào kiểm phần chia 30–30 hay
  // tính không-rò-đồng-nghĩa ở đúng kích thước đó — hai test hồi quy phía
  // trên chỉ quét 30 từ (một buổi). Dùng lại ĐÚNG khuôn của hai test đó (đếm
  // câu/chia đôi, và quét nhiều seed trên nhiều phạm vi để bắt rò rỉ hiếm),
  // chỉ đổi đơn vị quét từ "buổi" (30 từ) sang "nhóm" (60 từ, hai buổi gộp) —
  // đúng cách `napPhamVi` gộp thật trong `batDauOnTap`.
  it("60 từ (một nhóm, hai buổi gộp) cho đúng 60 câu, mỗi từ một câu, chia 30–30, không rò đồng nghĩa", () => {
    const dongNghiaCua = new Map(raw.map((w) => [w.word, w.synonyms]));
    const roRi: string[] = [];

    for (let nhom = 0; nhom < 10; nhom++) {
      const { words, blanks } = lieu(nhom * 60, nhom * 60 + 60);
      for (let seed = 1; seed <= 20; seed++) {
        const cau = buildVocabExam(words, blanks, seed);
        expect(cau).toHaveLength(60);
        expect(new Set(cau.map((c) => c.wordId)).size).toBe(60);
        expect(cau.filter((c) => c.kind === "nghia")).toHaveLength(30);
        expect(cau.filter((c) => c.kind === "dien")).toHaveLength(30);

        for (const c of cau.filter((c) => c.kind === "nghia")) {
          for (const phuongAn of c.options) {
            if (phuongAn === c.answer) continue;
            const dongNghiaCuaNhieu = dongNghiaCua.get(phuongAn) ?? [];
            if (dongNghiaCuaNhieu.includes(c.answer)) {
              roRi.push(
                `nhóm ${nhom}, seed ${seed}: đáp án "${c.answer}" bị rò rỉ bởi ` +
                  `phương án nhiễu "${phuongAn}" (synonyms của "${phuongAn}" chứa "${c.answer}")`,
              );
            }
          }
        }
      }
    }

    expect(roRi).toEqual([]);
  });
});
