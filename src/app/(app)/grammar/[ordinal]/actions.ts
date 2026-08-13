"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { timHoacDungBaiNguPhap } from "@/lib/exam/run";
import type { GrammarQuestionLite } from "@/lib/exam/build-grammar";

/**
 * Dựng bài thi cho MỘT bài ngữ pháp rồi chuyển thẳng vào bài — nút "LÀM BÀI"
 * ở `/grammar/[ordinal]` (page.tsx) đi qua đúng đường này.
 *
 * `ordinal` là số 1..20 của `grammar_lessons.ordinal` (route param đã được
 * `page.tsx` kiểm biên trước khi gọi tới đây) — KHÔNG phải `grammar_lessons.id`.
 * Tra `id` thật ở đây (cột `assessments.grammar_lesson_id` là FK tới `id`,
 * không phải `ordinal` — xem chú thích tại `createGrammarExam`,
 * `src/lib/exam/run.ts`), đúng ĐÚNG bẫy `lessons.id`/`ordinal` mà Task 3 đã
 * ghi lại và cố tình không lặp lại cho ngữ pháp.
 */
export async function batDauBaiNguPhap(ordinal: number): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: bai, error: baiErr } = await supabase
    .from("grammar_lessons")
    .select("id")
    .eq("ordinal", ordinal)
    .single();
  if (baiErr) throw baiErr;
  const grammarLessonId = bai.id as number;

  // Lấy TOÀN BỘ câu hỏi của bài — `buildGrammarExam` (gọi bên trong
  // `createGrammarExam`) không cắt bớt, không lấy mẫu (mục 3.3 spec phase 2:
  // "= số câu có sẵn của bài").
  //
  // KHÔNG chọn cột `answer` ở đây — khác hẳn `tests/exam-grammar.test.ts`
  // (đọc được `answer` vì nó dùng client SERVICE ROLE, `admin`). `supabase` ở
  // đây là client của CHÍNH người dùng (phiên đăng nhập qua cookie), chạy
  // dưới vai `authenticated` — vai này CHỈ được cấp `select (id, lesson_id,
  // stem, options)` trên `grammar_questions`
  // (`0004_rls.sql:46-48`, chú thích tại chỗ: "answer, explanation chi server
  // doc"). Đã THỬ THẬT (không suy đoán): chọn thêm `answer` ở đây làm request
  // chết với lỗi 42501 ("permission denied for table grammar_questions") —
  // bắt được ngay ở vòng RED→GREEN của `e2e/grammar.spec.ts` (kịch bản "Làm
  // bài"), một phát hiện MỚI mà không brief/thiết kế nào của lát này lường
  // trước: `buildGrammarExam`/`createGrammarExam` (Task 2–3) chỉ được kiểm
  // bằng client ADMIN, chưa từng chạy thử qua một phiên người dùng thật.
  //
  // Task này KHÔNG được đổi schema (cấm tường minh trong bàn giao) nên không
  // thể thêm một RPC gộp kiểu `blank_answers_for_lesson` (vocab) cho ngữ
  // pháp. Thay vào đó, tái dùng RPC `answer_for_question(p_question_id)` ĐÃ
  // CÓ SẴN và ĐÃ được cấp quyền cho `authenticated`
  // (`0006_lesson_position.sql`, cùng hàm `recordAnswer` dùng để CHẤM điểm
  // sau này) — nó chạy `security definer` nên đọc được `answer` bất kể grant
  // cấp cột, và trả về THẲNG chữ hiển thị đúng (không phải chữ cái A-D). Gọi
  // một lần cho MỖI câu (song song — `Promise.all`, không tuần tự, vì bài dài
  // nhất có 100 câu) rồi suy ngược lại chữ cái từ vị trí chữ hiển thị đó nằm
  // trong `options` — chỉ để khớp chữ ký `GrammarQuestionLite.answer` (một
  // chữ cái) mà `buildGrammarExam` (Task 2, đã kiểm trên cả 537 câu, không
  // đụng tới ở đây) đòi hỏi. Giá trị suy ngược này KHÔNG được dùng để CHẤM
  // điểm — `recordAnswer` chấm lại bằng chính RPC này một lần nữa, độc lập,
  // tại thời điểm trả lời — nó chỉ phục vụ bước kiểm biên nội bộ của
  // `buildGrammarExam` và một field trả về mà `createGrammarExam` không bao
  // giờ ghi xuống payload (payload chỉ có prompt/options/kind).
  const { data: rows, error: cauErr } = await supabase
    .from("grammar_questions")
    .select("id, stem, options")
    .eq("lesson_id", grammarLessonId);
  if (cauErr) throw cauErr;

  const questions: GrammarQuestionLite[] = await Promise.all(
    (rows ?? []).map(async (r) => {
      const id = r.id as number;
      const options = r.options as string[];
      const { data: dapAn, error: dapAnErr } = await supabase
        .rpc("answer_for_question", { p_question_id: id });
      if (dapAnErr) throw dapAnErr;
      const chiSo = options.indexOf(dapAn as string);
      if (chiSo === -1) {
        throw new Error(
          `câu hỏi ${id}: đáp án RPC trả về ("${dapAn}") không khớp phương án nào trong options`,
        );
      }
      return {
        id,
        stem: r.stem as string,
        options,
        answer: String.fromCharCode("A".charCodeAt(0) + chiSo),
      };
    }),
  );

  // `timHoacDungBaiNguPhap` chứ không `createGrammarExam` thẳng — đóng đúng
  // bẫy bỏ dở bài (yêu cầu C bàn giao lát 2b, yêu cầu A bàn giao Task 4 lát
  // 2d): chỉ số một-phần `assessments_one_in_progress` không phân biệt
  // loại/`type`, nên bỏ dở BẤT KỲ bài nào (kể cả vocab) rồi bấm LÀM BÀI ngữ
  // pháp mà không qua tấm chắn này sẽ đâm thẳng vào lỗi 23505 thô, khoá học
  // viên ra khỏi MỌI bài thi trong app — xem JSDoc `timHoacDungBai`,
  // `src/lib/exam/run.ts`.
  const id = await timHoacDungBaiNguPhap(supabase, user.id, grammarLessonId, questions, Date.now());
  redirect(`/exam/${id}`);
}
