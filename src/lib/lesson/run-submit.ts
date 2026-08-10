import type { SupabaseClient } from "@supabase/supabase-js";
import { itemAt, scoreOf, TOTAL_ITEMS } from "./item-plan";
import { buildItem, type BuiltItem } from "./build-item";
import { loadContext, secretFor } from "./session";
import { gradeItem } from "./grade";
// Ghi mastery ĐÃ CHUYỂN sang @/lib/mastery/write ở lát 1c: bài đánh giá cần
// đúng hành vi này, và luật cộng dồn mastery phải có một bản cài đặt duy nhất.
import { applyMastery } from "@/lib/mastery/write";
import {
  lessonStatuses,
  type LessonRow,
  type LessonStatus,
  type ProgressRow,
} from "@/lib/curriculum/lesson-status";
import {
  nextStep,
  toAssessmentRow,
  toLessonDones,
  type AssessmentDbRow,
} from "@/lib/assessment/next-step";

/**
 * Logic chấm bài của một buổi học, tách khỏi `actions.ts` để KIỂM THỬ ĐƯỢC
 * trực tiếp: phần duy nhất không gọi được ngoài request Next.js thật là
 * `createClient()` → `cookies()`. Mọi thứ sau đó nhận phụ thuộc tường minh
 * (client, userId), nên gọi thẳng được từ test bằng client `authenticated`
 * thật — xem tests/lesson-session.test.ts.
 *
 * File này KHÔNG có "use server": nó không phải Server Action, chỉ là hàm
 * thuần server-side nhận client làm tham số. Đặt hàm nhận `SupabaseClient`
 * vào một tệp "use server" sẽ biến nó thành một HTTP endpoint công khai với
 * chữ ký sai — không hợp lệ. Và vì hàm luôn nhận client của NGƯỜI DÙNG (được
 * `actions.ts` cung cấp), tệp này không bao giờ tự tạo client — không có chỗ
 * cho `SUPABASE_SERVICE_ROLE_KEY` lọt vào đây.
 */
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

