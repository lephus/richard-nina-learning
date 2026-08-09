"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { answerItem, submitAssessment } from "@/lib/assessment/run";

/**
 * Vỏ mỏng: chỉ lo phần không kiểm thử được ngoài request Next.js thật — tạo
 * client từ cookie phiên và xác thực người dùng. Toàn bộ logic chấm/nộp nằm
 * ở `run.ts` (nhận client làm tham số nên gọi thẳng được từ test), cùng
 * khuôn với `learn/[lessonId]/actions.ts` ở 1b.
 */
export async function answerAction(
  assessmentId: number,
  position: number,
  answer: string,
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("chưa đăng nhập");
  const r = await answerItem(supabase, user.id, assessmentId, position, answer, new Date());

  // CHỈ trả `ok`, KHÔNG trả nguyên `r` — giá trị trả về của một Server Action
  // được tuần tự hoá thẳng vào response POST gửi cho trình duyệt, nên
  // `r.correct` (đúng/sai của CHÍNH câu vừa chọn) sẽ lộ ra ở tab Network dù
  // component không bao giờ đọc field đó. Một người mở DevTools trong lúc làm
  // bài kiểm tra là dò được đáp án cho tất cả 60 câu mà không cần đọc mã
  // nguồn. Phải chặn ở CHỖ DỮ LIỆU RỜI SERVER, không phải ở chỗ hiển thị — xin
  // đừng "dọn gọn" lại thành `return answerItem(...)`.
  return { ok: r.ok };
}

export async function submitAction(assessmentId: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("chưa đăng nhập");
  return submitAssessment(supabase, user.id, assessmentId, new Date());
}

/**
 * Dọn một bài `in_progress` KHÔNG có câu nào — trạng thái kẹt cứng duy nhất
 * của cả lát này không có lối thoát nào khác (review cuối nhánh, finding 1):
 * `startAssessment` (run.ts) chèn dòng `assessments` rồi mới chèn
 * `assessment_items`, dọn dòng đầu nếu chèn dòng sau lỗi — nhưng nếu tiến
 * trình chết GIỮA hai lượt ghi đó (function timeout, instance bị thu hồi),
 * cleanup không bao giờ chạy tới. Dòng rỗng sống sót đó chặn vĩnh viễn: màn
 * hình làm bài trắng trơn (`!current` ở `assessment-runner.tsx`),
 * `finalize` ném vì 0 câu không chấm được, và `startAssessment` từ chối tạo
 * bài mới vì đã có một bài `in_progress`. Không có gì để chấm hay đóng ở
 * đây — xoá thẳng dòng rồi để người học bắt đầu lại là lối thoát duy nhất.
 *
 * Scope theo CẢ id lẫn user_id, tường minh — cùng cách mọi lượt ghi khác
 * trong lát này đang làm (run.ts, dashboard/actions.ts).
 */
export async function deleteEmptyAssessmentAction(assessmentId: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("chưa đăng nhập");

  const { error } = await supabase
    .from("assessments")
    .delete()
    .eq("id", assessmentId)
    .eq("user_id", user.id);
  if (error) throw error;

  redirect("/dashboard");
}
