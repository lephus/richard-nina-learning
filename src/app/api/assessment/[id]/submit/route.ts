import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { submitAssessment } from "@/lib/assessment/run";

/**
 * Route xử lý thô (KHÔNG phải Server Action) — dùng RIÊNG cho đường tự-nộp DỰ
 * PHÒNG của `AssessmentRunner` khi hết giờ. Không dùng lại `submitAction`
 * (Server Action đã có ở `assessment/[id]/actions.ts`) cho đường này, vì lý
 * do sau, phát hiện được CHỈ khi chạy qua trình duyệt thật (Playwright Task 8,
 * kịch bản "request treo"):
 *
 * MỌI lời gọi Server Action từ client — dù gọi trực tiếp như một hàm bình
 * thường (`await submitAction(...)`) hay qua `<form action>` — đều đi qua
 * CHUNG một hàng đợi hành động (action queue) DUY NHẤT của App Router
 * (node_modules/next/dist/client/app-call-server.js: `callServer` gọi
 * `dispatchAppRouterAction`, xử lý tại
 * node_modules/next/dist/client/components/app-router-instance.js:
 * `dispatchAction`/`runAction`/`runRemainingActions`). Hàng đợi đó CHỈ chạy
 * MỘT action tại một thời điểm — action kế tiếp (kể cả `router.refresh()`,
 * bản thân nó cũng là một action trong CÙNG hàng đợi) chỉ thật sự bắn request
 * ra mạng SAU KHI action đang chạy resolve/reject.
 *
 * Hệ quả: nếu một `answerAction` trước đó bị TREO (mất mạng giữa chừng, không
 * bao giờ resolve — đúng kịch bản đường dự phòng này sinh ra để cứu), nó
 * chiếm vĩnh viễn vị trí "đang chạy" của hàng đợi. Đường dự phòng gọi lại
 * `submitAction` (hay bất kỳ Server Action nào khác) qua ĐÚNG cơ chế đó sẽ chỉ
 * bị XẾP HÀNG phía sau — never thật sự gửi request — nên "hẹn giờ vô điều
 * kiện" ở `assessment-runner.tsx` vô nghĩa trên thực tế, dù mã JS của nó vẫn
 * chạy đúng (đã xác nhận bằng console.log thật: `submitAction(...)` được GỌI
 * nhưng không có request thứ hai nào từng rời trình duyệt).
 *
 * `fetch()` thẳng tới route xử lý thô này KHÔNG đi qua `callServer`/hàng đợi
 * đó — nó là một request HTTP độc lập, không phụ thuộc trạng thái của bất kỳ
 * Server Action nào khác đang treo. Phía gọi (`submitViaRawFetch` trong
 * `assessment-runner.tsx`) sau đó `window.location.reload()` thay vì
 * `router.refresh()` — lý do y hệt: `router.refresh()` cũng là một action
 * trong hàng đợi đó, sẽ bị kẹt lại nếu gọi ngay sau một action khác đang
 * treo. Tải lại cả trang bằng trình duyệt không đi qua bất kỳ hàng đợi JS
 * nào của Next, và tạo lại toàn bộ state React từ đầu (kể cả trường hợp
 * request tới route này cũng thất bại vì mất mạng thật — trang tải lại vẫn
 * đọc đúng trạng thái mới nhất từ database, không còn kẹt ở màn hình khoá
 * cứng).
 *
 * Chỉ nộp bài — KHÔNG có route tương đương cho trả lời từng câu: đường dự
 * phòng chỉ cần NỘP được để người học thoát khỏi màn hình khoá cứng, không
 * cần cứu lại đúng câu trả lời của request đã treo.
 *
 * ── An toàn CSRF (Important — review round 2) ──────────────────────────────
 * Server Action mang theo phần kiểm tra origin tích hợp sẵn của Next; MỘT
 * route handler thường như route này thì KHÔNG. `next.config.ts` để trống
 * (không có tuỳ chỉnh `allowedOrigins`) và `src/middleware.ts` CỐ TÌNH loại
 * mọi `/api/*` khỏi phép kiểm `isProtectedRoute` (một POST JSON bị redirect
 * sang /login sẽ vỡ hợp đồng response) — route này không đi qua middleware.
 *
 * Thứ THỰC SỰ đang chặn một form tự động POST từ site khác gửi cookie phiên
 * kèm theo là **`sameSite: "lax"`** — mặc định của chính thư viện
 * `@supabase/ssr@0.12.4` khi ghi cookie phiên
 * (`node_modules/@supabase/ssr/dist/module/utils/constants.js:3`).
 * `src/lib/supabase/server.ts:13-43` (`createClient`, hàm route này gọi)
 * KHÔNG BAO GIỜ override `cookieOptions`, nên cookie phiên vẫn mang đúng mặc
 * định đó. `SameSite=Lax` khiến trình duyệt KHÔNG gửi cookie phiên kèm một
 * POST cross-site — nên một form ẩn tự submit từ site khác tới đây sẽ tới nơi
 * ẩn danh (không cookie), rơi vào nhánh 401 ngay dưới, không chạm được tới
 * `submitAssessment`.
 *
 * Đây là một phòng thủ THẬT nhưng KHÔNG CHỦ Ý — không ai từng chọn nó, không
 * nơi nào trong repo từng nhắc tới nó trước đoạn comment này. Nếu sau này có
 * ai đổi `cookieOptions` (ví dụ để nhúng ứng dụng trong iframe, việc đó cần
 * `sameSite: "none"`), phòng thủ này biến mất NGAY LẬP TỨC và không ai biết —
 * một form tự động POST trên một trang bất kỳ mà người học ghé qua giữa lúc
 * đang làm bài kiểm tra 60 phút sẽ NỘP HỘ bài đó với đáp án hiện có, kéo theo
 * cả luồng bổ túc nếu điểm dưới ngưỡng. Vì vậy route này KHÔNG được phép dựa
 * DUY NHẤT vào một mặc định không ai chọn — kiểm thêm `Sec-Fetch-Site` (trình
 * duyệt hiện đại luôn gửi) làm lớp phòng thủ THỨ HAI, độc lập với cookie.
 */
