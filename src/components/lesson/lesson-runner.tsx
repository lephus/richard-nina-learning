"use client";

import { useState, useTransition } from "react";
import { submitAnswer, type SubmitResult } from "@/app/(app)/learn/[lessonId]/actions";
import type { BuiltItem } from "@/lib/lesson/build-item";
import { TOTAL_ITEMS } from "@/lib/lesson/item-plan";
import { Flashcard } from "./flashcard";
import { ChoiceQuestion } from "./choice-question";
import { FillBlank } from "./fill-blank";
import { LessonDone } from "./lesson-done";

export function LessonRunner({
  lessonId,
  ordinal,
  initialPosition,
  initialItem,
  initialDone,
  initialScore,
}: {
  lessonId: number;
  /** Số thứ tự buổi (1..20) — LessonDone dùng để suy slot kế tiếp mở khoá. */
  ordinal: number;
  initialPosition: number;
  initialItem: BuiltItem | null;
  initialDone: boolean;
  initialScore?: number;
}) {
  const [position, setPosition] = useState(initialPosition);
  const [item, setItem] = useState(initialItem);
  const [done, setDone] = useState(initialDone);
  const [score, setScore] = useState(initialScore);
  const [feedback, setFeedback] = useState<{ correct: boolean; correctAnswer: string } | null>(null);
  /** Kết quả đã nhận nhưng chưa áp, đang chờ người học bấm "Tiếp". */
  const [staged, setStaged] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Áp một kết quả ngay lập tức, không qua bước phản hồi. */
  function apply(r: SubmitResult) {
    setPosition(r.position);
    setItem(r.item);
    setDone(r.done);
    setScore(r.score);
    setFeedback(null);
    setStaged(null);
  }

  function send(answer: string) {
    setError(null);
    startTransition(async () => {
      try {
        const r: SubmitResult = await submitAnswer(lessonId, position, answer);

        // Gửi trùng — server đã bỏ qua. Đồng bộ lại theo trạng thái thật thay
        // vì lờ đi: client KHÔNG được tự cho là mình đã đúng vị trí.
        if (!r.ok) {
          apply(r);
          return;
        }

        // Thẻ gặp từ: không chấm nên không có phản hồi, đi thẳng.
        if (r.correct === undefined) {
          apply(r);
          return;
        }

        // Câu có chấm: hiện phản hồi trước, giữ kết quả lại tới khi bấm "Tiếp".
        setFeedback({ correct: r.correct, correctAnswer: r.correctAnswer! });
        setStaged(r);
      } catch {
        setError("Không gửi được câu trả lời. Thử lại.");
      }
    });
  }

  function goNext() {
    if (staged) apply(staged);
  }

  if (done) return <LessonDone score={score ?? 0} ordinal={ordinal} />;
  if (!item) return null;

  return (
    <div className="flex flex-col gap-4">
      <p data-testid="lesson-progress" className="text-sm text-slate-500">
        {position + 1} / {TOTAL_ITEMS}
      </p>

      {item.kind === "flashcard" && (
        <Flashcard key={position} word={item.word} onNext={() => send("")} pending={pending} />
      )}
      {(item.kind === "meaning" || item.kind === "synonym" || item.kind === "grammar") && (
        <ChoiceQuestion
          key={position}
          item={item}
          disabled={pending || feedback !== null}
          onPick={send}
        />
      )}
      {item.kind === "fill" && (
        <FillBlank key={position} item={item} disabled={pending || feedback !== null} onSubmit={send} />
      )}

      {feedback && (
        <div
          data-testid="answer-feedback"
          data-correct={String(feedback.correct)}
          // Thông điệp quan trọng nhất app phát ra. Khối này xuất hiện sau
          // khi trang đã tải, nên trình đọc màn hình không tự đọc — không có
          // aria-live thì người dùng screen reader không bao giờ biết mình
          // đúng hay sai. "polite": chờ đọc xong câu đang đọc rồi mới xen vào.
          aria-live="polite"
          className={feedback.correct ? "text-green-700" : "text-red-700"}
        >
          {feedback.correct ? "Chính xác." : `Chưa đúng. Đáp án: ${feedback.correctAnswer}`}
          <button
            data-testid="next-button"
            onClick={goNext}
            className="ml-4 rounded bg-slate-900 px-3 py-1 text-white"
          >
            Tiếp
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
