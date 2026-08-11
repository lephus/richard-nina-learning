"use client";

import { useEffect, useState } from "react";
import type { VocabCard } from "@/lib/vocab/load-cards";

export function WordCard({ card }: { card: VocabCard }) {
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
        <span data-testid="card-word" className="text-3xl font-semibold">
          {card.word}
        </span>
        <span className="text-slate-500">{card.ipa}</span>
        {canSpeak && (
          <button onClick={speak} className="text-sm underline" aria-label="Nghe phát âm">
            Nghe
          </button>
        )}
      </div>

      {/* Đồng nghĩa nằm NGAY DƯỚI từ chính, trước cả nghĩa tiếng Việt: gặp từ
          mới thì nhớ theo CỤM từ cùng nghĩa, và các phương án nhiễu ở lát 2b
          cũng lấy từ chính nhóm này. 605/605 từ trong kho đều có ít nhất một
          đồng nghĩa nên không có nhánh rỗng để xử lý. */}
      <p className="mt-1 text-sm text-slate-500">Đồng nghĩa: {card.synonyms.join(", ")}</p>
      <p className="mt-3 text-lg">{card.meaningVi}</p>
      <p className="mt-1 text-slate-600">{card.definitionEn}</p>
      <p data-testid="card-example" className="mt-3 italic text-slate-700">
        {card.exampleEn}
      </p>
      <p className="mt-1 text-sm text-slate-500">{card.exampleVi}</p>
    </div>
  );
}
