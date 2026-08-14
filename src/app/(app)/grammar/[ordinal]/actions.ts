"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { danhTinhNguoiDung } from "@/lib/supabase/danh-tinh";
import { baiDangLamCua, timHoacDungBaiNguPhap } from "@/lib/exam/run";
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
  const user = await danhTinhNguoiDung(supabase);
  if (!user) redirect("/login");

  // SỬA Ở VÒNG SOÁT CUỐI lát 2d (mục 6, IMPORTANT): tấm chắn SỚM mà CẢ HAI
  // hàm chị em (`batDauBaiThi`, `batDauOnTap` — `exam/[id]/actions.ts`) đều có
  // TRƯỚC bản vá này bị THIẾU ở đây. Hệ quả: một học viên bỏ dở BẤT KỲ bài nào
  // (kể cả vocab) rồi bấm LÀM BÀI ở một bài ngữ pháp phải trả giá TOÀN BỘ chi
  // phí dựng đề (đọc hết câu hỏi + tới 100 round-trip RPC `answer_for_question`
  // bên dưới) trước khi `timHoacDungBaiNguPhap` mới phát hiện ra đã có bài
  // đang làm dở và huỷ bỏ hết công đó — bấm nút "LÀM BÀI" ở bài 100 câu tốn
  // gần trăm vòng mạng chỉ để bị redirect đi nơi khác. Kiểm TRƯỚC, y hệt hai
  // hàm chị em: nhánh "làm tiếp" (case thường gặp nhất của bẫy bỏ dở bài, yêu
  // cầu C bàn giao) không còn phải trả giá bất kỳ vòng mạng nào trong số đó.
  // Đây là một TỐI ƯU đặt CHỒNG lên trên sự đúng đắn mà `timHoacDungBaiNguPhap`
  // bên dưới tự đảm bảo được ngay cả khi thiếu bước này (nó tự kiểm lại) —
  // không phải điều kiện bắt buộc để tránh 23505.
  //
  // Kèm `tuLoai=grammar&tuBuoi=${ordinal}` khi redirect vào một bài `in_progress`
  // CÓ SẴN — cùng khuôn hai hàm chị em: `/exam/[id]` (page.tsx) đọc lại hai
  // tham số này để biết có phải người học đang bị đưa vào MỘT BÀI KHÁC (loại
  // khác, hoặc bài ngữ pháp khác) với thứ họ vừa bấm hay không, và cảnh báo rõ
  // thay vì im lặng (mục 2 vòng soát cuối — trước bản vá này, `batDauBaiNguPhap`
  // là hàm bấm-ra-bài DUY NHẤT không đính kèm cặp tham số này, nên hướng vocab
  // → grammar luôn cảnh báo, còn hướng grammar → vocab luôn im lặng, một sự
  // BẤT ĐỐI XỨNG không có lý do kỹ thuật nào biện minh được).
  const dangLam = await baiDangLamCua(supabase, user.id);
  if (dangLam !== null) redirect(`/exam/${dangLam}?tuLoai=grammar&tuBuoi=${ordinal}`);

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
  //
  // VÒNG SOÁT CUỐI (mục 6, IMPORTANT) — CÂN NHẮC BỎ vòng lặp RPC này, KHÔNG
  // bỏ được, ghi lại lý do thay vì lặng lẽ giữ nguyên: tấm chắn sớm
  // (`baiDangLamCua`) thêm ở trên đã cắt hết chi phí này cho nhánh "làm tiếp
  // bài cũ" — nhánh CÒN LẠI (dựng bài MỚI thật sự) vẫn cần tới N vòng RPC vì
  // BA lý do cộng dồn, không lý do nào tự nó đủ:
  //   1. RLS (`0004_rls.sql:46-48`) revoke cột `answer` khỏi vai `authenticated`
  //      — đã THỬ THẬT ở trên, không suy đoán — nên không có cách nào đọc
  //      thẳng nó bằng một SELECT duy nhất từ client này.
  //   2. Bàn giao lát này CẤM đổi schema, nên không thể thêm một RPC GỘP kiểu
  //      `answers_for_lesson(lesson_id)` để thay N cuộc gọi bằng một — con
  //      đường TỰ NHIÊN nhất để giảm chi phí mạng lại chính là con đường bị
  //      cấm.
  //   3. `buildGrammarExam` (Task 2, `src/lib/exam/build-grammar.ts`) đòi
  //      `GrammarQuestionLite.answer` là THAM SỐ BẮT BUỘC của chữ ký hàm — đây
  //      là hàm THUẦN đã kiểm kỹ trên cả 537 câu thật
  //      (`tests/exam-build-grammar.test.ts`), và chính khẳng định "đáp án là
  //      CHỮ HIỂN THỊ đúng, suy từ chữ cái A–D" của bộ test đó là thứ đang giữ
  //      cho phép biến đổi chữ cái ↔ chữ hiển thị không âm thầm sai. Đổi chữ ký
  //      để KHÔNG đòi `answer` nữa (ví dụ chỉ nhận `id/stem/options`) sẽ xoá
  //      luôn khẳng định đó khỏi test — ĐÚNG nghĩa "làm yếu một khẳng định" mà
  //      bàn giao dặn không được làm để đổi lấy tốc độ. Truyền một chữ cái giả
  //      cố định (ví dụ luôn `"A"`) để né vòng lặp còn TỆ hơn: bounds-check
  //      trong `buildGrammarExam` sẽ LUÔN qua một cách vô nghĩa (không còn
  //      kiểm tra gì thật về dữ liệu của CHÍNH lượt dựng đề này nữa).
  // Kết luận: giữ nguyên vòng lặp RPC cho nhánh dựng bài MỚI — tấm chắn sớm ở
  // trên đã loại bỏ phần lớn chi phí này khỏi đường đi PHỔ BIẾN NHẤT (bấm LÀM
  // BÀI trong khi còn bài dang dở), và phần còn lại không gỡ được nếu không vi
  // phạm một trong hai ràng buộc bàn giao (không đổi schema, không làm yếu
  // assertion).
  // `.order("id")` — SỬA Ở VÒNG SOÁT CUỐI (mục minor): thiếu order thì thứ tự
  // hàng trả về là thứ tự VẬT LÝ không cam kết của Postgres, có thể đổi giữa
  // hai lần gọi (autovacuum, index khác được chọn…). `buildGrammarExam` gọi
  // `seededShuffle(questions, seed)` — một xáo trộn Fisher-Yates THEO VỊ TRÍ
  // mảng đầu vào (`src/content/shuffle-options.ts`), không theo khoá nào của
  // từng câu — nên "cùng seed cho cùng đề" (đã kiểm ở
  // `tests/exam-build-grammar.test.ts`) chỉ đúng khi mảng ĐẦU VÀO cũng cùng
  // thứ tự mỗi lần gọi. Neo thứ tự đó vào `id` (khoá chính, ổn định) để tính
  // tất định thật sự nằm ở tầng ứng dụng, không mượn một hành vi Postgres
  // không được đảm bảo.
  const { data: rows, error: cauErr } = await supabase
    .from("grammar_questions")
    .select("id, stem, options")
    .eq("lesson_id", grammarLessonId)
    .order("id");
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
