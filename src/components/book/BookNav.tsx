"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TOTAL_BOOK_PAGES, parseBookPage } from "@/lib/book/pages";

export function BookNav({
  page, prevHref, nextHref,
}: {
  page: number;
  prevHref: string | null;
  nextHref: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(page));
  const [loi, setLoi] = useState(false);

  // Next 16 khoá segment của router theo tham số động [page], nên chuyển
  // /doc-sach/5 → /doc-sach/6 remount cả cây con này — ô nhập không thể đóng
  // băng theo kiểu đó. Vẫn giữ effect này làm bảo hiểm rẻ: nếu sau này bật
  // `cacheComponents`, subtree có thể được tái dùng thay vì remount, và lúc
  // đó dòng này mới thật sự là thứ giữ ô nhập đồng bộ với URL.
  useEffect(() => {
    setValue(String(page));
    setLoi(false);
  }, [page]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Không cướp phím khi người dùng đang gõ vào ô nhập: ở đó mũi tên là để
      // di chuyển con trỏ. Bỏ qua kiểm tra này thì không thể sửa số vừa gõ.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;

      // Alt+←/→ (Windows/Linux) và Cmd+←/→ (macOS) là phím tắt Back/Forward
      // của trình duyệt; Shift+← còn là phím chọn chữ. Bắt phím ở đây cùng
      // lúc trình duyệt điều hướng lịch sử sẽ đẩy router tới một trang người
      // dùng không xin, chồng lên đúng chỗ lịch sử vừa bị nút Back đổi.
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

      if (e.key === "ArrowLeft" && prevHref) router.push(prevHref);
      if (e.key === "ArrowRight" && nextHref) router.push(nextHref);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevHref, nextHref, router]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Ô nhập là văn bản tự do, không phải URL: bỏ số 0 thừa ở đầu ("050" →
    // "50") trước khi kiểm tra. parseBookPage phải giữ nghiêm ngặt cho URL
    // (xem tests/book-pages.test.ts — "01" bị từ chối vì hai chuỗi khác nhau
    // không được trỏ về cùng một trang), nhưng người gõ "050" vào ô này đang
    // nhập đúng ý "trang 50" và không nên bị chính luật đó từ chối ngược lại.
    const chuanHoa = value.trim().replace(/^0+(?=\d)/, "");
    // Dùng ĐÚNG hàm parseBookPage mà route dùng, không viết lại luật kiểm tra
    // ở đây: hai bản cài đặt của cùng một luật sẽ trôi khỏi nhau.
    const dich = parseBookPage(chuanHoa);
    if (dich === null) { setLoi(true); return; }
    setLoi(false);
    router.push(`/doc-sach/${dich}`);
  }

  return (
    <form onSubmit={submit} className="flex items-center justify-center gap-2 text-sm">
      <label htmlFor="book-jump" className="sr-only">Tới trang số</label>
      <input
        id="book-jump"
        name="page"
        data-testid="book-jump-input"
        inputMode="numeric"
        value={value}
        // Xoá lỗi ngay khi người dùng gõ tiếp: giữ lỗi cũ hiện trong lúc họ
        // đang sửa số vừa nhập sai là thông báo cho một giá trị không còn
        // đúng nữa.
        onChange={(e) => { setValue(e.target.value); setLoi(false); }}
        aria-invalid={loi}
        className="w-16 rounded border border-slate-300 px-2 py-1 text-center"
      />
      <span className="text-slate-500">/ {TOTAL_BOOK_PAGES}</span>
      <button
        type="submit"
        data-testid="book-jump-submit"
        className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
      >
        Đi
      </button>
      {loi && (
        <span data-testid="book-jump-error" role="alert" className="text-amber-700">
          Nhập số từ 1 đến {TOTAL_BOOK_PAGES}
        </span>
      )}
    </form>
  );
}
