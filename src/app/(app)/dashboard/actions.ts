"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { startAssessment, closeExpired, AssessmentInProgressError } from "@/lib/assessment/run";
import { loadNextStep } from "@/lib/assessment/current-step";
// `AssessmentType` là kiểu công khai của next-step.ts; run.ts chỉ IMPORT nó
// (không re-export) nên phải lấy đúng từ nguồn — xem
// src/app/(app)/assessment/[id]/page.tsx. `sameScope` dùng lại nguyên bản có
// test ở next-step.ts, không viết lại (cùng lý do Task 7 review finding 3).
import { sameScope, type AssessmentType } from "@/lib/assessment/next-step";

/**
 * Vỏ mỏng cùng khuôn assessment/[id]/actions.ts: chỉ lo phần không kiểm thử
 * được ngoài request Next.js thật (client từ cookie phiên, xác thực người
 * dùng), toàn bộ logic thật nằm ở run.ts/current-step.ts.
 *
 * `hintType`/`hintScope`/`hintParentId` được GẮN SẴN vào action từ
 * dashboard/page.tsx bằng `startAssessmentAction.bind(null, type, scope,
 * parentId)` lúc TRANG render — cách Next.js truyền thêm tham số cho một
 * Server Action gắn thẳng vào form mà không cần input ẩn hay client
 * component. Nhưng ba giá trị đó chỉ là ẢNH CHỤP tại lúc render, không phải
 * căn cứ để ghi database (Task 7 review, finding 5): hai tab, hoặc một tab
 * để mở rất lâu, có thể khiến chúng cũ hơn dữ liệu thật lúc người học bấm.
 * Ví dụ nếu không tính lại: tab A hiện nút "bắt đầu ôn tập(1,2)"; ở tab B
 * người học bắt đầu, làm và NỘP đạt đúng bài đó; quay về tab A bấm nút cũ —
 * không có bài nào `in_progress` nên chỉ số duy nhất (0007) không chặn, và
 * một bài ôn tập(1,2) THỨ HAI ra đời dù bài đầu đã đạt, đẩy dòng đó trên
 * dashboard từ "Đã xong" ngược lại "Đang làm". Vì vậy hàm này tính lại
 * `nextStep` từ dữ liệu MỚI NHẤT ngay tại lúc bấm, và luôn hành động theo
 * câu trả lời MỚI đó.
 *
 * `hintType`/`hintScope` KHÔNG bị bỏ qua hoàn toàn (Task 7 review, finding
 * C): sau khi tính lại, nếu `nextStep` mới vẫn là "start" nhưng ra một
 * `type`/`scope` KHÁC với cái người học đang thấy trên màn hình lúc bấm —
 * ví dụ form hiển thị "bắt đầu ôn tập(19,20)" 15 phút, nhưng vì một tab khác
 * đã làm xong đúng bài đó, slot thật bây giờ là "bắt đầu kiểm tra(17-20)" 60
 * phút HARD_LOCKED (run.ts:46, đồng hồ chạy ngay, câu bỏ trống tự động tính
 * sai) — thì KHÔNG được âm thầm bắt đầu bài khác với bài đã hiển thị. Đưa
 * người học về dashboard để họ tự thấy trạng thái mới rồi bấm lại có chủ ý,
 * còn hơn ném họ vào một bài khác hẳn mà không hề báo trước.
 *
 * Bắt đầu một bài đánh giá PHẢI là Server Action chứ không phải một
 * `<Link>`: nó ghi database, và một lượt prefetch của crawler hay một cú
 * bấm đúp vào link sẽ tạo ra bài thật.
 */
export async function startAssessmentAction(
  hintType: AssessmentType,
  hintScope: number[],
  _hintParentId: number | null,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("chưa đăng nhập");

  const { action } = await loadNextStep(supabase, user.id, new Date());

  // Bốn nhánh dưới đây đều kết ở `redirect(...)` — hàm đó có kiểu trả về
  // `never` (ném ra ngay, không bao giờ chạy tiếp), nên TypeScript tự thu
  // hẹp `action` xuống đúng còn nhánh "start" ở phần thân hàm bên dưới.
  if (action.kind === "resume") {
    redirect(`/assessment/${action.assessmentId}`);
  }
  if (action.kind === "close-expired") {
    await closeExpired(supabase, user.id, action.assessmentId, new Date());
    redirect(`/assessment/${action.assessmentId}`);
  }
  if (action.kind === "lesson" || action.kind === "done") {
    // Đường thật giờ không còn là "bắt đầu bài đánh giá" nữa — có thể vì
    // slot đã đổi ở nơi khác trong lúc form này còn mở. Quay lại dashboard
    // để người học thấy đúng nút "Học tiếp" hiện tại, thay vì tạo một bài
    // đáng lẽ không nên tồn tại.
    redirect("/dashboard");
  }

  // action.kind === "start" ở đây. So với gợi ý đã bind lúc render (finding
  // C ở trên) — lệch type hoặc scope nghĩa là bài THẬT SỰ sắp tạo không phải
  // bài người học nhìn thấy trên nút họ vừa bấm.
  if (action.type !== hintType || !sameScope(action.scope, hintScope)) {
    redirect("/dashboard");
  }

  let assessmentId: number;
  try {
    assessmentId = await startAssessment(
      supabase,
      user.id,
      action.type,
      action.scope,
      action.parentId,
      new Date(),
    );
  } catch (e) {
    // Đã có một bài đang dở (bấm đúp vào chính nút này, hai tab, thử lại sau
    // timeout) — đưa thẳng về bài đang dở đó thay vì hiện lỗi, đúng quyết
    // định trong brief chứ không phải một điều kiện phụ tự thêm.
    if (e instanceof AssessmentInProgressError) {
      redirect(`/assessment/${e.assessmentId}`);
    }
    throw e;
  }

  redirect(`/assessment/${assessmentId}`);
}

/**
 * Đóng một bài ĐÃ QUÁ HẠN rồi đưa thẳng người học tới màn hình kết quả của
 * nó. `assessmentId` tới từ một form phía CLIENT kiểm soát
 * (`startAssessmentAction.bind`-tương tự ở `dashboard/page.tsx`), nên
 * "đã quá hạn" không được phép chỉ là một giả định của bên gọi — `closeExpired`
 * (`run.ts`) tự kiểm tra lại `expires_at` và NÉM nếu bài chưa hết hạn (review
 * cuối nhánh, finding 5), nên tên hàm này giờ là một đảm bảo thật, không chỉ
 * một cái tên.
 */
export async function closeExpiredAction(assessmentId: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("chưa đăng nhập");

  await closeExpired(supabase, user.id, assessmentId, new Date());
  // `/assessment/{id}` tự rẽ nhánh sang màn hình kết quả khi status không
  // còn 'in_progress' — xem assessment/[id]/page.tsx — nên không cần một
  // route /result riêng. Không cần tính lại nextStep ở đây như
  // startAssessmentAction: `closeExpired` chỉ ĐÓNG một dòng đã có sẵn theo
  // đúng id, nó không tạo dòng mới, và `finalize` (run.ts) đã tự an toàn với
  // việc gọi hai lần — bấm lại một bài đã nộp chỉ trả về đúng kết quả đã có,
  // không chấm lại, không nhân đôi gì cả.
  redirect(`/assessment/${assessmentId}`);
}
