/**
 * Ba hệ số trang cùng tồn tại trong tính năng này, và chúng lệch nhau:
 *
 *   trang đọc 1..112   — thứ người dùng thấy: URL, nhãn, ô nhảy trang
 *   trang PDF  3..114  — chỉ số trong file gốc; trang 1-2 là bìa, không render
 *   số in      2..113  — con số in ở góc dưới phải của chính trang sách
 *
 * Ánh xạ được áp dụng MỘT LẦN lúc nén ảnh (script 06), nên tên file trên
 * Storage đã theo trang đọc và runtime không bao giờ cộng trừ chỉ số nữa.
 * Mọi lỗi lệch một đơn vị vì thế chỉ có thể xảy ra trong một script chạy
 * offline, không thể xảy ra trên đường phục vụ người dùng.
 */

export const TOTAL_BOOK_PAGES = 112;
export const BOOK_BUCKET = "book-pages";

/** Trang PDF ứng với trang đọc 1. Trang PDF 1-2 là bìa. */
const FIRST_PDF_PAGE = 3;

function assertInRange(readerPage: number): void {
  if (
    !Number.isInteger(readerPage) ||
    readerPage < 1 ||
    readerPage > TOTAL_BOOK_PAGES
  ) {
    throw new RangeError(`trang ${readerPage} ngoài biên 1..${TOTAL_BOOK_PAGES}`);
  }
}

/**
 * Chỉ chấp nhận dạng viết chuẩn tắc (`^[1-9][0-9]*$`) chứ không dùng
 * `Number()` rồi kiểm tra biên. `Number()` nuốt cả `" 1"`, `"01"`, `"+1"`,
 * `"1e2"` — mỗi biến thể là một URL khác trỏ về cùng một trang, làm loãng
 * lịch sử trình duyệt và link chia sẻ cho không lợi ích nào.
 *
 * Trả `null` thay vì ném, vì đầu vào ở đây đến thẳng từ URL người lạ gõ:
 * đó là chuyện thường ngày, không phải hỏng hóc.
 */
export function parseBookPage(raw: string): number | null {
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= TOTAL_BOOK_PAGES ? n : null;
}

/** Tên object trên Storage, ví dụ trang 48 → "048.webp". */
export function storagePath(readerPage: number): string {
  assertInRange(readerPage);
  return `${String(readerPage).padStart(3, "0")}.webp`;
}

/** Trang tương ứng trong file PDF gốc — chỉ script nén ảnh cần tới. */
export function pdfPageOf(readerPage: number): number {
  assertInRange(readerPage);
  return readerPage + FIRST_PDF_PAGE - 1;
}

/**
 * Con số in ở góc trang sách. Hiện nó ra bên cạnh số trang đọc vì người đọc
 * NHÌN THẤY nó trong ảnh và sẽ tưởng web đếm sai nếu hai số khác nhau mà
 * không ai nói gì.
 */
export function printedPageOf(readerPage: number): number {
  assertInRange(readerPage);
  return readerPage + 1;
}
