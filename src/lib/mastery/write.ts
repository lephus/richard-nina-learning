import type { SupabaseClient } from "@supabase/supabase-js";
import type { BuiltItem } from "@/lib/lesson/build-item";
import { masteryDelta } from "./apply";

/**
 * Ghi kết quả một câu vào `word_mastery` / `grammar_mastery`.
 *
 * Tách khỏi `lib/lesson/run-submit.ts` (nơi nó ra đời ở lát 1b) khi lát 1c cần
 * đúng hành vi đó cho bài đánh giá: luật cộng dồn mastery phải có MỘT bản cài
 * đặt duy nhất, không phải hai bản sao chép sẽ trôi khỏi nhau. `masteryDelta`
 * quyết định con số; hàm này chỉ lo đọc–ghi.
 *
 * Không có "use server": hàm nhận `SupabaseClient` của NGƯỜI DÙNG làm tham số,
 * không tự dựng client, nên `SUPABASE_SERVICE_ROLE_KEY` không có chỗ lọt vào.
 *
 * `grammarLessonId` phải truyền từ ngoài vào vì `grammar_mastery` khoá theo
 * `(user_id, grammar_lesson_id)` (0003_user_state.sql:30-36) — `question_id`
 * KHÔNG phải khoá của bảng này và không suy ra được từ chính `BuiltItem`.
 */
export async function applyMastery(
  supabase: SupabaseClient,
  userId: string,
  item: BuiltItem,
  correct: boolean,
  grammarLessonId: number,
): Promise<void> {
  if (item.kind === "flashcard") return;

  if (item.kind === "grammar") {
    // Mỗi buổi có 5 câu ngữ pháp — 100 câu cho cả lộ trình. Không ghi thì lịch
    // sử đó mất hẳn, và /stats cùng luồng bổ túc ở lát 1d không có cách nào
    // dựng lại được.
    const { data: current, error: currentErr } = await supabase
      .from("grammar_mastery")
      .select("correct_count, wrong_count")
      .eq("user_id", userId)
      .eq("grammar_lesson_id", grammarLessonId)
      .maybeSingle();
    if (currentErr) throw currentErr;

    // Dùng lại masteryDelta để hai loại mastery cộng dồn theo CÙNG một luật.
    // grammar_mastery không có cột `mastered` (bảng này chỉ đếm), nên phần
    // `mastered` của kết quả bị bỏ đi — truyền `false` vào để nó không ảnh
    // hưởng gì tới hai bộ đếm.
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
    return;
  }

  const { data: current, error: currentErr } = await supabase
    .from("word_mastery")
    .select("correct_count, wrong_count, mastered")
    .eq("user_id", userId)
    .eq("word_id", item.wordId)
    .maybeSingle();
  // BẮT BUỘC throw khi lỗi — nếu bỏ qua như trước, một lỗi đọc thoáng qua sẽ
  // khiến `current` là null, masteryDelta tính lại từ 0, và upsert dưới đây
  // GHI ĐÈ correct_count/wrong_count/mastered đã tích luỹ về lại điểm xuất
  // phát mà không có gì báo cho người học biết đã mất lịch sử.
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
