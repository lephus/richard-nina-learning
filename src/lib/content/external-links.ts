/**
 * Thêm `target="_blank" rel="noopener noreferrer"` vào mọi thẻ
 * `<a href="http…">` CHƯA có sẵn hai thuộc tính này.
 *
 * Vòng soát cuối lát 2d (mục minor): `content_html` của 20 bài ngữ pháp có
 * đúng 4 liên kết ngoài thật (đọc trực tiếp `data/clean/grammar.json`, không
 * suy đoán — xem `tests/grammar-html.test.ts`), không mang `rel`, khác với
 * liên kết ngoài DUY NHẤT khác của app (`stats/page.tsx`, `practice-link`) —
 * xem chú thích tại đó về vì sao thiếu `rel="noopener noreferrer"` là một lỗ
 * hổng thật: trang đích mở trong tab mới (`target="_blank"`) đọc được
 * `window.opener` của ta khi thiếu thuộc tính này.
 *
 * Vá Ở TẦNG RENDER (gọi tại `/grammar/[ordinal]/page.tsx`, ngay trước
 * `dangerouslySetInnerHTML`) — KHÔNG sửa `content_html` trong
 * `data/clean/grammar.json`/database: không có cách nào gắn props JSX trực
 * tiếp lên một thẻ nằm trong một chuỗi HTML do server sinh sẵn, và môi trường
 * chạy vòng soát cuối này không cho phép ghi vào Supabase (xem báo cáo cuối
 * lát 2d) — vá ở tầng render có tác dụng NGAY LẬP TỨC bất kể database đã được
 * đồng bộ lại hay chưa, và còn là một lớp phòng thủ thêm cho bất kỳ nội dung
 * tương lai nào lọt qua pipeline sinh mà chưa được vá tại nguồn.
 *
 * Chỉ chạm URL TUYỆT ĐỐI http(s) — không đụng liên kết nội bộ (`#anchor`,
 * đường dẫn tương đối như `/grammar-media/...` của `<img>`) nếu sau này
 * corpus có thêm loại đó; và bỏ qua thẻ đã có sẵn `rel=`/`target=` để hàm này
 * idempotent (gọi lại trên chuỗi đã vá không thêm lần hai).
 *
 * Hàm thuần: không đọc mạng, không phụ thuộc DOM — test được trực tiếp trên
 * chuỗi, xem `tests/external-links.test.ts`.
 */
export function themRelNoopenerChoLienKetNgoai(html: string): string {
  return html.replace(
    /<a\s+href="(https?:\/\/[^"]*)"([^>]*)>/gi,
    (_m, href: string, thuocTinhKhac: string) => {
      let attrs = thuocTinhKhac;
      if (!/\brel\s*=/i.test(attrs)) attrs += ' rel="noopener noreferrer"';
      if (!/\btarget\s*=/i.test(attrs)) attrs += ' target="_blank"';
      return `<a href="${href}"${attrs}>`;
    },
  );
}
