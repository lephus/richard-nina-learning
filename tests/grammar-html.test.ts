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
    //
    // MỞ RỘNG Ở VÒNG SOÁT CUỐI (mục minor): ba mẫu gốc bỏ sót năm đường khác
    // cũng dẫn tới thực thi mã hoặc điều hướng ngoài ý muốn trong một chuỗi
    // HTML render bằng `dangerouslySetInnerHTML` — `<object>`/`<embed>` (tương
    // đương `<iframe>` về mức rủi ro), `<base>` (đổi lại gốc tương đối của CẢ
    // TRANG), `<form>` (dựng một form không do app kiểm soát), và URL lược đồ
    // `javascript:` (có thể nằm trong `href`/`src` của bất kỳ thẻ nào, không
    // riêng `<a>`). Cùng mẫu với `scripts/phase0/add-grammar-html.ts` — hai
    // nơi này PHẢI khớp nhau, một bên kiểm lúc sinh, một bên giữ cho lời hứa
    // đó không âm thầm trôi dạt sau này.
    for (const b of bai) {
      expect(b.contentHtml).not.toMatch(/<script/i);
      expect(b.contentHtml).not.toMatch(/<iframe/i);
      expect(b.contentHtml).not.toMatch(/<object\b/i);
      expect(b.contentHtml).not.toMatch(/<embed\b/i);
      expect(b.contentHtml).not.toMatch(/<base\b/i);
      expect(b.contentHtml).not.toMatch(/<form\b/i);
      expect(b.contentHtml).not.toMatch(/javascript:/i);
      expect(b.contentHtml).not.toMatch(/<[^>]*\son[a-z]+\s*=/i);
    }
  });

  // Vòng soát cuối (mục minor): corpus có 4 `<a href="http…">` thật (các bài
  // trạng từ/đại từ/so sánh/thì) — không mang `rel="noopener noreferrer"`,
  // khác với liên kết ngoài DUY NHẤT khác của app (`stats/page.tsx`,
  // `practice-link`): thiếu thuộc tính này, trang đích mở trong tab mới đọc
  // được `window.opener` của ta. Trang `/grammar/[ordinal]` vá lại đúng lỗ
  // hổng này ở TẦNG RENDER (`themRelNoopenerChoLienKetNgoai`,
  // `src/lib/content/external-links.ts`) — không sửa `content_html` trong
  // `data/clean/grammar.json`/database, vì database thật không thể ghi lại
  // được từ môi trường chạy vòng soát này (xem báo cáo). Khẳng định Ở ĐÂY chỉ
  // xác nhận 4 liên kết đó CÓ THẬT và CHƯA mang sẵn `rel` (nếu pandoc một
  // ngày nào đó tự thêm `rel`, khẳng định "not.toMatch" bên dưới sẽ đỏ, nhắc
  // người đọc xem lại xem hàm vá ở tầng render còn cần thiết không) — bài
  // kiểm hàm vá đó nằm ở `tests/external-links.test.ts`.
  it("4 liên kết ngoài hiện có chưa mang rel=noopener (vá ở tầng render, không phải ở đây)", () => {
    const lienKet = bai.flatMap((b) => [...b.contentHtml.matchAll(/<a\s+href="(https?:\/\/[^"]*)"/gi)]);
    expect(lienKet.length).toBe(4);
    for (const b of bai) {
      expect(b.contentHtml).not.toMatch(/<a\s+href="https?:\/\/[^"]*"[^>]*\brel="noopener noreferrer"/i);
    }
  });

  // Vòng soát cuối lát 2d (mục 4, IMPORTANT): 3/20 bài (ordinal 2, 11, 13)
  // mang `<img src="media/imageN.ext">` — tham chiếu pandoc để lại từ `.docx`
  // nguồn, KHÔNG file ảnh nào từng tồn tại trên đĩa (không có thư mục
  // `public/` nào trong repo trước bản vá này) — mọi `src` đó 404 THẬT. Bài
  // 11 và 13 mỗi bài chỉ có ĐÚNG MỘT ảnh chiếm trọn một trang (một bảng tổng
  // hợp lớn), nên ảnh vỡ không phải một khiếm khuyết trang trí nhỏ.
  //
  // Vá lại ở TẦNG RENDER (`suaDuongDanAnh`, `src/lib/content/fix-image-src.ts`)
  // — CỐ TÌNH không sửa `contentHtml` ở đây: `tests/db-integrity.test.ts`
  // khẳng định `content_html` của DATABASE THẬT khớp byte-for-byte với
  // `contentHtml` trong `data/clean/grammar.json`, và môi trường chạy vòng
  // soát cuối này không cho phép ghi vào Supabase (xem báo cáo) — sửa file mà
  // không đẩy lên được database sẽ làm đỏ chính bài test integrity đó. Khẳng
  // định Ở ĐÂY chỉ xác nhận 3 bài đó CÓ THẬT và src CHƯA trỏ tới `public/`
  // (nếu số này đổi, nhắc người đọc xem lại danh sách khoá cứng trong
  // `scripts/phase0/backfill-grammar-media.ts`) — bài kiểm hàm vá thật, có
  // đối chiếu file tồn tại dưới `public/`, nằm ở `tests/fix-image-src.test.ts`.
  it("3 bài có ảnh hiện có src CHƯA trỏ tới public/ (vá ở tầng render, không phải ở đây)", () => {
    const coAnh = bai.filter((b) => /<img\b/i.test(b.contentHtml));
    expect(coAnh.map((b) => b.ordinal).sort((a, c) => a - c)).toEqual([2, 11, 13]);
    for (const b of coAnh) {
      expect(b.contentHtml).not.toMatch(/src="\/grammar-media\//);
      expect(b.contentHtml).toMatch(/src="media\/image\d+\.\w+"/);
    }
  });
});
