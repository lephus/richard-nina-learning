"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createVocabExam, recordAnswer, submitExam } from "@/lib/exam/run";
import { toVocabLite, type VocabLite } from "@/lib/vocab/word";

/** Một dòng `vocab_words` đọc qua quan hệ nhúng — snake_case, đúng cột `authenticated` đọc được. */
interface VocabWordRow {
  id: number; word: string; pos: string; ipa: string;
  meaning_vi: string; definition_en: string; synonyms: string[];
  example_en: string; example_vi: string;
}
interface LessonWordRow {
  word_id: number;
  vocab_words: VocabWordRow | VocabWordRow[];
}

/** Dựng bài thi cho một buổi rồi chuyển thẳng vào bài. */
export async function batDauBaiThi(lessonId: number): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: lw, error: lwErr } = await supabase
    .from("lesson_words")
    .select("word_id, vocab_words(id, word, pos, ipa, meaning_vi, definition_en, synonyms, example_en, example_vi)")
    .eq("lesson_id", lessonId)
    .order("position");
  if (lwErr) throw lwErr;

  // postgrest-js đôi khi trả quan hệ 1-1 thành MẢNG (không có generic Database
  // trên client để nó suy đúng bản chất FK). Không chuẩn hoá thì ô render rỗng
  // mà không có lỗi nào — đúng cái bẫy ghi ở mục 7 tài liệu bàn giao. Ép qua
  // `unknown` trước vì kiểu postgrest-js suy ra và kiểu tay viết ở đây không
  // giao nhau đủ để TS cho ép thẳng — cùng cách `load-cards.ts` đã làm.
  const rows = (lw ?? []) as unknown as LessonWordRow[];
  const words: VocabLite[] = rows.map((r) => {
    const v = Array.isArray(r.vocab_words) ? r.vocab_words[0] : r.vocab_words;
    if (!v) throw new Error(`thiếu vocab_words cho word_id ${r.word_id}`);
    // Dùng lại `toVocabLite` (lib/vocab/word.ts) thay vì tự tay ánh xạ từng
    // trường: nó đã quy đúng `blankAnswer: ""` (cột bị revoke khỏi
    // `authenticated`, 0004_rls.sql) — bản brief gốc tự dựng object tay và bỏ
    // sót trường bắt buộc này, `tsc` từ chối biên dịch (TS2322: thiếu
    // `blankAnswer`).
    return toVocabLite(v);
  });

  const { data: blanks, error: blankErr } = await supabase
    .rpc("blank_answers_for_lesson", { p_lesson_id: lessonId });
  if (blankErr) throw blankErr;
  // RPC trả về MỘT object JSONB — `jsonb_object_agg(v.id::text, v.blank_answer)`
  // (0007_assessment_parent.sql:50-60) — KHÔNG PHẢI mảng {word_id, blank_answer}[].
  // Bản brief ban đầu coi nó là mảng rồi gọi `.map()` thẳng lên — `.map` không
  // tồn tại trên một object thường, nên đó là TypeError ngay khi chạy, không
  // phải chuyện biên dịch qua rồi mới sai. `loadCards` (lib/vocab/load-cards.ts)
  // gọi ĐÚNG RPC này và đã đọc nó đúng hình dạng object — quy về `Map<number,
  // string>` bằng `Object.entries` cho khớp chữ ký `blankAnswers` mà
  // `buildVocabExam` (qua `createVocabExam`) đòi.
  const bang = new Map(
    Object.entries(blanks as Record<string, string>).map(
      ([wordId, blankAnswer]) => [Number(wordId), blankAnswer] as [number, string],
    ),
  );

  const id = await createVocabExam(
    supabase, user.id, "lesson", [lessonId], words, bang, Date.now(),
  );
  redirect(`/exam/${id}`);
}

export async function traLoi(
  assessmentId: number, position: number, answer: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return recordAnswer(supabase, user.id, assessmentId, position, answer);
}

export async function nopBai(assessmentId: number): Promise<void> {
  const supabase = await createClient();
  await submitExam(supabase, assessmentId);
  redirect(`/exam/${assessmentId}/ket-qua`);
}