export async function runSubmit(
  supabase: SupabaseClient,
  userId: string,
  lessonId: number,
  clientPosition: number,
  answer: string,
): Promise<SubmitResult> {
  // 0. Buổi phải ĐANG LÀ slot mà nextStep trỏ tới (hoặc đã completed) mới
  //    được chấm — luật ĐẦY ĐỦ của chuỗi 35 hoạt động, không chỉ luật
  //    buổi→buổi của lessonStatuses. Đây là điểm thực thi THỨ BA trên CÙNG
  //    một lỗ hổng, không phải "điểm duy nhất" như comment cũ từng khẳng
  //    định (Task 7 review vòng 4, finding 1): dashboard chặn được cú BẤM,
  //    learn/[lessonId]/page.tsx chặn được URL gõ tay, nhưng CHÍNH Server
  //    Action này — nơi thật sự ghi user_lesson_progress — gọi được độc lập
  //    với cả hai trang. Trước bản vá này nó chỉ kiểm lessonStatuses
  //    (available/in_progress/completed), không biết gì về các slot ôn
  //    tập/kiểm tra xen giữa: một buổi 3 "available" theo lessonStatuses
  //    (buổi 2 đã completed) vẫn có thể bị chấm cho tới hoàn thành dù ôn
  //    tập(1,2) đứng trước còn dang dở — y hệt lỗ hổng finding A/finding 1
  //    của các vòng review trước, chỉ khác cửa vào.
  //
  //    'completed' PHẢI được cho qua, không cần hỏi nextStep: vì
  //    status='completed' chỉ được ghi CÙNG LÚC với position=135
  //    (advancePosition), completed ⟺ position===135 — chặn 'completed' ở
  //    đây sẽ khiến nhánh position>=TOTAL_ITEMS bên dưới KHÔNG BAO GIỜ chạy
  //    tới, biến một cú double-click vô hại ở câu 135 thành throw vĩnh viễn
  //    (client kẹt ở 135/135, nút vẫn bật, mọi lần thử lại đều lỗi) cho tới
  //    khi tải lại trang.
  const { lessons, progressRows } = await loadLessonChain(supabase, userId);
  const forStatus: ProgressRow[] = progressRows.map((r) => ({
    lesson_id: r.lessonId,
    status: r.status,
  }));
  const statuses = lessonStatuses(lessons, forStatus);
  const status = statuses.get(lessonId);

  if (status !== "completed") {
    const lesson = lessons.find((l) => l.id === lessonId);
    if (!lesson) throw new Error("buổi không tồn tại");

    // Chỉ đọc thêm `assessments` khi THẬT SỰ cần (buổi chưa completed) —
    // lessons/progress đã có sẵn ở trên, không đọc lại (cùng tinh thần hoãn
    // round-trip thừa mà Task 7 review vòng 4 finding 3 chỉ ra cho
    // learn/[lessonId]/page.tsx, dù ở đây bắt buộc thêm MỘT lượt đọc mới vì
    // đây là đường ghi, không có gì trong bộ nhớ để tái dùng).
    const { data: assessRows, error: assessErr } = await supabase
      .from("assessments")
      .select("id, type, scope, status, passed, expires_at, parent_id")
      .eq("user_id", userId);
    if (assessErr) throw assessErr;

    const { action } = nextStep(
      toLessonDones(lessons, statuses),
      ((assessRows ?? []) as AssessmentDbRow[]).map(toAssessmentRow),
      new Date(),
    );
    const isCurrentSlot = action.kind === "lesson" && action.lesson === lesson.ordinal;
    if (!isCurrentSlot) throw new Error("buổi chưa mở khoá");
  }

  // 1. Vị trí thật đọc từ database — KHÔNG tin client. RLS (0004_rls.sql:11-12)
  //    đã giới hạn hàng trả về cho đúng user_id = auth.uid() của phiên này,
  //    nên dòng của chính user này (nếu có) luôn nằm trong progressRows.
  const prog = progressRows.find((r) => r.lessonId === lessonId) ?? null;
  const position = prog?.position ?? 0;
  const ctx = await loadContext(supabase, lessonId, userId);

  // 2. Chốt kiểm tra chống gửi trùng, tuyến đầu: lệch thì không làm gì cả,
  //    không tốn một lượt ghi nào. Đây là kiểm tra Ở TẦNG ỨNG DỤNG — nhanh,
  //    nhưng một mình nó không đủ (xem bước 4b: so-sánh-rồi-đổi ở tầng DB).
  if (clientPosition !== position) {
    const done = position >= TOTAL_ITEMS;
    return {
      ok: false,
      position,
      item: done ? null : buildItem(itemAt(position), ctx),
      done,
      // Buổi đã đóng: kèm điểm, không thì client hiển thị "0%" thay vì điểm
      // thật khi một cú double-click ở câu cuối rơi vào nhánh này.
      score: done ? scoreOf(prog?.finalCorrect ?? 0) : undefined,
    };
  }

  if (position >= TOTAL_ITEMS) {
    return {
      ok: true,
      position,
      item: null,
      done: true,
      score: scoreOf(prog?.finalCorrect ?? 0),
    };
  }

  // 3. Buổi chưa có dòng nào (lần chấm đầu tiên) → tạo trước, KHÔNG đụng dòng
  //    đã có. Tách riêng khỏi bước ghi vị trí ở dưới vì bước đó là ghi
  //    so-sánh-rồi-đổi (cần một dòng đã tồn tại để so khớp `position`).
  if (prog === null) {
    await ensureProgressRow(supabase, userId, lessonId);
  }

  const spec = itemAt(position);
  const nextPosition = position + 1;

  // 4. Thẻ gặp từ: không chấm, không đụng mastery, chỉ đẩy vị trí.
  if (spec.kind === "flashcard") {
    const advanced = await advancePosition(
      supabase, userId, lessonId, position, nextPosition, prog?.finalCorrect ?? 0, false,
    );
    if (!advanced) return staleResult(supabase, userId, lessonId, ctx);
    return {
      ok: true,
      position: nextPosition,
      item: nextPosition >= TOTAL_ITEMS ? null : buildItem(itemAt(nextPosition), ctx),
      done: nextPosition >= TOTAL_ITEMS,
    };
  }

  // 5. Chấm. Đáp án lấy qua RPC security definer — xem migration 0006.
  //    KHÔNG dùng service role: khoá đó không được lên Vercel.
  const correctOption = await secretFor(supabase, spec, ctx);
  const item = buildItem(spec, ctx);
  const result = gradeItem(item, answer, { correctOption });

  // 6. final_correct chỉ đếm trong 15 item chốt buổi — theo spec.kind của
  //    ItemSpec (final-meaning | grammar), KHÔNG theo item.kind của BuiltItem
  //    (một item final-meaning dựng ra BuiltItem có kind "meaning", giống hệt
  //    item luyện tập thường — item.kind không phân biệt được hai loại này).
  const isFinal = spec.kind === "final-meaning" || spec.kind === "grammar";
  const finalCorrect =
    (prog?.finalCorrect ?? 0) + (isFinal && result.correct ? 1 : 0);

  // 4b. Ghi vị trí SO-SÁNH-RỒI-ĐỔI TRƯỚC KHI chấm mastery: `.eq("position",
  //     position)` biến lượt ghi thành CAS thật ở tầng database, không chỉ
  //     đọc-rồi-ghi ở tầng ứng dụng. Một yêu cầu trễ (retry) mà request khác
  //     đã ghi trước sẽ khớp 0 dòng — coi như gửi trùng, KHÔNG ghi đè.
  //
  //     Thứ tự này CỐ Ý: applyMastery (bước 7) đọc rồi ghi word_mastery
  //     bằng giá trị TUYỆT ĐỐI (masteryDelta cộng dồn từ một SELECT trước
  //     đó), không tự CAS. Nếu chạy applyMastery TRƯỚC khi biết CAS có thắng
  //     hay không, request THUA cuộc trong một cặp đua vẫn đọc-sửa-ghi
  //     word_mastery — và cả hai kiểu chen ngang đều hỏng dữ liệu: SELECT
  //     của kẻ thua đọc TRƯỚC UPSERT của kẻ thắng → UPSERT của kẻ thua đè
  //     lên sau, MẤT một lần cộng; đọc SAU UPSERT của kẻ thắng → kẻ thua
  //     cộng thêm lên trên số kẻ thắng đã cộng, ĐẾM ĐÔI một câu trả lời (và
  //     có thể đẩy `mastered` lên sớm). Chỉ chấm mastery SAU KHI CAS xác
  //     nhận mình thắng — kẻ thua return ở dòng dưới, không bao giờ tới bước 7.
  const done = nextPosition >= TOTAL_ITEMS;
  const advanced = await advancePosition(supabase, userId, lessonId, position, nextPosition, finalCorrect, done);
  if (!advanced) return staleResult(supabase, userId, lessonId, ctx);

  // 7. Cập nhật mastery — chỉ tới đây khi CAS ở bước 4b đã thắng.
  await applyMastery(supabase, userId, item, result.correct, ctx.grammarLessonId);

  return {
    ok: true,
    correct: result.correct,
    correctAnswer: result.correctAnswer,
    position: nextPosition,
    item: done ? null : buildItem(itemAt(nextPosition), ctx),
    done,
    score: done ? scoreOf(finalCorrect) : undefined,
  };
}

