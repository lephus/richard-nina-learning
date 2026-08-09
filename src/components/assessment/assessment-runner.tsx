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

// Hạn cho CHÍNH `fetch()` của đường tự nộp (`submitViaRawFetch`) — không có
// hạn này thì việc bỏ qua hàng đợi hành động của Next (xem JSDoc
// `submitViaRawFetch`) chỉ dời lỗ hổng xuống một tầng, không đóng nó: nếu
// route thô CŨNG bị treo (mất mạng thật giữa chừng, không phải kẹt hàng đợi —
// ví dụ Wi-Fi captive portal mở được socket nhưng không bao giờ trả lời),
// `await fetch(...)` không có hạn sẽ đứng chờ VÔ THỜI HẠN, `catch` không bao
// giờ chạy (treo không phải là reject), và `window.location.reload()` không
// bao giờ tới lượt — đúng lỗi gốc, chỉ chuyển từ Server Action sang route
// thô. Biến "treo" thành "reject sau N mili giây" bằng `AbortController` +
// `setTimeout` (KHÔNG dùng `AbortSignal.timeout` — review round 3, finding 4:
// đó là API mới hơn, Safari < 15.4/Chrome < 103/Firefox < 100 ném `TypeError`
// NGAY LÚC GỌI `fetch`, tức những trình duyệt đó không gửi được request nộp
// bài nào cả — `AbortController` tự tay tương đương về hành vi nhưng được hỗ
// trợ rộng hơn nhiều), nên nhánh `catch` (và do đó `reload()`) LUÔN chạy.
const RAW_FETCH_TIMEOUT_MS = 8000;

// Số lần TỐI ĐA đường tự động (nhanh hoặc dự phòng) được tự tải lại trang để
// thử nộp lại — review round 4, finding 1 (Important), ĐÚNG LÀ MỘT HỒI QUY DO
// VÒNG SỬA TRƯỚC GÂY RA, không phải một rủi ro có sẵn từ trước: bản round 3
// (bỏ Server Action khỏi mọi đường tự động) khiến `submitViaRawFetch` LUÔN
// `window.location.reload()` bất kể request có thành công hay không, và một
// trang MOUNT LẠI thì mọi cờ chặn (`autoSubmittedRef`) đều mới tinh — nếu
// nguyên nhân thất bại không tự khỏi (route hỏng thật, không phải "mạng tạm
// trục trặc"), trang tải lại mỗi ~1 giây MÃI MÃI, không một dòng lỗi nào hiện
// ra, và không có cách nào dừng lại ngoài nút back của trình duyệt (không ai
// gợi ý người học điều đó). Số lần thử phải có TRẦN, và trần đó phải SỐNG SÓT
// qua reload — bộ nhớ trong React (`useRef`/`useState`) bị xoá sạch mỗi lần
// tải lại, nên đếm bằng `sessionStorage` (mất theo tab, không mất theo lần
// tải lại — đúng cái cần).
const AUTO_SUBMIT_MAX_ATTEMPTS = 3;

// Lỗi tiếng Việt hiện ra khi đã thử đủ số lần cho phép mà vẫn không nộp
// được — điểm DỪNG bắt buộc phải có (xem `AUTO_SUBMIT_MAX_ATTEMPTS`).
const AUTO_SUBMIT_GIVE_UP_MESSAGE =
  'Không thể tự động nộp bài sau nhiều lần thử. Bấm "Nộp bài" để thử lại, hoặc kiểm tra kết nối mạng.';

/** Khoá `sessionStorage` đếm số lần đã tự thử nộp — riêng theo từng bài, để hai bài khác nhau không lẫn bộ đếm. */
function autoSubmitAttemptsKey(assessmentId: number): string {
  return `assessment-${assessmentId}-auto-submit-attempts`;
}

function readAutoSubmitAttempts(assessmentId: number): number {
  try {
    const raw = window.sessionStorage.getItem(autoSubmitAttemptsKey(assessmentId));
    const n = raw === null ? 0 : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    // `sessionStorage` không khả dụng (chế độ riêng tư của một số trình
    // duyệt cũ, hoặc bị chặn bởi cấu hình trình duyệt) — coi như luôn là lượt
    // đầu. Không có bộ đếm bền qua reload thì không chặn được vòng lặp, NHƯNG
    // không vì lý do KHÔNG LIÊN QUAN này mà chặn luôn việc nộp bài.
    return 0;
  }
}

