"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { baiDangLamCua, boBaiDangLam, recordAnswer, submitExam, timHoacDungBaiThi } from "@/lib/exam/run";
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

  // Kiểm TRƯỚC khi dựng bài mới, SỚM nhất có thể — trước cả hai lượt đọc
  // lesson_words/blank_answers_for_lesson bên dưới, để nhánh "làm tiếp" (case
  // thường gặp nhất của bẫy bỏ dở, yêu cầu C bàn giao) không phải trả giá hai
  // vòng mạng vô ích chỉ để rồi redirect. Đây là một TỐI ƯU đặt CHỒNG lên
  // trên sự đúng đắn mà `timHoacDungBaiThi` bên dưới tự đảm bảo được ngay cả
  // khi thiếu bước này (nó tự kiểm lại) — không phải điều kiện bắt buộc để
  // tránh 23505.
  const dangLam = await baiDangLamCua(supabase, user.id);
  if (dangLam !== null) redirect(`/exam/${dangLam}`);

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

  // `timHoacDungBaiThi` chứ không `createVocabExam` thẳng: nó tự kiểm lại
  // (đường đua TOCTOU hiếm — hai request cùng lúc, ví dụ bấm đúp — có thể lọt
  // qua tấm chắn sớm ở trên) và tìm lại đúng bài đã thắng cuộc đua nếu insert
  // vẫn đâm 23505, thay vì để lỗi thô rơi xuống error.tsx.
  const id = await timHoacDungBaiThi(
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

/**
 * Bỏ bài đang làm dở — lối thoát cho người học không muốn làm tiếp bài cũ mà
 * `batDauBaiThi`/`batDauBoTuc` đưa họ vào lại (xem yêu cầu C bàn giao). Đặt ở
 * ngay trang thi (`ExamRunner`, `data-testid="exam-bo-bai"`) vì đó là chỗ
 * người học bị kẹt thật sự đang đứng.
 */
export async function boBaiThi(assessmentId: number): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const scope = await boBaiDangLam(supabase, user.id, assessmentId);
  if (scope === null) {
    // `boBaiDangLam` khớp 0 dòng — CAS trong chính lệnh xoá thua (SỬA SAU
    // VÒNG SOÁT 1, finding 1): bài không còn `in_progress` đúng vào lúc lệnh
    // xoá chạy tới, HOẶC không tồn tại/không phải của người dùng này. Đọc
    // LẠI ở đây (không dùng bất kỳ giá trị nào đọc TRƯỚC lệnh xoá —
    // đó chính là khe hở TOCTOU vừa đóng) để phân biệt hai trường hợp:
    //   - Đã `submitted`: một tab khác vừa nộp giữa lúc người học bấm Bỏ bài
    //     — đưa thẳng sang trang kết quả THẬT của bài đó, đúng tinh thần yêu
    //     cầu C (không để người học rơi vào error.tsx với thông điệp sai
    //     "mất mạng" — finding 3 vòng soát 1 chỉ đích danh chính cái bẫy này).
    //   - Không tìm thấy dòng nào của user_id này: bài không tồn tại/không
    //     phải của mình — ném lỗi thật, không giả vờ thành công.
    const { data: bai, error: baiErr } = await supabase
      .from("assessments")
      .select("status")
      .eq("id", assessmentId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (baiErr) throw baiErr;
    if (bai?.status === "submitted") redirect(`/exam/${assessmentId}/ket-qua`);
    throw new Error(`không bỏ được bài ${assessmentId} — không tồn tại hoặc không phải của bạn`);
  }

  // `scope` rỗng không nên xảy ra (bài lesson/remedial luôn ghi đúng một buổi
  // vào scope, xem createVocabExam) — chặn tường minh thay vì âm thầm điều
  // hướng tới `/vocab/learn/undefined`.
  const lessonId = scope[0];
  if (lessonId === undefined) {
    throw new Error(`bài ${assessmentId} có scope rỗng, không xác định được buổi để quay lại`);
  }
  redirect(`/vocab/learn/${lessonId}`);
}
