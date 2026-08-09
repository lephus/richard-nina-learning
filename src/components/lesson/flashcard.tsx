"use client";

import { useEffect, useState } from "react";
import type { BuiltItem } from "@/lib/lesson/build-item";

export function Flashcard({
  word,
  onNext,
  pending,
}: {
  word: Extract<BuiltItem, { kind: "flashcard" }>["word"];
  onNext: () => void;
  pending: boolean;
}) {
  // Phát hiện sau khi mount, không phải ngay trong lần render đầu: render
  // đầu chạy trên server (window luôn undefined ở đó), nên tính thẳng
  // `"speechSynthesis" in window` trong thân component sẽ cho ra hai kết quả
  // khác nhau giữa HTML server gửi xuống và lần render đầu tiên trên trình
  // duyệt — lệch hydrate. Bắt đầu bằng false (giống server), rồi bật lên sau
  // khi effect chạy — chỉ trên client, sau khi hydrate đã khớp xong.
  const [canSpeak, setCanSpeak] = useState(false);
  useEffect(() => {
    setCanSpeak(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  function speak() {
    if (!canSpeak) return;
    const u = new SpeechSynthesisUtterance(word.word);
    u.lang = "en-US";
    window.speechSynthesis.speak(u);
  }

  return (
    <div className="rounded border border-slate-200 bg-white p-6">
      <div className="flex items-baseline gap-3">
        <span data-testid="flashcard-word" className="text-3xl font-semibold">
          {word.word}
        </span>
        <span className="text-slate-500">{word.ipa}</span>
        {canSpeak && (
          <button onClick={speak} className="text-sm underline" aria-label="Nghe phát âm">
            Nghe
          </button>
        )}
      </div>
      <p className="mt-3 text-lg">{word.meaningVi}</p>
      <p className="mt-1 text-slate-600">{word.definitionEn}</p>
      <p className="mt-3 text-sm text-slate-500">Đồng nghĩa: {word.synonyms.join(", ")}</p>
      {/* Câu ví dụ ĐẦY ĐỦ: buildItem đã điền lại đúng `blankAnswer` (đọc qua
          RPC blank_answers_for_lesson) vào chỗ "___" mà Phase 0 khoét sẵn cho
          câu điền từ — không phải `word`, nên câu luôn đúng nguyên gốc, kể cả
          khi blankAnswer là một dạng biến cách của word. Kèm bản dịch — thẻ
          gặp từ là nơi dạy. */}
      <p data-testid="flashcard-example" className="mt-3 italic text-slate-700">
        {word.exampleEn}
      </p>
      <p className="mt-1 text-sm text-slate-500">{word.exampleVi}</p>
      <button
        data-testid="next-button"
        onClick={onNext}
        disabled={pending}
        className="mt-5 rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Đang lưu…" : "Tiếp"}
      </button>
    </div>
  );
}
