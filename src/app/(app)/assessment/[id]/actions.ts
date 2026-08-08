"use server";

import { createClient } from "@/lib/supabase/server";
import { answerItem, submitAssessment } from "@/lib/assessment/run";

/**
 * Vỏ mỏng: chỉ lo phần không kiểm thử được ngoài request Next.js thật — tạo
 * client từ cookie phiên và xác thực người dùng. Toàn bộ logic chấm/nộp nằm
 * ở `run.ts` (nhận client làm tham số nên gọi thẳng được từ test), cùng
 * khuôn với `learn/[lessonId]/actions.ts` ở 1b.
 */
export async function answerAction(assessmentId: number, position: number, answer: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("chưa đăng nhập");
  return answerItem(supabase, user.id, assessmentId, position, answer, new Date());
}

export async function submitAction(assessmentId: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("chưa đăng nhập");
  return submitAssessment(supabase, user.id, assessmentId, new Date());
}
