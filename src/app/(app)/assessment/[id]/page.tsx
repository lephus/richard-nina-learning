import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
// `AssessmentType` là kiểu công khai của next-step.ts; run.ts chỉ IMPORT nó
// (không re-export) nên phải lấy đúng từ nguồn — xem src/lib/assessment/run.ts:4.
import type { AssessmentType } from "@/lib/assessment/next-step";
import { AssessmentRunner, type AssessmentRunnerItem } from "@/components/assessment/assessment-runner";
import { AssessmentDone } from "@/components/assessment/assessment-done";

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
    .select("id, type, status, score, passed, expires_at")
    .eq("id", assessmentId)
    // Tường minh dù RLS đã chặn — không dựa vào một lớp phòng thủ duy nhất.
    .eq("user_id", user.id)
    .maybeSingle();
  if (assessError) throw assessError;
  if (!assessment) notFound();

  const type = assessment.type as AssessmentType;

  if (assessment.status === "submitted") {
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

  return (
    <main>
      <AssessmentRunner
        assessmentId={assessmentId}
        items={items}
        expiresAt={assessment.expires_at as string}
        hardLocked={type === "test"}
      />
    </main>
  );
}