/** Dòng tiến độ của MỘT buổi, camelCase để dùng nội bộ trong module này. */
interface OwnProgressRow {
  lessonId: number;
  status: LessonStatus;
  position: number;
  finalCorrect: number;
}

/**
 * Đọc TOÀN BỘ 20 buổi và toàn bộ dòng tiến độ của user này trong MỘT lượt,
 * dùng chung cho việc suy trạng thái khoá (lessonStatuses cần cả chuỗi, không
 * chỉ một buổi) và việc đọc vị trí hiện tại của buổi đang chấm.
 */
async function loadLessonChain(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ lessons: LessonRow[]; progressRows: OwnProgressRow[] }> {
  const { data: lessonsData, error: lessonsErr } = await supabase
    .from("lessons").select("id, ordinal").order("ordinal");
  if (lessonsErr) throw lessonsErr;

  // `.eq("user_id", userId)` là BẮT BUỘC, không thừa: RLS lọc đúng khi client
  // là client của người dùng, nhưng cả module này được thiết kế để NHẬN client
  // làm tham số (để test gọi được). Ngày nào đó ai đó truyền vào một client
  // service role — RLS tắt — thì truy vấn không lọc này trả về tiến độ của MỌI
  // người và người học sẽ bị chấm theo vị trí của người khác. Lọc tường minh
  // thì cả hai loại client đều đúng. Cùng lý do ở staleResult và applyMastery.
  const { data: progData, error: progErr } = await supabase
    .from("user_lesson_progress")
    .select("lesson_id, status, position, final_correct")
    .eq("user_id", userId);
  if (progErr) throw progErr;

  const lessons = (lessonsData ?? []) as LessonRow[];
  const progressRows: OwnProgressRow[] = (progData ?? []).map((r) => ({
    lessonId: r.lesson_id as number,
    status: r.status as LessonStatus,
    position: r.position as number,
    finalCorrect: r.final_correct as number,
  }));

  return { lessons, progressRows };
}

