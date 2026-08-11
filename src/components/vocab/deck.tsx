"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { VocabCard } from "@/lib/vocab/load-cards";
import { saveCursor } from "@/app/(app)/vocab/actions";
import { WordCard } from "./word-card";
import { WordIndex } from "./word-index";

/**
 * Điều phối N thẻ từ. Toàn bộ dữ liệu đã nằm sẵn trong `cards` từ lần tải
 * trang duy nhất, nên MỌI thao tác ở đây — tới, lui, nhảy, phím mũi tên — là
 * đổi một số nguyên trong state. Không có lời gọi mạng nào trên đường bấm.
 *
 * Dùng chung cho pha học (30 thẻ, có nút "Làm bài") và xem lại (60 thẻ, không
 * có). Đây là ranh giới quan trọng nhất của lát: tách thành hai cây component
 * thì mọi sửa đổi thẻ từ về sau phải làm hai lần và sẽ lệch.
 */
export function Deck({
  cards,
  initialIndex,
  examHref,
  lessonId,
  initialHideWord,
}: {
  cards: VocabCard[];
  initialIndex: number;
  /** `null` ở chế độ xem lại — không có bài thi nào để làm. */
  examHref: string | null;
  /** `null` ở chế độ xem lại: 60 từ của một nhóm không thuộc buổi nào để đánh dấu. */
  lessonId: number | null;
  /** Đọc từ cookie ở Server Component. Phải đến từ server chứ không phải
      localStorage: trình duyệt vẽ HTML của server TRƯỚC khi React hydrate, nên
      quyết định che ở phía client là quyết định muộn hơn một khung hình — và
      khung hình đó chính là lúc từ cần che loé lên. */
  initialHideWord: boolean;
}) {
  const [index, setIndex] = useState(
    // Con trỏ lưu ở server có thể trỏ ra ngoài mảng nếu nội dung buổi đổi.
    // Kẹp lại ở đây thay vì render một thẻ `undefined`.
    Math.min(Math.max(initialIndex, 0), Math.max(cards.length - 1, 0)),
  );

  // Công tắc cho CẢ BUỔI, không phải cho từng thẻ: 30 thẻ mà bấm che 30 lần
  // thì không ai dùng. Đặt ở Deck vì nó không remount giữa các thẻ, còn
  // WordCard thì có (`key={card.id}`).
  const [hideWord, setHideWord] = useState(initialHideWord);

  function toggleHideWord() {
    setHideWord((prev) => {
      const next = !prev;
      // Cookie chứ không localStorage, để lần tải trang sau server đã biết mà
      // render đúng ngay từ HTML đầu tiên. `SameSite=Lax` là đủ: đây chỉ là
      // tuỳ chọn hiển thị, không mang gì nhạy cảm.
      document.cookie = `vocab_hide_word=${next ? "1" : "0"}; path=/; max-age=31536000; SameSite=Lax`;
      return next;
    });
  }

  // Khởi tạo từ bản server gửi xuống, rồi từ đó CHỮ SỐNG Ở ĐÂY. `cards` không
  // bao giờ được đọc lại để lấy ghi chú sau lần khởi tạo này — nó là ảnh chụp
  // lúc mở trang, còn người học thì đang gõ.
  const [notes, setNotes] = useState<Record<number, string>>(() =>
    Object.fromEntries(cards.map((c) => [c.id, c.note])),
  );

  const go = useCallback(
    (next: number) => {
      setIndex((cur) => {
        const clamped = Math.min(Math.max(next, 0), cards.length - 1);
        return clamped === cur ? cur : clamped;
      });
    },
    [cards.length],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Không cướp phím mũi tên khi người học đang gõ trong ô ghi chú.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) return;
      if (e.key === "ArrowLeft") go(index - 1);
      if (e.key === "ArrowRight") go(index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  // Ghi chỗ đang đọc Ở NỀN. Không `await` trên đường bấm — đổi thẻ phải xong
  // trong một khung hình, còn việc ghi thì tới lúc nào cũng được.
  //
  // Nuốt lỗi ở đây là CÓ CHỦ ĐÍCH và là chỗ duy nhất trong lát này được phép:
  // mất một dấu trang không đáng để dựng lên một thông báo lỗi giữa lúc học,
  // và lần đổi thẻ kế tiếp sẽ ghi đè lại đúng.
  useEffect(() => {
    if (lessonId === null) return;
    void saveCursor(lessonId, index).catch(() => {});
  }, [lessonId, index]);

  const card = cards[index];
  if (!card) return null;

  return (
    <div className="flex gap-4">
      <WordIndex cards={cards} notes={notes} current={index} onPick={go} />

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <p data-testid="deck-position" className="text-sm text-slate-500">
          Từ {index + 1} / {cards.length}
        </p>

        <WordCard
          key={card.id}
          card={card}
          note={notes[card.id] ?? ""}
          onNoteChange={(next) => setNotes((n) => ({ ...n, [card.id]: next }))}
          hideWord={hideWord}
          onToggleHideWord={toggleHideWord}
        />

        <div className="flex gap-2">
          <button
            data-testid="prev-button"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            className="flex-1 rounded border border-slate-300 px-4 py-2 disabled:opacity-40"
          >
            ← Từ trước
          </button>
          <button
            data-testid="next-button"
            onClick={() => go(index + 1)}
            disabled={index === cards.length - 1}
            className="flex-1 rounded border border-slate-300 px-4 py-2 disabled:opacity-40"
          >
            Từ sau →
          </button>
          {examHref && (
            <Link
              href={examHref}
              data-testid="exam-button"
              className="flex-1 rounded bg-slate-900 px-4 py-2 text-center text-white"
            >
              LÀM BÀI
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
