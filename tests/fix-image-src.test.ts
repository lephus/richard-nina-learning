import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { suaDuongDanAnh } from "@/lib/content/fix-image-src";

interface Bai { ordinal: number; contentHtml: string }
const bai = JSON.parse(readFileSync("data/clean/grammar.json", "utf8")) as Bai[];

describe("suaDuongDanAnh", () => {
  it("viết lại src='media/imageN.ext' thành đường dẫn public/ theo ordinal", () => {
    const out = suaDuongDanAnh('<img src="media/image2.svg" style="width:1in" />', 2);
    expect(out).toBe('<img src="/grammar-media/2/media/image2.svg" style="width:1in" />');
  });

  it("không đụng chuỗi không khớp mẫu (đã là URL tuyệt đối, hoặc không phải img)", () => {
    const out = suaDuongDanAnh('<img src="https://cdn.example.com/x.png" />', 2);
    expect(out).toBe('<img src="https://cdn.example.com/x.png" />');
  });

  it("idempotent trên chuỗi KHÔNG còn mẫu media/imageN.ext (đã vá rồi)", () => {
    const mot = suaDuongDanAnh('<img src="media/image1.png" />', 11);
    const hai = suaDuongDanAnh(mot, 11);
    expect(hai).toBe(mot);
  });

  // Khẳng định ĐÓNG (không chỉ "có vẻ đúng"): MỌI `<img src=...>` trong 3 bài
  // có ảnh — SAU KHI áp `suaDuongDanAnh` đúng như `/grammar/[ordinal]/page.tsx`
  // gọi tại thời điểm render — phải trỏ tới một file THẬT SỰ tồn tại dưới
  // `public/`, đúng thư mục Next.js phục vụ tĩnh tại gốc `/`. Nếu pipeline
  // sau này lại sinh ra một `<img>` không có nơi lưu ảnh thật, hoặc file bị
  // xoá khỏi `public/grammar-media/`, test này đỏ NGAY tại đây, thay vì để lộ
  // ra như một ảnh vỡ trên trang mà không ai kiểm.
  it("mọi <img src=...> (sau khi vá) trỏ tới một file thật dưới public/", () => {
    const coAnh = bai.filter((b) => /<img\b/i.test(b.contentHtml));
    expect(coAnh.map((b) => b.ordinal).sort((a, c) => a - c)).toEqual([2, 11, 13]);

    for (const b of coAnh) {
      const daVa = suaDuongDanAnh(b.contentHtml, b.ordinal);
      const matches = [...daVa.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)];
      expect(matches.length).toBeGreaterThan(0);
      for (const m of matches) {
        const src = m[1]!;
        expect(src).not.toMatch(/^https?:\/\//i);
        expect(src.startsWith("/")).toBe(true);
        const duongDanThat = `public${src}`;
        expect(existsSync(duongDanThat), `${duongDanThat} (bài ${b.ordinal}) không tồn tại`).toBe(
          true,
        );
      }
    }
  });
});
