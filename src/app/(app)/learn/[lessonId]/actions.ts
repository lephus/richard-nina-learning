"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { itemAt, TOTAL_ITEMS } from "@/lib/lesson/item-plan";
import { buildItem, type BuiltItem } from "@/lib/lesson/build-item";
import { loadContext, secretFor } from "@/lib/lesson/session";
import { gradeItem } from "@/lib/lesson/grade";
import { masteryDelta } from "@/lib/mastery/apply";

export interface SubmitResult {
  /** false nghĩa là vị trí client gửi lệch với database — gửi trùng, đã bỏ qua. */
  ok: boolean;
  correct?: boolean;
  correctAnswer?: string;
  position: number;
  item: BuiltItem | null;
  done: boolean;
  score?: number;
}

export async function submitAnswer(
  lessonId: number,
  clientPosition: number,
  answer: string,
): Promise<SubmitResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("chưa đăng nhập");

  // 1. Vị trí thật đọc từ database — KHÔNG tin client. RLS (0004_rls.sql:11-12)
  //    đã giới hạn hàng trả về cho đúng user_id = auth.uid() của phiên này.
  const { data: prog, error: progErr } = await supabase
    .from("user_lesson_progress")
    .select("position, final_correct, status")
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (progErr) throw progErr;

  const position = prog?.position ?? 0;
  const ctx = await loadContext(supabase, lessonId, user.id);

  // 2. Chốt kiểm tra chống gửi trùng: lệch thì không làm gì cả.
  if (clientPosition !== position) {
    return {
      ok: false,
      position,
      item: position >= TOTAL_ITEMS ? null : buildItem(itemAt(position), ctx),
      done: position >= TOTAL_ITEMS,
    };
  }

  if (position >= TOTAL_ITEMS) {
    return { ok: true, position, item: null, done: true };
  }

  const spec = itemAt(position);
  const nextPosition = position + 1;

  // 3. Thẻ gặp từ: không chấm, không đụng mastery, chỉ đẩy vị trí.
  if (spec.kind === "flashcard") {
    await writeProgress(supabase, user.id, lessonId, nextPosition, prog?.final_correct ?? 0);
    return {
      ok: true,
      position: nextPosition,
      item: nextPosition >= TOTAL_ITEMS ? null : buildItem(itemAt(nextPosition), ctx),
      done: nextPosition >= TOTAL_ITEMS,
    };
  }

  // 4. Chấm. Đáp án lấy qua RPC security definer — xem migration 0006.
  //    KHÔNG dùng service role: khoá đó không được lên Vercel.
  const correctOption = await secretFor(supabase, spec, ctx);
  const item = buildItem(spec, ctx);
  const result = gradeItem(item, answer, { correctOption });

  // 5. Cập nhật mastery.
  await applyMastery(supabase, user.id, item, result.correct);

  // 6. final_correct chỉ đếm trong 15 item chốt buổi.
  const isFinal = spec.kind === "final-meaning" || spec.kind === "grammar";
  const finalCorrect =
    (prog?.final_correct ?? 0) + (isFinal && result.correct ? 1 : 0);

  const done = nextPosition >= TOTAL_ITEMS;
  await writeProgress(supabase, user.id, lessonId, nextPosition, finalCorrect, done);

  return {
    ok: true,
    correct: result.correct,
    correctAnswer: result.correctAnswer,
    position: nextPosition,
    item: done ? null : buildItem(itemAt(nextPosition), ctx),
    done,
    score: done ? Math.round((finalCorrect / 15) * 100) : undefined,
  };
}

async function writeProgress(
  supabase: SupabaseClient,
  userId: string,
  lessonId: number,
  position: number,
  finalCorrect: number,
  done = false,
): Promise<void> {
  const row: Record<string, unknown> = {
    user_id: userId,
    lesson_id: lessonId,
    position,
    final_correct: finalCorrect,
    status: done ? "completed" : "in_progress",
  };
  if (done) {
    row.score = Math.round((finalCorrect / 15) * 100);
    row.completed_at = new Date().toISOString();
  }
  const { error } = await supabase
    .from("user_lesson_progress")
    .upsert(row, { onConflict: "user_id,lesson_id" });
  if (error) throw error;
}

async function applyMastery(
  supabase: SupabaseClient,
  userId: string,
  item: BuiltItem,
  correct: boolean,
): Promise<void> {
  if (item.kind === "flashcard") return;

  if (item.kind === "grammar") {
    // grammar_mastery khoá theo grammar_lesson_id, lấy từ chính câu hỏi.
    // Để trống ở lát này — xem chú thích cuối brief Task 5. Lát 1c mới cần
    // tới bảng này cho việc dựng đề bổ túc, và ghi bừa theo question_id
    // (không đúng khoá của bảng) sẽ hỏng dữ liệu chứ không phải bỏ trống.
    return;
  }

  const { data: current } = await supabase
    .from("word_mastery")
    .select("correct_count, wrong_count, mastered")
    .eq("word_id", item.wordId)
    .maybeSingle();

  const next = masteryDelta(
    current
      ? {
          correctCount: current.correct_count as number,
          wrongCount: current.wrong_count as number,
          mastered: current.mastered as boolean,
        }
      : null,
    correct,
  );

  const { error } = await supabase.from("word_mastery").upsert(
    {
      user_id: userId,
      word_id: item.wordId,
      correct_count: next.correctCount,
      wrong_count: next.wrongCount,
      mastered: next.mastered,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id,word_id" },
  );
  if (error) throw error;
}
