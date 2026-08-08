"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { startAssessment, closeExpired, AssessmentInProgressError } from "@/lib/assessment/run";
// `AssessmentType` là kiểu công khai của next-step.ts; run.ts chỉ IMPORT nó
// (không re-export) nên phải lấy đúng từ nguồn — xem
// src/app/(app)/assessment/[id]/page.tsx.
import type { AssessmentType } from "@/lib/assessment/next-step";

/**
 * Vỏ mỏng cùng khuôn assessment/[id]/actions.ts: chỉ lo phần không kiểm thử
 * được ngoài request Next.js thật (client từ cookie phiên, xác thực người
 * dùng), toàn bộ logic thật nằm ở run.ts.
 *
 * `type`/`scope`/`parentId` được GẮN SẴN vào action từ dashboard/page.tsx
 * bằng `startAssessmentAction.bind(null, type, scope, parentId)` trước khi
 * gắn vào `<form action={...}>` — cách Next.js truyền thêm tham số cho một
 * Server Action gắn thẳng vào form mà không cần input ẩn hay client
 * component. Bắt đầu một bài đánh giá PHẢI là Server Action chứ không phải
 * một `<Link>`: nó ghi database, và một lượt prefetch của crawler hay một cú
 * bấm đúp vào link sẽ tạo ra bài thật.
 */
export async function startAssessmentAction(
  type: AssessmentType,
  scope: number[],
  parentId: number | null,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("chưa đăng nhập");

  let assessmentId: number;
  try {
    assessmentId = await startAssessment(supabase, user.id, type, scope, parentId, new Date());
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

/** Đóng một bài đã quá hạn rồi đưa thẳng người học tới màn hình kết quả của nó. */
export async function closeExpiredAction(assessmentId: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("chưa đăng nhập");

  await closeExpired(supabase, user.id, assessmentId, new Date());
  // `/assessment/{id}` tự rẽ nhánh sang màn hình kết quả khi status không
  // còn 'in_progress' — xem assessment/[id]/page.tsx — nên không cần một
  // route /result riêng.
  redirect(`/assessment/${assessmentId}`);
}
