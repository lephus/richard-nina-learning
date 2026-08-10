"use server";

import { createClient } from "@/lib/supabase/server";
import { runSubmit, type SubmitResult } from "@/lib/lesson/run-submit";

export type { SubmitResult };

/**
 * Vỏ mỏng: chỉ lo phần không kiểm thử được ngoài request Next.js thật —
 * tạo client từ cookie phiên và xác thực người dùng. Toàn bộ logic chấm bài
 * nằm ở `runSubmit` (src/lib/lesson/run-submit.ts), nhận client làm tham số
 * nên gọi thẳng được từ test.
 */
export async function submitAnswer(
  lessonId: number,
  clientPosition: number,
  answer: string,
): Promise<SubmitResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("chưa đăng nhập");

  return runSubmit(supabase, user.id, lessonId, clientPosition, answer);
}
