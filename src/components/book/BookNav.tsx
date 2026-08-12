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

  // Trang đổi (bấm Trước/Sau, hoặc nút back) thì ô nhập phải theo. Không có
  // dòng này thì ô nhập đóng băng ở số trang đầu tiên người dùng mở.
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

      if (e.key === "ArrowLeft" && prevHref) router.push(prevHref);
      if (e.key === "ArrowRight" && nextHref) router.push(nextHref);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevHref, nextHref, router]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Dùng ĐÚNG hàm parseBookPage mà route dùng, không viết lại luật kiểm tra
    // ở đây: hai bản cài đặt của cùng một luật sẽ trôi khỏi nhau.
    const dich = parseBookPage(value.trim());
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
        onChange={(e) => setValue(e.target.value)}
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
