"use server";

import { createClient } from "@/lib/supabase/server";
import { danhTinhNguoiDung } from "@/lib/supabase/danh-tinh";
import { NOTE_MAX } from "@/lib/vocab/note";

/**
 * Lưu ghi chú của người học cho một từ.
 *
 * Vỏ mỏng: chỉ lo phần không kiểm thử được ngoài request Next.js thật — dựng
 * client từ cookie phiên và xác thực. `user_id` LUÔN lấy từ phiên, không bao
 * giờ nhận từ tham số: đây là một endpoint HTTP công khai, ai cũng gọi được
 * với tham số bất kỳ.
 */
export async function saveNote(wordId: number, body: string): Promise<void> {
  if (!Number.isInteger(wordId) || wordId <= 0) throw new Error("wordId không hợp lệ");
  // Cắt ở đây thay vì để database từ chối: người học gõ quá dài thì mất phần
  // thừa còn hơn mất cả ghi chú vì một lỗi 400 lặng lẽ trên đường lưu nền.
  const clipped = body.slice(0, NOTE_MAX);

  const supabase = await createClient();
  const user = await danhTinhNguoiDung(supabase);
  if (!user) throw new Error("chưa đăng nhập");

  const { error } = await supabase
    .from("word_notes")
    .upsert(
      { user_id: user.id, word_id: wordId, body: clipped, updated_at: new Date().toISOString() },
      { onConflict: "user_id,word_id" },
    );
  if (error) throw error;
}

/**
 * Lưu chỗ đang đọc của một buổi. Gọi ở NỀN mỗi lần đổi thẻ — không bao giờ
 * nằm trên đường bấm, nên một lần lỗi chỉ mất chỗ đánh dấu, không chặn gì.
 */
export async function saveCursor(lessonId: number, wordIndex: number): Promise<void> {
  if (!Number.isInteger(lessonId) || lessonId <= 0) throw new Error("lessonId không hợp lệ");
  if (!Number.isInteger(wordIndex) || wordIndex < 0 || wordIndex > 29) {
    throw new Error("wordIndex ngoài biên 0..29");
  }

  const supabase = await createClient();
  const user = await danhTinhNguoiDung(supabase);
  if (!user) throw new Error("chưa đăng nhập");

  const { error } = await supabase
    .from("lesson_cursor")
    .upsert(
      { user_id: user.id, lesson_id: lessonId, word_index: wordIndex, updated_at: new Date().toISOString() },
      { onConflict: "user_id,lesson_id" },
    );
  if (error) throw error;
}
