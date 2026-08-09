"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { answerItem, deleteEmptyAssessment, submitAssessment } from "@/lib/assessment/run";

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
 * Vỏ mỏng đúng khuôn `answerAction`/`submitAction` ở trên: hàng rào thật —
 * chỉ đúng bài `in_progress` VÀ 0 câu hỏi mới xoá được, và xoá phải khớp
 * đúng một dòng chứ không phải một no-op thầm lặng — nằm ở
 * `deleteEmptyAssessment` (run.ts), NGAY CẢ KHI trang chỉ hiện nút này cho
 * đúng trường hợp đó. Một Server Action là một endpoint công khai: tham số
 * `assessmentId` tới từ request, không từ nhánh render của trang đã gọi nó
 * (review cuối nhánh, vòng 2, finding 1 — xem JSDoc đầy đủ ở
 * `deleteEmptyAssessment`).
 */
export async function deleteEmptyAssessmentAction(assessmentId: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("chưa đăng nhập");

  await deleteEmptyAssessment(supabase, user.id, assessmentId);

  redirect("/dashboard");
}
