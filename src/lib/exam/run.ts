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
    .select("ref_id, payload")
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
    // Chỉ `blank_answer` bị revoke khỏi `authenticated` (0004_rls.sql) —
    // `word` vẫn nằm trong danh sách cột đọc công khai, nên câu "nghĩa" đọc
    // thẳng qua client thường là đủ, không cần vòng qua RPC như câu "điền".
    // Đây là một sự KHÔNG ĐỐI XỨNG có chủ đích giữa hai nhánh, không phải
    // thiếu nhất quán.
    const { data, error } = await supabase
      .from("vocab_words").select("word").eq("id", item.ref_id).single();
    if (error) throw error;
    dapAn = data.word as string;
  }

  const dung = answer === dapAn;

  // CAS NGAY TRONG WHERE (`user_answer` còn NULL) — đây là hàng rào THẬT DUY
  // NHẤT chống cộng mastery hai lần khi hai lệnh gọi recordAnswer cho CÙNG một
  // (assessmentId, position) chạy ĐỒNG THỜI (double-click, client tự gọi lại
  // sau phản hồi chậm, hai tab). Đọc-rồi-quyết-định (đọc `user_answer` ở
  // SELECT phía trên rồi so `=== null`, như bản trước sửa) KHÔNG đủ: cả hai
  // lệnh gọi đều có thể đọc được `null` TRƯỚC KHI lệnh nào ghi xong — kinh
  // điển TOCTOU (time-of-check-to-time-of-use), y hệt bài học đã trả giá ở
  // `finalize_assessment_items` (xem comment đầu 0009_finalize_atomic.sql).
  // Đặt điều kiện `user_answer is null` VÀO NGAY UPDATE khiến chỉ lệnh gọi nào
  // THẮNG cuộc đua ghi mới khớp được dòng, lệnh thua khớp 0 dòng — Postgres tự
  // xử lý phần loại trừ lẫn nhau, không cần khoá gì thêm ở TypeScript.
  //
  // "CÂU TRẢ LỜI ĐẦU TIÊN THẮNG": không có lượt ghi thứ hai vô điều kiện nào
  // ở đây để "sửa lại" một đáp án đã lưu — cố ý CHỈ giữ một luật (đầu tiên
  // thắng) thay vì hai luật chồng nhau, khớp với giao diện vốn không bao giờ
  // cho lùi lại một câu đã trả lời. Lệnh gọi thua cuộc đua vẫn trả về đúng/sai
  // của CHÍNH đáp án nó vừa nộp (không phải đáp án đã lưu trong DB) — người
  // gọi chỉ dùng giá trị này để hiện dải "câu trước: đúng/sai" mang tính tham
  // khảo, không dùng để quyết định có ghi hay không.
  const { data: updated, error: ghiErr } = await supabase
    .from("assessment_items")
    .update({ user_answer: answer, is_correct: dung })
    .eq("assessment_id", assessmentId)
    .eq("position", position)
    .is("user_answer", null)
    .select("id");
  if (ghiErr) throw ghiErr;

  // Chỉ cộng mastery khi CHÍNH lệnh gọi này thắng cuộc đua ghi ở trên (có dòng
  // trong `updated`). 0 dòng nghĩa là một lệnh gọi khác đã ghi trước — dù đó
  // là một lượt trả lời lại TUẦN TỰ (bấm lại sau khi đã có đáp án) hay một
  // lệnh gọi ĐỒNG THỜI vừa thắng — cả hai trường hợp đều không được cộng
  // thêm, vì cả hai đều không phải "lần trả lời đầu tiên" của câu này nữa.
  if (updated && updated.length > 0) {
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
