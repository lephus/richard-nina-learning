/**
 * Viết lại `src="media/imageN.ext"` (tham chiếu pandoc để lại từ `.docx`
 * nguồn, không file nào từng tồn tại trên đĩa) thành `src="/grammar-media/<ordinal>/media/imageN.ext"`
 * — đường dẫn công khai THẬT mà Next.js phục vụ từ `public/`.
 *
 * Vòng soát cuối lát 2d (mục 4, IMPORTANT): 3/20 bài (ordinal 2, 11, 13)
 * mang `<img src="media/imageN.ext">` trong `content_html` — không thư mục
 * `public/` nào tồn tại trong repo trước bản vá này, nên mọi `src` đó 404
 * THẬT. Bài 11 và 13 mỗi bài chỉ có ĐÚNG MỘT ảnh chiếm trọn một trang (một
 * bảng tổng hợp lớn), nên ảnh vỡ không phải một khiếm khuyết trang trí nhỏ.
 *
 * Vá Ở TẦNG RENDER (gọi tại `/grammar/[ordinal]/page.tsx`, ngay trước
 * `dangerouslySetInnerHTML`) — CỐ TÌNH KHÔNG sửa `content_html` trong
 * `data/clean/grammar.json`/database: `tests/db-integrity.test.ts` khẳng
 * định `content_html` của DATABASE THẬT khớp byte-for-byte với `contentHtml`
 * trong file đó — sửa file mà không đẩy được lên database (môi trường chạy
 * vòng soát cuối này không cho phép ghi vào Supabase, xem báo cáo cuối lát
 * 2d) sẽ làm đỏ chính bài test integrity đó. Vá ở tầng render tránh hoàn
 * toàn vấn đề này: có tác dụng NGAY LẬP TỨC, không phụ thuộc một bước đồng
 * bộ database nào.
 *
 * Ảnh THẬT đã được trích sẵn ra `public/grammar-media/<ordinal>/media/` —
 * xem `scripts/phase0/backfill-grammar-media.ts` (chạy `pandoc --extract-media`
 * trực tiếp trên đúng 3 file `.docx` nguồn, đối chiếu byte thật để xác nhận
 * tên file `imageN.ext` khớp chính xác với tham chiếu đã nằm sẵn trong
 * `content_html`).
 *
 * Hàm thuần: không đọc mạng, không phụ thuộc DOM — test được trực tiếp trên
 * chuỗi, xem `tests/fix-image-src.test.ts`.
 */
export function suaDuongDanAnh(html: string, ordinal: number): string {
  return html.replace(
    /src="media\/(image\d+\.\w+)"/g,
    (_m, file: string) => `src="/grammar-media/${ordinal}/media/${file}"`,
  );
}
