"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { answerAction, submitAction } from "@/app/(app)/assessment/[id]/actions";
import { Countdown } from "./countdown";

/** Một câu như đã đóng băng trong `assessment_items` — xem `run.ts`. */
export interface AssessmentRunnerItem {
  position: number;
  item_type: "vocab" | "grammar";
  payload: { prompt: string; options: string[] };
  user_answer: string | null;
}

export function AssessmentRunner({
  assessmentId,
  items,
  expiresAt,
  hardLocked,
}: {
  assessmentId: number;
  items: AssessmentRunnerItem[];
  /** Chỉ để HIỂN THỊ (đồng hồ) — xem countdown.tsx. */
  expiresAt: string;
  /** true ⟺ bài kiểm tra: có đồng hồ và hết giờ trên màn hình thì tự nộp. */
  hardLocked: boolean;
}) {
  const total = items.length;

  // Vào bài (hoặc tải lại trang giữa chừng) thì đứng ở câu ĐẦU TIÊN CHƯA LÀM,
  // không phải câu 1 — không thì mỗi lần F5 người học bị đẩy về đầu dù đã trả
  // lời được nửa bài. Đã làm hết thì đứng ở câu cuối, chờ bấm nộp.
  const firstUnanswered = items.findIndex((it) => it.user_answer === null);
  const [index, setIndex] = useState(firstUnanswered === -1 ? Math.max(0, total - 1) : firstUnanswered);

  // Đáp án đã chọn, khoá theo `position` — khởi tạo từ những gì database đã
  // có sẵn, để tải lại trang giữa chừng không làm mất lựa chọn cũ.
  const [answers, setAnswers] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    for (const it of items) if (it.user_answer !== null) map[it.position] = it.user_answer;
    return map;
  });

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  // Chặn tự nộp hai lần khi hết giờ — lớp chặn THỨ HAI, đặt ngay tại nơi thật
  // sự gọi submitAction, độc lập với ref bên trong Countdown (xem
  // countdown.tsx). React 19 StrictMode ở dev chạy lại effect nên chỉ tin vào
  // state là không đủ.
  const autoSubmittedRef = useRef(false);

  const current = items[index];
  const answeredCount = Object.keys(answers).length;

  function submitNow() {
    startTransition(async () => {
      try {
        await submitAction(assessmentId);
        // Điểm và đạt/trượt PHẢI đọc lại từ server, không tự vẽ màn hình kết
        // quả từ giá trị trả về của action — page.tsx rẽ nhánh theo
        // `status === "submitted"` sau khi Next tải lại dữ liệu.
        router.refresh();
      } catch {
        setError("Không nộp được bài. Thử lại.");
      }
    });
  }

  function autoSubmit() {
    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    submitNow();
  }

  function pick(answer: string) {
    if (!current) return;
    setError(null);
    startTransition(async () => {
      try {
        const r = await answerAction(assessmentId, current.position, answer);
        if (!r.ok) {
          setError("Không ghi được câu trả lời — có thể bài đã hết hạn hoặc đã nộp.");
          return;
        }
        // KHÔNG đọc `r.correct`: đây là bài đánh giá, không phải bài luyện —
        // hiện đúng/sai ngay lúc làm là lộ đáp án (spec mục 6).
        setAnswers((a) => ({ ...a, [current.position]: answer }));
        setIndex((i) => Math.min(total - 1, i + 1));
      } catch {
        setError("Không gửi được câu trả lời. Thử lại.");
      }
    });
  }

  if (!current) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p data-testid="assessment-progress" className="text-sm text-slate-500">
          {index + 1} / {total}
        </p>
        {/* Đồng hồ chỉ xuất hiện ở bài kiểm tra — ôn tập/bổ túc có
            `expires_at` trong database nhưng không hiện đồng hồ và không tự
            nộp (spec giao diện, mục "countdown"). */}
        {hardLocked && <Countdown expiresAt={expiresAt} onExpire={autoSubmit} />}
      </div>

      <div className="flex flex-col gap-3">
        <p data-testid="assessment-prompt" className="text-lg">
          {current.payload.prompt}
        </p>
        <div className="flex flex-col gap-2">
          {/* Cùng dạng nút với `choice-option` ở 1b (choice-question.tsx):
              khoá theo VỊ TRÍ, tĩnh trong suốt vòng đời — mỗi câu là một
              component mới nhờ key={position} bên dưới. */}
          {current.payload.options.map((o, i) => (
            <button
              key={`${i}-${o}`}
              data-testid="choice-option"
              disabled={pending}
              onClick={() => pick(o)}
              className={
                answers[current.position] === o
                  ? "rounded border-2 border-slate-900 bg-white px-4 py-2 text-left disabled:opacity-60"
                  : "rounded border border-slate-300 bg-white px-4 py-2 text-left disabled:opacity-60"
              }
            >
              {o}
            </button>
          ))}
        </div>
        {answers[current.position] !== undefined && (
          <p className="text-xs text-slate-500">Đã trả lời câu này — chọn lại để đổi đáp án.</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
        >
          Câu trước
        </button>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
          disabled={index === total - 1}
          className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
        >
          Câu sau
        </button>
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-200 pt-4">
        {/* Luôn bật, không khoá tới khi làm hết: một bài kiểm tra 60 câu tính
            giờ mà nút nộp chết cứng tới câu 60 sẽ kẹt cứng người hết giờ giữa
            chừng. Server đã tự điền câu bỏ trống thành sai lúc chấm (finalize
            trong run.ts) nên hai đường đi luôn khớp nhau. */}
        <p className="text-xs text-slate-500">
          Đã trả lời {answeredCount}/{total} — câu chưa làm tính sai.
        </p>
        <button
          data-testid="submit-button"
          type="button"
          onClick={submitNow}
          disabled={pending}
          className="self-start rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
        >
          Nộp bài
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
