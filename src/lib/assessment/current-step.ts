import type { SupabaseClient } from "@supabase/supabase-js";
import { lessonStatuses, type LessonRow, type ProgressRow } from "@/lib/curriculum/lesson-status";
import {
  nextStep,
  toAssessmentRow,
  toLessonDones,
  type Action,
  type AssessmentDbRow,
} from "./next-step";

/**
 * Đọc lessons/tiến độ/assessments của CHÍNH `userId` rồi tính lại `nextStep`
 * từ dữ liệu mới nhất — dùng ở CẢ trang dashboard (chỉ để hiển thị) lẫn
 * Server Action bắt đầu bài đánh giá (quyết định thật, không tin bất kỳ
 * tham số nào đã gắn sẵn lúc render trang — xem `dashboard/actions.ts`).
 * Một request là một lần đọc riêng: hàm này KHÔNG nhận `now` từ bên ngoài
 * chuyền cho phép đọc, mỗi lần gọi tự lấy dữ liệu và mốc giờ tại chính lúc
 * đó, đúng tinh thần "đồng hồ ở server" của `run.ts`.
 *
 * `AssessmentDbRow`/`toAssessmentRow`/`toLessonDones` import từ next-step.ts
 * chứ không viết lại — `dashboard/page.tsx` dùng đúng ba thứ này để tự tính
 * `nextStep` của riêng nó, và một bản sao thứ hai ở đây từng là đúng lỗi mà
 * Task 7 review finding D chỉ ra.
 */
export async function loadNextStep(
  supabase: SupabaseClient,
  userId: string,
  now: Date,
): Promise<{ slotIndex: number; action: Action }> {
  const [lessonsRes, progressRes, assessmentsRes] = await Promise.all([
    supabase.from("lessons").select("id, ordinal"),
    // `.eq("user_id", userId)` tường minh dù RLS đã lọc đúng — không dựa vào
    // một lớp phòng thủ duy nhất, cùng cách assessment/[id]/page.tsx và
    // run.ts đang làm với mọi bảng riêng-tư-theo-người-dùng.
    supabase.from("user_lesson_progress").select("lesson_id, status").eq("user_id", userId),
    supabase
      .from("assessments")
      .select("id, type, scope, status, passed, expires_at, parent_id")
      .eq("user_id", userId),
  ]);
  if (lessonsRes.error) throw lessonsRes.error;
  if (progressRes.error) throw progressRes.error;
  if (assessmentsRes.error) throw assessmentsRes.error;

  const lessons = (lessonsRes.data ?? []) as LessonRow[];
  const progress = (progressRes.data ?? []) as ProgressRow[];
  const statuses = lessonStatuses(lessons, progress);

  const lessonDones = toLessonDones(lessons, statuses);
  const assessments = ((assessmentsRes.data ?? []) as AssessmentDbRow[]).map(toAssessmentRow);

  return nextStep(lessonDones, assessments, now);
}
