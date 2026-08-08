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
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  await submitAssessment(supabase, user.id, assessmentId, new Date());
  return NextResponse.json({ ok: true });
}
