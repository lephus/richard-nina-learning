import { describe, expect, it } from "vitest";
import {
  BOOK_BUCKET, TOTAL_BOOK_PAGES,
  parseBookPage, pdfPageOf, printedPageOf, storagePath,
} from "@/lib/book/pages";

describe("hằng số", () => {
  it("sách có 112 trang nội dung và bucket tên book-pages", () => {
    expect(TOTAL_BOOK_PAGES).toBe(112);
    expect(BOOK_BUCKET).toBe("book-pages");
  });
});

describe("parseBookPage", () => {
  it("nhận số trang hợp lệ ở cả hai biên", () => {
    expect(parseBookPage("1")).toBe(1);
    expect(parseBookPage("48")).toBe(48);
    expect(parseBookPage("112")).toBe(112);
  });

  it("từ chối số ngoài biên", () => {
    expect(parseBookPage("0")).toBeNull();
    expect(parseBookPage("113")).toBeNull();
    expect(parseBookPage("-1")).toBeNull();
  });

  it("từ chối thứ không phải số nguyên", () => {
    expect(parseBookPage("1.5")).toBeNull();
    expect(parseBookPage("abc")).toBeNull();
    expect(parseBookPage("")).toBeNull();
    expect(parseBookPage("1e2")).toBeNull();
  });

  // Một trang chỉ nên có ĐÚNG MỘT URL. "01" và "1" cùng trỏ tới trang 1 thì
  // link chia sẻ và lịch sử trình duyệt tách làm hai bản cho cùng một trang.
  it("từ chối dạng viết không chuẩn tắc", () => {
    expect(parseBookPage("01")).toBeNull();
    expect(parseBookPage(" 1")).toBeNull();
    expect(parseBookPage("+1")).toBeNull();
  });
});

describe("quy đổi ba hệ số", () => {
  it("trang đọc 1 là trang PDF 3, in số 2, file 001.webp", () => {
    expect(pdfPageOf(1)).toBe(3);
    expect(printedPageOf(1)).toBe(2);
    expect(storagePath(1)).toBe("001.webp");
  });

  it("trang đọc 48 là trang PDF 50, in số 49, file 048.webp", () => {
    expect(pdfPageOf(48)).toBe(50);
    expect(printedPageOf(48)).toBe(49);
    expect(storagePath(48)).toBe("048.webp");
  });

  it("trang đọc 112 là trang PDF 114, in số 113, file 112.webp", () => {
    expect(pdfPageOf(112)).toBe(114);
    expect(printedPageOf(112)).toBe(113);
    expect(storagePath(112)).toBe("112.webp");
  });

  it("ném khi trang ngoài biên 1..112", () => {
    expect(() => storagePath(0)).toThrow(RangeError);
    expect(() => storagePath(113)).toThrow(RangeError);
    expect(() => pdfPageOf(0)).toThrow(RangeError);
    expect(() => printedPageOf(113)).toThrow(RangeError);
  });
});
