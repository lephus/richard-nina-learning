"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VocabCard } from "@/lib/vocab/load-cards";
import { saveCursor } from "@/app/(app)/vocab/actions";
import { WordCard } from "./word-card";
import { WordIndex } from "./word-index";

// Debounce cho lần ghi con trỏ đọc — cùng khuôn với `DEBOUNCE_MS` của
// note-box.tsx, tách hằng số riêng vì khác module.
const CURSOR_SAVE_DEBOUNCE_MS = 500;

/**
 * Điều phối N thẻ từ. Toàn bộ dữ liệu đã nằm sẵn trong `cards` từ lần tải
 * trang duy nhất, nên MỌI thao tác ở đây — tới, lui, nhảy, phím mũi tên — là
 * đổi một số nguyên trong state. Không có lời gọi mạng nào CHẶN trên đường
 * bấm: con trỏ đọc được ghi ở nền, debounce 500ms (xem effect gần cuối tệp),
 * không `await` trước khi thẻ kế tiếp lên hình.
 *
 * Dùng chung cho pha học (30 thẻ, có nút "Làm bài") và xem lại (60 thẻ, không
 * có). Đây là ranh giới quan trọng nhất của lát: tách thành hai cây component
 * thì mọi sửa đổi thẻ từ về sau phải làm hai lần và sẽ lệch.
 */
export function Deck({
  cards,
  initialIndex,
  examAction,
  lessonId,
  initialHideWord,
}: {
  cards: VocabCard[];
  initialIndex: number;
  /** `null` ở chế độ xem lại — không có bài thi nào để làm. */
  examAction: (() => Promise<void>) | null;
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

  // Chỉ số ĐÃ GỬI THÀNH CÔNG lần gần nhất xuống server — khởi tạo bằng
  // `initialIndex` vì đó chính là giá trị `lesson_cursor` server đã đọc lúc
  // tải trang, nên nếu người học chưa đổi thẻ nào thì không có gì để gửi lại.
  const savedIndexRef = useRef(initialIndex);
  // Ref giữ CHỈ SỐ MỚI NHẤT: effect tháo bên dưới (deps rỗng) đóng băng biến
  // của lần render tạo ra nó, mà lúc tháo cần giá trị mới nhất — cùng lý do
  // đã ghi ở note-box.tsx.
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  async function flushCursor() {
    if (lessonId === null) return;
    if (indexRef.current === savedIndexRef.current) return;
    const sending = indexRef.current;
    try {
      await saveCursor(lessonId, sending);
      savedIndexRef.current = sending;
    } catch {
      // Nuốt lỗi ở đây là CÓ CHỦ ĐÍCH và là chỗ duy nhất trong lát này được
      // phép: mất một dấu trang không đáng để dựng lên một thông báo lỗi giữa
      // lúc học, và lần đổi thẻ kế tiếp (hoặc lần tháo component) sẽ ghi đè
      // lại đúng.
    }
  }

  // Ghi chỗ đang đọc Ở NỀN, debounce 500ms — cùng khuôn note-box.tsx dùng cho
  // ô ghi chú, đổi "gõ" thành "đổi thẻ". TRƯỚC bản vá này, effect chạy MỖI
  // LẦN `index` đổi, không hẹn giờ: giữ phím mũi tên lướt qua N thẻ liền bắn
  // N Server Action tuần tự (mỗi cái hai vòng mạng Supabase: getUser() rồi
  // upsert), có thể TỚI NƠI không theo thứ tự BẤM và ghi đè lẫn nhau — vào
  // lại có thể về thẻ 12 thay vì thẻ 20. Debounce chỉ còn gửi state SAU CÙNG
  // sau khi người học dừng 500ms, và mỗi lần đổi thẻ tiếp huỷ hẹn giờ cũ.
  useEffect(() => {
    if (lessonId === null) return;
    const t = setTimeout(() => void flushCursor(), CURSOR_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // `flushCursor` cố tình không nằm trong danh sách phụ thuộc: nó đọc mọi
    // thứ qua ref (và `lessonId` không đổi trong một lần sống của Deck) nên
    // không cần dựng lại hẹn giờ mỗi lần render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, index]);

  // Lưu nốt khi rời trang HẲN. Deck không remount giữa các thẻ (chỉ WordCard
  // remount qua `key={card.id}`) — Deck chỉ tháo khi điều hướng đi nơi khác.
  // Không có vế này thì lướt nhanh rồi bấm sang trang khác trước khi hẹn giờ
  // 500ms tới sẽ mất đúng vị trí cuối cùng — cùng lỗ hổng note-box.tsx từng
  // vá cho ô ghi chú.
  useEffect(() => {
    return () => {
      void flushCursor();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          {examAction && (
            <form action={examAction} className="flex-1">
              <button
                type="submit"
                data-testid="exam-button"
                className="w-full rounded bg-slate-900 px-4 py-2 text-center text-white"
              >
                LÀM BÀI
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