function isCrossSite(request: Request): boolean {
  // `Sec-Fetch-Site` là Fetch Metadata Request Header — trình duyệt hiện đại
  // (Chrome/Firefox/Edge) tự gắn, KHÔNG script nào giả mạo được từ phía
  // client. "same-origin"/"none" (điều hướng trực tiếp, không có initiator)
  // là an toàn; "cross-site"/"same-site" (site khác, hoặc cùng site nhưng
  // khác origin) là đáng ngờ cho một route CHỈ được gọi bằng `fetch()` từ
  // đúng trang đang làm bài.
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) return site !== "same-origin" && site !== "none";

  // Trình duyệt cũ không gửi header trên — lùi về so `Origin` (cũng do trình
  // duyệt gắn, không phải client script) với chính host của request. Không
  // có CẢ HAI header (một số truy vấn non-browser, ví dụ `curl`) thì không đủ
  // thông tin để chặn ở lớp này — `sameSite: "lax"` vẫn là lớp chính.
  const origin = request.headers.get("origin");
  if (origin === null) return false;
  try {
    return new URL(origin).host !== new URL(request.url).host;
  } catch {
    return true; // Origin dị dạng — an toàn hơn khi coi là đáng ngờ.
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isCrossSite(request)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const { id } = await params;
  const assessmentId = Number(id);
  if (!Number.isInteger(assessmentId) || assessmentId <= 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  // Tra tồn tại TRƯỚC khi chấm — `finalize` (run.ts) ném một Error thường khi
  // không tìm thấy bài của đúng người dùng này (id sai, hoặc của người khác),
  // và để lọt lên đây sẽ thành 500 cho một request dò id hoàn toàn bình
  // thường (không phải lỗi máy chủ) — 404 mới đúng nghĩa.
  const { data: existing, error: lookupErr } = await supabase
    .from("assessments")
    .select("id")
    .eq("id", assessmentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (lookupErr) throw lookupErr;
  if (existing === null) return NextResponse.json({ ok: false }, { status: 404 });

  await submitAssessment(supabase, user.id, assessmentId, new Date());
  return NextResponse.json({ ok: true });
}
