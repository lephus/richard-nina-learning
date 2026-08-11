"use client";

import { useState } from "react";
import type { VocabCard } from "@/lib/vocab/load-cards";

/**
 * Mục lục nhảy nhanh. MỘT component, hai hình dạng:
 *  - từ 1024px (lg) trở lên: cột cố định bên trái, luôn thấy.
 *  - hẹp hơn: nút ☰ mở một ngăn trượt phủ lên thẻ.
 *
 * Không tách thành hai component: hai bản sẽ lệch nhau ngay lần đầu ai đó
 * thêm một cột thông tin vào danh sách.
 *
 * Danh sách hiện TỪ chứ không chỉ số thứ tự: người học quay lại "cái từ về
 * CV", không phải "từ số 7".
 */
export function WordIndex({
  cards,
  current,
  onPick,
}: {
  cards: VocabCard[];
  current: number;
  onPick: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);

  const list = (
    <ol data-testid="word-index" className="flex flex-col gap-0.5">
      {cards.map((c, i) => (
        <li key={c.id}>
          <button
            data-testid="index-item"
            data-i={i}
            aria-current={i === current ? "true" : undefined}
            onClick={() => {
              onPick(i);
              setOpen(false);
            }}
            className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs ${
              i === current ? "bg-slate-200 font-semibold" : "hover:bg-slate-100"
            }`}
          >
            <span className="w-5 shrink-0 text-slate-400">{i + 1}</span>
            <span className="flex-1 truncate">{c.word}</span>
            {/* Dấu ✎ cho biết từ nào mình đã ghi chú — thứ duy nhất phân biệt
                được các từ khi lướt lại một danh sách 60 dòng. */}
            {c.note.trim() !== "" && (
              <span aria-label="đã có ghi chú" className="text-slate-400">✎</span>
            )}
          </button>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <button
        data-testid="index-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="self-start rounded border border-slate-300 px-3 py-1 text-sm lg:hidden"
      >
        ☰ Mục lục
      </button>

      {/* Bản cột cố định — chỉ tồn tại từ lg trở lên. */}
      <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-slate-200 pr-3 lg:block">
        {list}
      </aside>

      {/* Bản ngăn trượt — chỉ dưới lg, và chỉ khi đang mở. */}
      {open && (
        <div className="fixed inset-0 z-10 flex lg:hidden">
          <div className="w-64 overflow-y-auto bg-white p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
              <span>{cards.length} từ</span>
              <button onClick={() => setOpen(false)} aria-label="Đóng mục lục">✕</button>
            </div>
            {list}
          </div>
          <button
            aria-label="Đóng mục lục"
            onClick={() => setOpen(false)}
            className="flex-1 bg-black/25"
          />
        </div>
      )}
    </>
  );
}
