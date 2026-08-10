"use client";

import { useEffect, useState } from "react";
import type { BuiltItem } from "@/lib/lesson/build-item";

export function Flashcard({
  word,
  onNext,
  pending,
  hideWord,
  onToggleHideWord,
}: {
  word: Extract<BuiltItem, { kind: "flashcard" }>["word"];
  onNext: () => void;
  pending: boolean;
  /** Che từ tiếng Anh để buộc nhớ. Trạng thái nằm ở LessonRunner chứ không ở
      đây: thẻ này remount theo `key={position}` mỗi lần sang từ mới, giữ ở đây
      thì bật "che" xong qua từ sau là mất. */
  hideWord: boolean;
  onToggleHideWord: () => void;
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

  // Chữ người học gõ lại. Không chấm, không gửi đi đâu, và cố ý KHÔNG được
  // giữ: thẻ remount theo `key={position}` nên sang từ mới là ô rỗng trở lại.
  const [typed, setTyped] = useState("");

  function speak() {
    if (!canSpeak) return;
    const u = new SpeechSynthesisUtterance(word.word);
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
            data-testid="flashcard-word-hidden"
            aria-label="Từ đang bị che"
            className="inline-block h-8 rounded bg-slate-200"
            style={{ width: `${Math.max(word.word.length, 4)}ch` }}
          />
        ) : (
          <span data-testid="flashcard-word" className="text-3xl font-semibold">
            {word.word}
          </span>
        )}
        <span className="text-slate-500">{word.ipa}</span>
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
      {/* Đồng nghĩa nằm NGAY DƯỚI từ chính, trước cả nghĩa tiếng Việt: người
          học gặp từ mới thì nhớ nó theo CỤM từ cùng nghĩa, và các phương án
          nhiễu trong bài luyện tập cũng lấy từ chính nhóm này (pickDistractors)
          — đặt xa từ chính thì lúc làm bài phải nhớ lại một thứ đã đọc lướt
          qua ở cuối thẻ.
          605/605 từ trong kho đều có ít nhất một đồng nghĩa (nhiều nhất 3), nên
          không có nhánh rỗng để xử lý — nếu kho đổi thì corpus test sẽ đỏ trước
          khi người học thấy một dòng "Đồng nghĩa:" cụt. */}
      <p className="mt-1 text-sm text-slate-500">Đồng nghĩa: {word.synonyms.join(", ")}</p>
      <p className="mt-3 text-lg">{word.meaningVi}</p>
      <p className="mt-1 text-slate-600">{word.definitionEn}</p>
      {/* Câu ví dụ ĐẦY ĐỦ: buildItem đã điền lại đúng `blankAnswer` (đọc qua
          RPC blank_answers_for_lesson) vào chỗ "___" mà Phase 0 khoét sẵn cho
          câu điền từ — không phải `word`, nên câu luôn đúng nguyên gốc, kể cả
          khi blankAnswer là một dạng biến cách của word. Kèm bản dịch — thẻ
          gặp từ là nơi dạy. */}
      {/* Câu ví dụ tiếng Anh CŨNG bị che khi bật che từ — nó chứa chính
          `blankAnswer` đã điền vào, tức là chứa đáp án. Che mỗi từ chính mà để
          câu ví dụ hiện thì nút "Che từ" chỉ là trang trí. Bản dịch tiếng Việt
          vẫn hiện: đó là gợi ý, không phải đáp án. */}
      {!hideWord && (
        <p data-testid="flashcard-example" className="mt-3 italic text-slate-700">
          {word.exampleEn}
        </p>
      )}
      <p className="mt-1 text-sm text-slate-500">{word.exampleVi}</p>

      <div className="mt-5">
        <label htmlFor="flashcard-typing" className="block text-sm font-medium text-slate-700">
          Gõ lại từ
        </label>
        <input
          id="flashcard-typing"
          data-testid="flashcard-typing"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          // Người học gõ tiếng Việt bằng Telex/VNI. `lang="en"` để bàn phím ảo
          // trên điện thoại chuyển sang bố cục tiếng Anh, và tắt autocorrect để
          // trình duyệt không tự "sửa" từ tiếng Anh thành một từ khác. Bộ gõ
          // của hệ điều hành thì web không tắt được — giới hạn đã biết.
          lang="en"
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
      </div>

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
