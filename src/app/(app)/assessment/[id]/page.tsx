import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
// `AssessmentType` là kiểu công khai của next-step.ts; run.ts chỉ IMPORT nó
// (không re-export) nên phải lấy đúng từ nguồn — xem src/lib/assessment/run.ts:4.
import type { AssessmentType } from "@/lib/assessment/next-step";
import { isHardLocked } from "@/lib/assessment/run";
import { AssessmentRunner, type AssessmentRunnerItem } from "@/components/assessment/assessment-runner";
import { AssessmentDone } from "@/components/assessment/assessment-done";
import { deleteEmptyAssessmentAction } from "./actions";

export default async function AssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const assessmentId = Number(id);
  if (!Number.isInteger(assessmentId) || assessmentId <= 0) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // AppLayout đã chặn ở tầng trên, nhưng vẫn tường minh ở đây — cùng cách
  // learn/[lessonId]/page.tsx đang làm.
  if (!user) redirect("/login");

  const { data: assessment, error: assessError } = await supabase
    .from("assessments")
    // Không chọn `id`: đã có `assessmentId` từ params, chọn thêm cột không ai
    // đọc chỉ là rác.
    .select("type, status, score, passed, expires_at")
    .eq("id", assessmentId)
    // Tường minh dù RLS đã chặn — không dựa vào một lớp phòng thủ duy nhất.
    .eq("user_id", user.id)
    .maybeSingle();
  if (assessError) throw assessError;
  if (!assessment) notFound();

  const type = assessment.type as AssessmentType;

  // Rẽ nhánh theo "KHÔNG còn đang làm" chứ không phải "đã nộp": enum
  // `assessment_status` có ba giá trị (`run.ts` đọc thấy `'expired'` ngay
  // trong định nghĩa cột), và dù hiện tại không có đường ghi nào đặt trạng
  // thái đó (chỉ `finalize` ghi, và nó luôn ghi 'submitted'), một dòng lỡ
  // mang 'expired' vẫn phải ra màn hình kết quả — không phải một bài làm dở
  // mà mọi lượt chọn đều bị `answerItem` từ chối lặng lẽ, không lời giải
  // thích, không điểm. `?? 0` / `?? false` đọc fail-closed, cùng cách
  // `nextStep` đọc hai cột này.
  if (assessment.status !== "in_progress") {
    return (
      <main>
        <AssessmentDone
          type={type}
          score={(assessment.score as number | null) ?? 0}
          passed={(assessment.passed as boolean | null) ?? false}
        />
      </main>
    );
  }

  // Đang làm dở: đọc đề đã đóng băng. KHÔNG chọn `is_correct` — hiện đúng/sai
  // từng câu trong lúc làm bài là lộ đáp án (spec giao diện, mục Step 2.3).
  const { data: itemRows, error: itemsError } = await supabase
    .from("assessment_items")
    .select("position, item_type, payload, user_answer")
    .eq("assessment_id", assessmentId)
    .order("position");
  if (itemsError) throw itemsError;

  const items = (itemRows ?? []) as unknown as AssessmentRunnerItem[];

  // Bài `in_progress` KHÔNG có câu nào — trạng thái kẹt cứng duy nhất của cả
  // lát này không có lối thoát nào khác (review cuối nhánh, finding 1):
  // `startAssessment` (run.ts) chèn dòng `assessments` rồi mới chèn
  // `assessment_items`, và dọn dòng đầu nếu chèn dòng sau lỗi — nhưng không
  // gì chạy được nếu tiến trình chết GIỮA hai lượt ghi đó (function timeout,
  // instance bị thu hồi). Không phải "?? return null" như bản trước: đó là
  // một trang trắng không giải thích gì, còn `startAssessment` chỉ chặn được
  // việc TẠO một bài rỗng MỚI (đọc "chưa có bài dở" ở bước 1), nó không giúp
  // gì một dòng rỗng đã lỡ sống sót — người học đứng ở đây vĩnh viễn cho tới
  // khi có cách xoá dòng đó. Đưa thẳng một màn hình lỗi tiếng Việt kèm nút
  // xoá, thay vì để `AssessmentRunner` tự vỡ ở dòng `if (!current) return
  // null`.
  if (items.length === 0) {
    return (
      <main className="flex flex-col gap-4">
        <h1 data-testid="empty-assessment-heading" className="text-xl font-semibold">
          Bài này bị lỗi
        </h1>
        <p className="text-sm text-slate-600">
          Bài đánh giá này đang dở nhưng không có câu hỏi nào — một lỗi hệ
          thống lúc tạo đề. Không thể làm tiếp hay chấm bài này. Xoá bài lỗi
          rồi bắt đầu lại từ dashboard.
        </p>
        <form action={deleteEmptyAssessmentAction.bind(null, assessmentId)}>
          <button
            type="submit"
            data-testid="delete-empty-assessment-button"
            className="self-start rounded bg-slate-900 px-4 py-2 text-white"
          >
            Xoá bài lỗi và quay lại
          </button>
        </form>
      </main>
    );
  }

  return (
    <main>
      <AssessmentRunner
        assessmentId={assessmentId}
        items={items}
        expiresAt={assessment.expires_at as string}
        hardLocked={isHardLocked(type)}
      />
    </main>
  );
}
