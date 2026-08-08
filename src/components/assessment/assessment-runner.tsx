"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { answerAction, submitAction } from "@/app/(app)/assessment/[id]/actions";
import { Countdown } from "./countdown";

// Cửa sổ tối đa chờ round trip đang bay trước khi tự nộp KHÔNG ĐIỀU KIỆN khi
// hết giờ — xem effect "đường dự phòng" trong AssessmentRunner để biết lý do
// bắt buộc phải có cửa sổ này. Vài giây là đủ rộng để một round trip BÌNH
// THƯỜNG (một lượt answerAction, thường dưới 1 giây) luôn về trước khi cửa sổ
// đóng, nhưng đủ hẹp để một request bị TREO không giữ người học lại sau hạn
// giờ vô thời hạn.
const AUTO_SUBMIT_FALLBACK_MS = 5000;

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

  // Đồng hồ chạm 0 chỉ BẬT CỜ, không nộp thẳng — xem hai effect bên dưới. Nếu
  // `onExpire` gọi `submitAction` ngay lúc còn một `answerAction` đang bay
  // (round trip chưa xong), `finalize` chấm và điền câu đó thành sai TRƯỚC,
  // rồi lượt `answerItem` trả lời muộn ghi `is_correct = true` ĐÈ LÊN SAU khi
  // đã chấm xong — điểm đã lưu lệch với chính các dòng đã chấm, và bài bổ
  // túc (dựng từ `is_correct = false` của bài cha) thiếu hoặc thừa một câu.
  const [expired, setExpired] = useState(false);
  const autoSubmittedRef = useRef(false);
  const autoSubmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submitNow = useCallback(() => {
    startTransition(async () => {
      try {
        await submitAction(assessmentId);
        // Điểm và đạt/trượt PHẢI đọc lại từ server, không tự vẽ màn hình kết
        // quả từ giá trị trả về của action — page.tsx rẽ nhánh theo
        // `status !== "in_progress"` sau khi Next tải lại dữ liệu.
        router.refresh();
      } catch {
        setError("Không nộp được bài. Thử lại.");
      }
    });
  }, [assessmentId, router]);

  // Cổng DUY NHẤT dẫn tới `submitNow` cho đường tự nộp — cả đường nhanh lẫn
  // đường dự phòng bên dưới đều gọi qua đây, nên `autoSubmittedRef` đảm bảo
  // dù cái nào thắng, `submitAction` cũng chỉ thật sự chạy đúng một lần.
  const triggerAutoSubmit = useCallback(() => {
    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    if (autoSubmitTimerRef.current !== null) {
      clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }
    submitNow();
  }, [submitNow]);

  // Đường NHANH: hết giờ mà không còn round trip nào dở dang → nộp ngay,
  // không đợi cửa sổ dự phòng ở dưới. Chạy lại mỗi khi `pending` đổi, nên nếu
  // lúc hết giờ đúng lúc một answerAction đang bay, effect này tự thử lại
  // ngay khi round trip đó XONG (dù đúng ra hết hạn hay lỗi) — đây là trường
  // hợp thường gặp và effect nắm bắt được ngay, không cần chờ hết cửa sổ.
  useEffect(() => {
    if (expired && !pending) triggerAutoSubmit();
  }, [expired, pending, triggerAutoSubmit]);

  // Đường DỰ PHÒNG, bắt buộc phải có: một request KHÔNG BAO GIỜ resolve hay
  // reject (mất mạng giữa chừng, treo ở tầng hạ tầng) thì `pending` không bao
  // giờ về `false`, và đường nhanh ở trên không bao giờ chạy — người học kẹt
  // trên màn hình làm bài, sau hạn giờ, vô thời hạn: mọi nút (chọn đáp án,
  // trước/sau, bảng số câu, cả nút "Nộp bài") đều `disabled={pending}`, không
  // có lối thoát nào khác trong lúc dashboard (Task 7) chưa nối tới
  // `closeExpired`. Hẹn giờ CỐ ĐỊNH ngay khi `expired` bật: hết
  // `AUTO_SUBMIT_FALLBACK_MS` là tự nộp bất kể `pending` đang là gì —
  // `triggerAutoSubmit` không đọc `pending` nữa nên nhánh này thật sự VÔ
  // ĐIỀU KIỆN.
  useEffect(() => {
    if (!expired) return;
    const t = setTimeout(triggerAutoSubmit, AUTO_SUBMIT_FALLBACK_MS);
    autoSubmitTimerRef.current = t;
    return () => {
      clearTimeout(t);
      if (autoSubmitTimerRef.current === t) autoSubmitTimerRef.current = null;
    };
  }, [expired, triggerAutoSubmit]);

  const current = items[index];
  const answeredCount = Object.keys(answers).length;

  // Chặn hai lần trả lời chồng nhau lên CÙNG một câu (finding 3, review Task
  // 6) — dùng REF chứ không phải `pending`: `pending` (useTransition) và
  // `disabled={pending}` trên các nút đều đọc CÙNG một giá trị của CÙNG một
  // lần render, nên nếu hai sự kiện bấm lọt vào trước khi React kịp render
  // lại (chưa có lần render nào chen giữa), CẢ HAI đều còn thấy `pending =
  // false` — kiểm `if (pending) return` không chặn được gì mà `disabled`
  // chưa chặn sẵn (đã bị vạch ra ở review Task 6: hai thứ đó thừa lẫn nhau,
  // không thứ nào bảo vệ được thứ kia). Gán `.current` là một phép gán JS
  // THUẦN, có hiệu lực NGAY LẬP TỨC, không đợi qua bất kỳ chu kỳ render nào —
  // nên dù lần bấm thứ hai xảy ra trong CÙNG một tick với lần thứ nhất, nó
  // vẫn thấy đúng giá trị vừa được gán.
  const submittingRef = useRef(false);

  /** Điều hướng (nút trước/sau, bảng số câu). Chỉ đọc `pending` — CÙNG giá
   * trị với `disabled={pending}` trên các nút gọi hàm này, nên đây không phải
   * một lớp bảo vệ độc lập, chỉ là gương của thuộc tính `disabled` (không
   * hại gì khi giữ, nhưng đừng tưởng nó chặn được gì mà `disabled` chưa chặn
   * sẵn). Bảo vệ THẬT cho hệ quả của việc điều hướng lúc còn dở dang nằm ở
   * chỗ khác: `submittingRef` phía trên chặn `pick` bị gọi chồng lên chính
   * nó, còn việc `setIndex` trong `pick` là TUYỆT ĐỐI theo `answeringIndex`
   * đã chụp (bên dưới) khiến việc `goTo` có lọt qua trong lúc pick đang bay
   * hay không cũng không còn quan trọng — câu đang trả lời không bao giờ bị
   * nhảy cóc qua. */
  function goTo(i: number) {
    if (pending) return;
    setIndex(Math.max(0, Math.min(total - 1, i)));
  }

  function pick(answer: string) {
    if (!current || submittingRef.current) return;
    submittingRef.current = true;
    setError(null);

    // Chụp lại NGAY câu đang trả lời — không đọc `index`/`current` bên trong
    // callback bất đồng bộ bên dưới, vì tới lúc round trip xong người học có
    // thể đã tự điều hướng sang câu khác.
    const answeringIndex = index;
    const answeringPosition = current.position;

    startTransition(async () => {
      try {
        const r = await answerAction(assessmentId, answeringPosition, answer);
        if (!r.ok) {
          setError("Không ghi được câu trả lời — có thể bài đã hết hạn hoặc đã nộp.");
          return;
        }
        setAnswers((a) => ({ ...a, [answeringPosition]: answer }));
        // Chỉ tự động sang câu KẾ TIẾP nếu người học VẪN đứng ở đúng câu vừa
        // trả lời. Nếu trong lúc chờ họ đã tự điều hướng sang câu khác, `index`
        // hiện tại không còn là `answeringIndex` nữa — đẩy tiếp từ vị trí MỚI
        // đó sẽ nhảy cóc qua đúng câu họ đang xem, để nó mãi mãi trống.
        setIndex((i) => (i === answeringIndex ? Math.min(total - 1, i + 1) : i));
      } catch {
        setError("Không gửi được câu trả lời. Thử lại.");
      } finally {
        submittingRef.current = false;
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
        {hardLocked && <Countdown expiresAt={expiresAt} onExpire={() => setExpired(true)} />}
      </div>

      <div className="flex flex-col gap-3">
        <p data-testid="assessment-prompt" className="text-lg">
          {current.payload.prompt}
        </p>
        <div className="flex flex-col gap-2">
          {/* Cùng dạng nút với `choice-option` ở 1b (choice-question.tsx):
              khoá theo VỊ TRÍ trong mảng options của CÂU HIỆN TẠI. Component
              này KHÔNG remount giữa các câu (không có key theo vị trí câu ở
              đây, khác LessonRunner ở 1b) — nhưng vẫn an toàn vì sang câu
              khác thì `current.payload.options` đổi hẳn thành một mảng khác,
              nên khoá theo chỉ số trong mảng đó không bao giờ lẫn giữa hai
              câu khác nhau. */}
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
          onClick={() => goTo(index - 1)}
          disabled={index === 0 || pending}
          className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
        >
          Câu trước
        </button>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          disabled={index === total - 1 || pending}
          className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
        >
          Câu sau
        </button>
      </div>

      {/* Bảng số câu: câu nào đã làm/chưa làm, và bấm để nhảy thẳng tới đó.
          Bắt buộc phải có — nút nộp phía dưới LUÔN bật (câu chưa làm tính
          sai chứ không chặn nộp), nên với một bài 60 câu, không có bảng này
          thì cách duy nhất để biết còn câu nào bỏ trống là bấm "Câu sau" đủ
          60 lần. */}
      <div className="flex flex-wrap gap-1 border-t border-slate-200 pt-3">
        {items.map((it, i) => {
          const answered = answers[it.position] !== undefined;
          const isCurrent = i === index;
          const base = "flex h-8 w-8 items-center justify-center rounded border text-xs";
          const tone = isCurrent
            ? "border-slate-900 bg-slate-900 text-white"
            : answered
              ? "border-emerald-400 bg-emerald-50 text-emerald-700"
              : "border-slate-300 bg-white text-slate-500";
          return (
            <button
              key={it.position}
              type="button"
              onClick={() => goTo(i)}
              disabled={pending}
              aria-current={isCurrent ? "true" : undefined}
              aria-label={`Câu ${i + 1}${answered ? ", đã làm" : ", chưa làm"}`}
              className={`${base} ${tone} disabled:opacity-60`}
            >
              {i + 1}
            </button>
          );
        })}
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
