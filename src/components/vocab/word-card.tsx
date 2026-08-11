"use client";

import { useEffect, useState } from "react";
import type { VocabCard } from "@/lib/vocab/load-cards";
import { NoteBox } from "./note-box";

export function WordCard({
  card,
  note,
  onNoteChange,
  hideWord,
  onToggleHideWord,
}: {
  card: VocabCard;
  note: string;
  onNoteChange: (next: string) => void;
  hideWord: boolean;
  onToggleHideWord: () => void;
}) {
  // Phát hiện sau khi mount, không phải trong lần render đầu: render đầu chạy
  // trên server (window luôn undefined ở đó), nên tính thẳng
  // `"speechSynthesis" in window` trong thân component cho ra hai kết quả khác
  // nhau giữa HTML server gửi xuống và lần render đầu trên trình duyệt — lệch
  // hydrate.
  const [canSpeak, setCanSpeak] = useState(false);
  useEffect(() => {
    setCanSpeak(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  function speak() {
    if (!canSpeak) return;
    const u = new SpeechSynthesisUtterance(card.word);
    u.lang = "en-US";
    window.speechSynthesis.speak(u);
  }

  return (
    <div className="rounded border border-slate-200 bg-white p-6">
      <div className="flex items-baseline gap-3">
        {hideWord ? (
          // Khối giữ chỗ rộng theo ĐỘ DÀI TỪ, không phải một chiều rộng cố
          // định: bật/tắt che không được làm cả thẻ nhảy, vì nút bật/tắt nằm
          // ngay trên cùng hàng và layout giật thì bấm trượt.
          <span
            data-testid="card-word-hidden"
            aria-label="Từ đang bị che"
            className="inline-block h-8 rounded bg-slate-200"
            style={{ width: `${Math.max(card.word.length, 4)}ch` }}
          />
        ) : (
          <span data-testid="card-word" className="text-3xl font-semibold">
            {card.word}
          </span>
        )}
        <span className="text-slate-500">{card.ipa}</span>
        {canSpeak && (
          <button onClick={speak} className="text-sm underline" aria-label="Nghe phát âm">
            Nghe
          </button>
        )}
        <button
          data-testid="toggle-hide-word"
          onClick={onToggleHideWord}
          aria-pressed={hideWord}
          className="ml-auto text-sm underline"
        >
          {hideWord ? "Hiện từ" : "Che từ"}
        </button>
      </div>

      {/* Đồng nghĩa nằm NGAY DƯỚI từ chính, trước cả nghĩa tiếng Việt: gặp từ
          mới thì nhớ theo CỤM từ cùng nghĩa, và các phương án nhiễu ở lát 2b
          cũng lấy từ chính nhóm này. 605/605 từ trong kho đều có ít nhất một
          đồng nghĩa nên không có nhánh rỗng để xử lý. */}
      <p className="mt-1 text-sm text-slate-500">Đồng nghĩa: {card.synonyms.join(", ")}</p>
      <p className="mt-3 text-lg">{card.meaningVi}</p>
      <p className="mt-1 text-slate-600">{card.definitionEn}</p>
      {/* Câu ví dụ tiếng Anh chứa chính từ đã điền vào — tức là chứa đáp án —
          nên phải bị che cùng lúc với từ chính. Che mỗi từ mà để câu ví dụ
          hiện thì nút này chỉ là trang trí, người học liếc xuống là thấy. */}
      {!hideWord && (
        <p data-testid="card-example" className="mt-3 italic text-slate-700">
          {card.exampleEn}
        </p>
      )}
      {/* Bản dịch tiếng Việt vẫn hiện dù có che: đó là gợi ý, không phải đáp án. */}
      <p className="mt-1 text-sm text-slate-500">{card.exampleVi}</p>
      <NoteBox wordId={card.id} body={note} onChange={onNoteChange} />
    </div>
  );
}