/** Tạo dòng tiến độ đầu tiên cho một buổi — KHÔNG đụng dòng đã có (ON CONFLICT DO NOTHING). */
async function ensureProgressRow(
  supabase: SupabaseClient,
  userId: string,
  lessonId: number,
): Promise<void> {
  const { error } = await supabase.from("user_lesson_progress").upsert(
    { user_id: userId, lesson_id: lessonId, position: 0, final_correct: 0, status: "in_progress" },
    { onConflict: "user_id,lesson_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}

/**
 * Ghi vị trí mới CHỈ KHI vị trí trong database vẫn còn đúng bằng
 * `expectedPosition` — so-sánh-rồi-đổi thật ở tầng database (UPDATE ...
 * WHERE position = expectedPosition), không phải đọc-rồi-ghi ở tầng ứng
 * dụng. Trả về false nếu không dòng nào khớp (ai đó đã ghi trước).
 */
async function advancePosition(
  supabase: SupabaseClient,
  userId: string,
  lessonId: number,
  expectedPosition: number,
  nextPosition: number,
  finalCorrect: number,
  done: boolean,
): Promise<boolean> {
  const row: Record<string, unknown> = {
    position: nextPosition,
    final_correct: finalCorrect,
    status: done ? "completed" : "in_progress",
  };
  if (done) {
    row.score = scoreOf(finalCorrect);
    row.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("user_lesson_progress")
    .update(row)
    .eq("user_id", userId)
    .eq("lesson_id", lessonId)
    .eq("position", expectedPosition)
    .select("position");
  if (error) throw error;

  return (data?.length ?? 0) > 0;
}

/**
 * Đọc lại trạng thái THẬT từ database sau khi so-sánh-rồi-đổi thất bại, trả
 * về y hệt hình dạng nhánh gửi trùng ở bước 2 — kể cả `score` khi buổi đã
 * đóng. Đọc `final_correct` TƯƠI ở đây, không dùng biến `finalCorrect` cục
 * bộ đã tính trước CAS: chính vì CAS thua nên giá trị cục bộ đó đã cũ, thuộc
 * về request đã thắng, không phải trạng thái thật hiện tại.
 */
async function staleResult(
  supabase: SupabaseClient,
  userId: string,
  lessonId: number,
  ctx: Awaited<ReturnType<typeof loadContext>>,
): Promise<SubmitResult> {
  const { data, error } = await supabase
    .from("user_lesson_progress")
    .select("position, final_correct")
    .eq("user_id", userId)
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (error) throw error;

  const position = (data?.position as number | undefined) ?? 0;
  const finalCorrect = (data?.final_correct as number | undefined) ?? 0;
  const done = position >= TOTAL_ITEMS;
  return {
    ok: false,
    position,
    item: done ? null : buildItem(itemAt(position), ctx),
    done,
    score: done ? scoreOf(finalCorrect) : undefined,
  };
}
