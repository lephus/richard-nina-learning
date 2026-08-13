import type { SupabaseClient } from "@supabase/supabase-js";
import { buildVocabExam } from "./build";
import { applyWordMastery } from "@/lib/mastery/write";
import type { VocabLite } from "@/lib/vocab/word";

/**
 * Ngưỡng đạt, tính theo phần trăm, dùng chung cho MỌI loại bài — `lesson`,
 * `review`, `remedial`, `grammar`. Trước lát 2a đây là một
 * `Record<AssessmentType, number>`; giờ cả bốn loại dùng chung một con số nên
 * bảng tra đó chỉ còn là bốn chỗ để lệch nhau.
 */
export const PASS_MARK = 80;

/**
 * KHÔNG có `expires_at`/TTL ở đây dù bản brief ban đầu có. Cột đó đã bị
 * `0010_phase2_reset.sql:28` xoá khỏi `assessments`
 * (`alter table assessments drop column if exists expires_at`) — comment tại
 * chỗ xoá ghi rõ lý do: "Không còn bài thi nào bị giới hạn thời gian, nên cột
 * này không còn nghĩa gì". Đã kiểm tra ngay trên schema thật (OpenAPI của
 * PostgREST) để xác nhận cột thật sự không còn tồn tại trước khi bỏ field này
 * — insert với `expires_at` sẽ chết ngay ở lỗi 42703 (cột không tồn tại).
 */
export async function createVocabExam(
  supabase: SupabaseClient,
  userId: string,
  type: "lesson" | "remedial",
  scope: number[],
  words: readonly VocabLite[],
  blankAnswers: ReadonlyMap<number, string>,
  seed: number,
  parentId?: number,
  distractorPool?: readonly VocabLite[],
): Promise<number> {
  const questions = buildVocabExam(words, blankAnswers, seed, distractorPool);

  const { data: bai, error: baiErr } = await supabase
    .from("assessments")
    .insert({
      user_id: userId,
      type,
      scope,
      parent_id: parentId ?? null,
    })
    .select("id")
    .single();
  if (baiErr) throw baiErr;
  const assessmentId = bai.id as number;

  // `payload` CHỈ mang prompt/options/kind. Đáp án ở lại `ref_id`: chấm điểm về
  // sau đọc lại từ đó qua RPC `answer_for_word`. Ghi đáp án xuống đây là đưa
  // thẳng nó cho client, vì client đọc được payload.
  const { error: itemErr } = await supabase.from("assessment_items").insert(
    questions.map((q, i) => ({
      assessment_id: assessmentId,
      position: i,
      item_type: "vocab",
      ref_id: q.wordId,
      payload: { prompt: q.prompt, options: q.options, kind: q.kind },
    })),
  );
  if (itemErr) throw itemErr;

  return assessmentId;
}

/**
 * Chấm một câu và ghi kết quả. Chấm ở SERVER vì đáp án của câu điền nằm ở
 * `vocab_words.blank_answer`, cột đã bị revoke khỏi `authenticated`.
 */
export async function recordAnswer(
  supabase: SupabaseClient,
  userId: string,
  assessmentId: number,
  position: number,
  answer: string,
): Promise<boolean> {
  const { data: item, error: itemErr } = await supabase
    .from("assessment_items")
    .select("ref_id, payload, user_answer")
    .eq("assessment_id", assessmentId)
    .eq("position", position)
    .single();
  if (itemErr) throw itemErr;

  const kind = (item.payload as { kind: string }).kind;
  let dapAn: string;
  if (kind === "dien") {
    const { data, error } = await supabase.rpc("answer_for_word", { p_word_id: item.ref_id });
    if (error) throw error;
    dapAn = data as string;
  } else {
    const { data, error } = await supabase
      .from("vocab_words").select("word").eq("id", item.ref_id).single();
    if (error) throw error;
    dapAn = data.word as string;
  }

  const dung = answer === dapAn;

  const { error: ghiErr } = await supabase
    .from("assessment_items")
    .update({ user_answer: answer, is_correct: dung })
    .eq("assessment_id", assessmentId)
    .eq("position", position);
  if (ghiErr) throw ghiErr;

  // Chỉ cộng mastery cho lần trả lời ĐẦU TIÊN của câu này. Không có chốt chặn
  // này thì bấm lại một câu đã trả lời sẽ cộng dồn hai lần, và "đã thuộc" đo
  // số lần bấm chứ không đo trí nhớ.
  if (item.user_answer === null) {
    await applyWordMastery(supabase, userId, item.ref_id as number, dung);
  }

  return dung;
}

/**
 * Nộp bài. `finalize_assessment_items` chấm, tính điểm và đóng bài trong ĐÚNG
 * MỘT câu UPDATE — không còn trạng thái trung gian nào quan sát được từ ngoài.
 * `p_now` truyền từ đây chứ không dùng `now()` của Postgres, để cả ứng dụng
 * đọc đồng hồ ở một nguồn duy nhất.
 */
export async function submitExam(
  supabase: SupabaseClient,
  assessmentId: number,
): Promise<{ total: number; correct: number; score: number; passed: boolean }> {
  const { data, error } = await supabase.rpc("finalize_assessment_items", {
    p_assessment_id: assessmentId,
    p_pass_mark: PASS_MARK,
    p_now: new Date().toISOString(),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as { total: number; correct: number; score: number; passed: boolean };
}