function writeAutoSubmitAttempts(assessmentId: number, n: number): void {
  try {
    window.sessionStorage.setItem(autoSubmitAttemptsKey(assessmentId), String(n));
  } catch {
    // Bỏ qua — cùng lý do ở trên.
  }
}

function clearAutoSubmitAttempts(assessmentId: number): void {
  try {
    window.sessionStorage.removeItem(autoSubmitAttemptsKey(assessmentId));
  } catch {
    // Bỏ qua — dọn dẹp không thành thì để lại một khoá thừa, vô hại (bài đã
    // nộp xong, `assessmentId` này không mount lại `AssessmentRunner` nữa).
  }
}

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

  // Dùng cho ĐÚNG MỘT nơi: nút "Nộp bài" bấm tay. KHÔNG dùng cho bất kỳ đường
  // TỰ ĐỘNG nộp nào (xem lý do ở `submitViaRawFetch`/residual finding dưới
  // đây) — một người học bấm được nút nghĩa là trang đang hoạt động bình
  // thường, JS đã chạy, không có gì để "bỏ qua hàng đợi" ở đây.
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

  // Cách nộp bài dùng cho MỌI đường TỰ ĐỘNG (nhanh lẫn dự phòng — xem hai
  // effect bên dưới), KHÔNG dùng `submitAction` — xem JSDoc đầy đủ tại route
  // `/api/assessment/[id]/submit`. Tóm tắt: mọi Server Action (kể cả
  // `submitAction`, kể cả `router.refresh()`) đi qua CHUNG một hàng đợi hành
  // động duy nhất của App Router (next/dist/client/app-call-server.js →
  // app-router-instance.js). Nếu `answerAction` trước đó đang TREO, nó chiếm
  // vĩnh viễn hàng đợi, và gọi lại `submitAction` qua đúng cơ chế đó sẽ chỉ
  // bị xếp hàng — không bao giờ thật sự bắn request. `fetch()` thẳng tới
  // route xử lý thô không đi qua hàng đợi đó; `window.location.reload()`
  // (thay vì `router.refresh()`) cũng không đi qua bất kỳ hàng đợi JS nào của
  // Next — cả hai đều miễn nhiễm với một Server Action khác đang treo phía
  // trước, và reload còn dựng lại toàn bộ state React từ đầu nên người học
  // không kẹt lại màn hình khoá cứng dù request nộp bài này có thành công
  // hay không.
  //
  // Phát hiện được CHỈ khi chạy qua trình duyệt thật (Playwright Task 8): mã
  // JS của bản dùng `submitAction` cho cả đường nhanh chạy đúng logic (đã xác
  // nhận bằng console.log — `submitAction` được GỌI), nhưng không có request
  // thứ hai nào từng rời trình duyệt, vì hàng đợi hành động của Next đã chặn
  // nó ở tầng dưới mã ứng dụng, chỗ không đọc thấy được nếu chỉ đọc mã nguồn.
  //
  // RESIDUAL (review round 3, finding 5) — vì sao đường NHANH cũng phải đổi,
  // không chỉ đường dự phòng: bản trước đường nhanh vẫn gọi `submitAction`
  // (chỉ đường dự phòng đổi sang route thô). Kịch bản còn hở: đường dự phòng
  // `reload()` xong, component MOUNT LẠI từ đầu — `pending` lại là `false`
  // NGAY LẬP TỨC, `autoSubmittedRef` cũng mới tinh (chưa bị chặn) — nên đường
  // NHANH chạy TRƯỚC, và nếu mạng vẫn còn xấu, `submitAction` lần này CŨNG đi
  // qua đúng hàng đợi bị kẹt y hệt lần trước: một lần tải lại sau, người học
  // kẹt lại đúng chỗ cũ. Bỏ hẳn Server Action khỏi MỌI đường tự động (không
  // chỉ vá thêm một trường hợp cụ thể) xoá cả LỚP lỗi này — đơn giản hơn bản
  // tách "fast"/"fallback" cũ, không phức tạp hơn.
  //
  // `AbortController` + `setTimeout` (không phải `AbortSignal.timeout` — xem
  // hằng số `RAW_FETCH_TIMEOUT_MS`) BẮT BUỘC phải bọc `fetch`: không có nó,
  // request tới CHÍNH route thô này cũng có thể TREO (mất mạng thật, không
  // phải kẹt hàng đợi Next) và tái tạo đúng lỗi gốc một tầng thấp hơn —
  // `catch` chỉ chạy khi promise REJECT, còn "treo" thì promise không bao giờ
  // settle theo hướng nào cả.
  //
  // ĐỌC `res.status` (KHÔNG đọc thân phản hồi, KHÔNG vẽ điểm/đạt-trượt từ nó
  // — đó vẫn LUÔN là việc của dòng `assessments` trong database, đọc lại bởi
  // `page.tsx` sau khi tải lại) — review round 4: round 3 đọc `res.ok` rồi bỏ
  // qua hoàn toàn (`if (!res.ok) {}` rỗng), và bản round 4 ban đầu XOÁ HẲN
  // việc đọc đó, khiến "server trả lời và từ chối" (4xx — hết phiên, bị chặn
  // CSRF, bài không thuộc về mình) và "không có phản hồi nào cả" (treo/mất
  // mạng) bị xử lý Y HỆT NHAU — coi cả hai là "cứ tải lại thử tiếp", không
  // giới hạn, chính là thứ làm vòng lặp không có điểm dừng. Ở đây status được
  // đọc để quyết định THẬT: lỗi 4xx sẽ không tự khỏi dù thử lại bao nhiêu
  // lần (dừng NGAY, không đợi hết ngân sách `AUTO_SUBMIT_MAX_ATTEMPTS`); lỗi
  // mạng/treo/5xx có thể là tạm thời (để bộ đếm bên dưới quyết định còn thử
  // hay dừng).
  const submitViaRawFetch = useCallback(async () => {
    const attempts = readAutoSubmitAttempts(assessmentId);
    if (attempts >= AUTO_SUBMIT_MAX_ATTEMPTS) {
      // ĐÃ THỬ ĐỦ SỐ LẦN CHO PHÉP — DỪNG LẠI, KHÔNG `reload()` NỮA. Hiện lỗi
      // tiếng Việt; nút "Nộp bài" vẫn `disabled={pending}` NHƯ MỌI LÚC KHÁC —
      // route thô này không bao giờ đụng tới `pending` (không wrap
      // `startTransition`), nên nút đó vẫn bấm được suốt từ đầu tới giờ,
      // không cần mở khoá gì thêm ở đây.
      setError(AUTO_SUBMIT_GIVE_UP_MESSAGE);
      return;
    }
    writeAutoSubmitAttempts(assessmentId, attempts + 1);

    // "retry" (mặc định) = coi là tạm thời, vẫn tải lại để thử tiếp (trong
    // ngân sách). "ok" = thành công, dọn bộ đếm rồi tải lại để thấy kết quả.
    // "giveUpNow" = lỗi phía CLIENT (4xx), dừng NGAY không đợi hết ngân sách.
    let outcome: "retry" | "ok" | "giveUpNow" = "retry";
    try {
      // `new AbortController()` PHẢI nằm TRONG `try` (review round 4, finding
      // 2) — bản trước để dòng này NGOÀI `try`: nếu chính việc dựng
      // AbortController ném (trình duyệt cực cũ không có `AbortController`),
      // `submitViaRawFetch` reject mà không ai `catch`
      // (`void submitViaRawFetch()` ở nơi gọi nuốt nó thành unhandled
      // rejection), và `window.location.reload()` KHÔNG BAO GIỜ chạy — đúng
      // cái khoá cứng hàm này sinh ra để ngăn. Mã cũ hơn (`AbortSignal.timeout`
      // gọi ngay trong `try`) vô tình AN TOÀN HƠN trên trục này dù bị thay vì
      // lý do khác (finding 4, tương thích trình duyệt) — bọc toàn thân hàm
      // trong `try` giữ lại đúng tính an toàn đó.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), RAW_FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(`/api/assessment/${assessmentId}/submit`, {
          method: "POST",
          signal: controller.signal,
        });
        if (res.ok) {
          outcome = "ok";
        } else if (res.status >= 400 && res.status < 500) {
          outcome = "giveUpNow";
        }
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // AbortController hết hạn (request treo thật), không dựng được
      // AbortController, hoặc lỗi mạng thật khác — cả ba đều rơi vào đây,
      // coi như tạm thời (`outcome` giữ nguyên "retry").
    }

    if (outcome === "ok") {
      clearAutoSubmitAttempts(assessmentId);
    } else if (outcome === "giveUpNow") {
      setError(AUTO_SUBMIT_GIVE_UP_MESSAGE);
      return; // KHÔNG reload — lỗi phía client sẽ không tự khỏi dù tải lại
    }
    window.location.reload();
  }, [assessmentId]);

  // Cổng DUY NHẤT dẫn tới việc tự nộp — cả đường nhanh lẫn đường dự phòng đều
  // gọi qua đây và đều dùng CHUNG một cách nộp (`submitViaRawFetch`).
  // `autoSubmittedRef` đảm bảo dù cái nào thắng, việc nộp cũng chỉ thật sự
  // chạy đúng một lần.
  const triggerAutoSubmit = useCallback(() => {
    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    if (autoSubmitTimerRef.current !== null) {
      clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }
    void submitViaRawFetch();
  }, [submitViaRawFetch]);

  // Đường NHANH: hết giờ mà không còn round trip nào dở dang → nộp ngay,
  // không đợi cửa sổ dự phòng ở dưới. `!pending` không còn quyết định CÁCH
  // nộp nữa (cả hai đường giờ nộp giống hệt nhau) — nó vẫn giữ nguyên lý do
  // gốc: không tự nộp trong lúc còn một `answerAction` đang bay, để tránh
  // đúng cuộc đua chấm điểm đã ghi ở trên (`finalize` chấm câu đó thành sai
  // trước, rồi lượt trả lời muộn ghi đè sau). Chạy lại mỗi khi `pending` đổi,
  // nên nếu lúc hết giờ đúng lúc một answerAction đang bay, effect này tự thử
  // lại ngay khi round trip đó XONG — trường hợp thường gặp, effect nắm bắt
  // được ngay, không cần chờ hết cửa sổ dự phòng.
  useEffect(() => {
    if (expired && !pending) triggerAutoSubmit();
  }, [expired, pending, triggerAutoSubmit]);

  // Đường DỰ PHÒNG, bắt buộc phải có: một request KHÔNG BAO GIỜ resolve hay
  // reject (mất mạng giữa chừng, treo ở tầng hạ tầng) thì `pending` không bao
  // giờ về `false`, và đường nhanh ở trên không bao giờ chạy — người học kẹt
  // trên màn hình làm bài, sau hạn giờ, vô thời hạn: mọi nút (chọn đáp án,
  // trước/sau, bảng số câu, cả nút "Nộp bài") đều `disabled={pending}`.
  // Dashboard ĐÃ nối `closeExpired` (`dashboard/page.tsx:326`,
  // `dashboard/actions.ts:109-116` — review round 4, finding 3: comment cũ ở
  // đây nói ngược, đã sửa), nhưng điều đó không cứu được người học đang ĐỨNG
  // Ở TRANG NÀY: `AppLayout` (`src/app/(app)/layout.tsx`) không có liên kết
  // nào quay lại `/dashboard` — chỉ có nút "Đăng xuất" — nên không có lối
  // thoát nào KHÁC ngoài gõ tay URL hoặc bấm back của trình duyệt, cả hai
  // đều không được gợi ý ở đâu trên trang. Hẹn giờ CỐ ĐỊNH ngay khi `expired`
  // bật: hết `AUTO_SUBMIT_FALLBACK_MS` là tự nộp bất kể `pending` đang là gì.
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
