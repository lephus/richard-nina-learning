import type { SupabaseClient } from "@supabase/supabase-js";
import { masteryDelta } from "./apply";

/**
 * Ghi kết quả một câu vào `word_mastery` / `grammar_mastery`.
 *
 * Không có `"use server"`: hàm nhận `SupabaseClient` của NGƯỜI DÙNG làm tham
 * số thay vì tự dựng client, nên `SUPABASE_SERVICE_ROLE_KEY` không có chỗ lọt
 * vào. RLS của chính người dùng là lớp chặn cuối.
 *
 * Bản này dựng lại tệp bị xoá ở lát 2a (`git show 93b7920:src/lib/mastery/write.ts`),
 * giữ nguyên hai bài học đã trả giá — xem chú thích tại chỗ `throw` bên dưới và
 * tại `applyGrammarMastery`.
 */
export async function applyWordMastery(
  supabase: SupabaseClient,
  userId: string,
  wordId: number,
  correct: boolean,
): Promise<void> {
  const { data: current, error: currentErr } = await supabase
    .from("word_mastery")
    .select("correct_count, wrong_count, mastered")
    .eq("user_id", userId)
    .eq("word_id", wordId)
    .maybeSingle();
  // BẮT BUỘC throw. Nuốt lỗi ở đây khiến `current` thành null, `masteryDelta`
  // tính lại từ 0, và `upsert` bên dưới GHI ĐÈ correct_count/wrong_count/mastered
  // đã tích luỹ về điểm xuất phát — mất lịch sử học mà không có gì báo cho
  // người học biết. Đây là mất dữ liệu âm thầm, không phải một lần hiện sai.
  if (currentErr) throw currentErr;

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
      word_id: wordId,
      correct_count: next.correctCount,
      wrong_count: next.wrongCount,
      mastered: next.mastered,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id,word_id" },
  );
  if (error) throw error;
}

/**
 * `grammar_mastery` khoá theo `(user_id, grammar_lesson_id)` — **không** suy ra
 * được từ `question_id`. Vì vậy `grammarLessonId` phải truyền từ ngoài vào; đây
 * đúng là chỗ bản cũ ghi lại như một cái bẫy.
 *
 * Bảng này chỉ đếm, không có cột `mastered`, nên phần `mastered` của
 * `masteryDelta` bị bỏ đi — truyền `false` vào để nó không ảnh hưởng hai bộ đếm.
 * Dùng chung `masteryDelta` để hai loại mastery cộng dồn theo CÙNG một luật.
 *
 * Lát 2b chưa gọi hàm này (bài ngữ pháp là lát sau), nhưng ranh giới phải đúng
 * từ đầu — bản cũ bị xoá chính vì import treo sau khi luồng cũ biến mất.
 */
export async function applyGrammarMastery(
  supabase: SupabaseClient,
  userId: string,
  grammarLessonId: number,
  correct: boolean,
): Promise<void> {
  const { data: current, error: currentErr } = await supabase
    .from("grammar_mastery")
    .select("correct_count, wrong_count")
    .eq("user_id", userId)
    .eq("grammar_lesson_id", grammarLessonId)
    .maybeSingle();
  if (currentErr) throw currentErr;

  const next = masteryDelta(
    current
      ? {
          correctCount: current.correct_count as number,
          wrongCount: current.wrong_count as number,
          mastered: false,
        }
      : null,
    correct,
  );

  const { error } = await supabase.from("grammar_mastery").upsert(
    {
      user_id: userId,
      grammar_lesson_id: grammarLessonId,
      correct_count: next.correctCount,
      wrong_count: next.wrongCount,
    },
    { onConflict: "user_id,grammar_lesson_id" },
  );
  if (error) throw error;
}
