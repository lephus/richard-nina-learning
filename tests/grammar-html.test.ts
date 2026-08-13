import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface Bai { ordinal: number; slug: string; contentMd: string; contentHtml: string }
const bai = JSON.parse(readFileSync("data/clean/grammar.json", "utf8")) as Bai[];

describe("contentHtml của 20 bài ngữ pháp", () => {
  it("bài nào cũng có, và không rỗng", () => {
    expect(bai).toHaveLength(20);
    for (const b of bai) expect(b.contentHtml.length).toBeGreaterThan(100);
  });

  // Đây là khẳng định đóng lại rủi ro 11.2 của spec phase 2: giá trị của 20
  // bài nằm ở các bảng so sánh hai cột, và bản markdown cũ chứa grid table của
  // pandoc mà không thư viện JS nào render được.
  it("bảng đã thành <table> thật, không còn grid table của pandoc", () => {
    const coBang = bai.filter((b) => b.contentMd.includes("+===="));
    expect(coBang.length).toBeGreaterThan(0);
    for (const b of coBang) {
      expect(b.contentHtml).toContain("<table");
      expect(b.contentHtml).not.toContain("+====");
    }
  });

  // Trang lý thuyết render chuỗi này bằng dangerouslySetInnerHTML. Chuỗi cung
  // ứng khép kín (pandoc chạy offline trên .docx trong repo, seed bằng service
  // key) nên không có đường cho dữ liệu người dùng lọt vào — nhưng "an toàn vì
  // tôi nói vậy" không kiểm được. Đây là chỗ biến nó thành bất biến đỏ được.
  it("không chứa script, iframe, hay thuộc tính on…=", () => {
    // Mẫu on…= phải bắt đầu từ "<" và nằm trong cùng một thẻ mới tính là khớp
    // — không được khớp tự do trong văn bản thường. Bản đầu tiên của mẫu này
    // là /\son[a-z]+\s*=/i (không neo vào "<"), và nó khớp nhầm câu "no one =
    // not anybody" ở bài đại từ ("on" nằm trong từ "one", rồi theo sau là
    // " =") — một câu ngữ pháp hợp lệ, không phải thẻ HTML. Neo vào "<[^>]*"
    // là cách tách markup khỏi văn xuôi.
    for (const b of bai) {
      expect(b.contentHtml).not.toMatch(/<script/i);
      expect(b.contentHtml).not.toMatch(/<iframe/i);
      expect(b.contentHtml).not.toMatch(/<[^>]*\son[a-z]+\s*=/i);
    }
  });
});
