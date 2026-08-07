import type { SupabaseClient } from "@supabase/supabase-js";
import { itemAt, TOTAL_ITEMS } from "./item-plan";
import { buildItem, type BuiltItem } from "./build-item";
import { loadContext, secretFor } from "./session";
import { gradeItem } from "./grade";
import { masteryDelta } from "@/lib/mastery/apply";
import {
  lessonStatuses,
  type LessonRow,
  type LessonStatus,
  type ProgressRow,
} from "@/lib/curriculum/lesson-status";

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
  // 0. Buổi phải THẬT SỰ mở khoá mới được chấm — dùng đúng luật dashboard
  //    dùng (lessonStatuses), không tin riêng sự tồn tại của dòng tiến độ.
  //    Đây là điểm thực thi duy nhất: một trang chỉ chặn được giao diện,
  //    còn Server Action gọi được độc lập với mọi trang.
  const { lessons, progressRows } = await loadLessonChain(supabase);
  const forStatus: ProgressRow[] = progressRows.map((r) => ({
    lesson_id: r.lessonId,
    status: r.status,
  }));
  const status = lessonStatuses(lessons, forStatus).get(lessonId);
  if (status !== "available" && status !== "in_progress") {
    throw new Error("buổi chưa mở khoá");
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
    return {
      ok: false,
      position,
      item: position >= TOTAL_ITEMS ? null : buildItem(itemAt(position), ctx),
      done: position >= TOTAL_ITEMS,
    };
  }

  if (position >= TOTAL_ITEMS) {
    return { ok: true, position, item: null, done: true };
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

  // 6. Cập nhật mastery.
  await applyMastery(supabase, userId, item, result.correct);

  // 7. final_correct chỉ đếm trong 15 item chốt buổi — theo spec.kind của
  //    ItemSpec (final-meaning | grammar), KHÔNG theo item.kind của BuiltItem
  //    (một item final-meaning dựng ra BuiltItem có kind "meaning", giống hệt
  //    item luyện tập thường — item.kind không phân biệt được hai loại này).
  const isFinal = spec.kind === "final-meaning" || spec.kind === "grammar";
  const finalCorrect =
    (prog?.finalCorrect ?? 0) + (isFinal && result.correct ? 1 : 0);

  // 4b. Ghi vị trí SO-SÁNH-RỒI-ĐỔI: `.eq("position", position)` biến lượt ghi
  //     thành CAS thật ở tầng database, không chỉ đọc-rồi-ghi ở tầng ứng dụng.
  //     Một yêu cầu trễ (retry) mà request khác đã ghi trước sẽ khớp 0 dòng —
  //     coi như gửi trùng, KHÔNG ghi đè, không chấm lại mastery lần hai.
  const done = nextPosition >= TOTAL_ITEMS;
  const advanced = await advancePosition(supabase, userId, lessonId, position, nextPosition, finalCorrect, done);
  if (!advanced) return staleResult(supabase, userId, lessonId, ctx);

  return {
    ok: true,
    correct: result.correct,
    correctAnswer: result.correctAnswer,
    position: nextPosition,
    item: done ? null : buildItem(itemAt(nextPosition), ctx),
    done,
    score: done ? Math.round((finalCorrect / 15) * 100) : undefined,
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
): Promise<{ lessons: LessonRow[]; progressRows: OwnProgressRow[] }> {
  const { data: lessonsData, error: lessonsErr } = await supabase
    .from("lessons").select("id, ordinal").order("ordinal");
  if (lessonsErr) throw lessonsErr;

  const { data: progData, error: progErr } = await supabase
    .from("user_lesson_progress").select("lesson_id, status, position, final_correct");
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
    row.score = Math.round((finalCorrect / 15) * 100);
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

/** Đọc lại trạng thái THẬT từ database sau khi so-sánh-rồi-đổi thất bại, trả về y hệt hình dạng nhánh gửi trùng ở bước 2. */
async function staleResult(
  supabase: SupabaseClient,
  userId: string,
  lessonId: number,
  ctx: Awaited<ReturnType<typeof loadContext>>,
): Promise<SubmitResult> {
  const { data, error } = await supabase
    .from("user_lesson_progress")
    .select("position")
    .eq("user_id", userId)
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (error) throw error;

  const position = (data?.position as number | undefined) ?? 0;
  return {
    ok: false,
    position,
    item: position >= TOTAL_ITEMS ? null : buildItem(itemAt(position), ctx),
    done: position >= TOTAL_ITEMS,
  };
}

async function applyMastery(
  supabase: SupabaseClient,
  userId: string,
  item: BuiltItem,
  correct: boolean,
): Promise<void> {
  if (item.kind === "flashcard") return;

  if (item.kind === "grammar") {
    // grammar_mastery khoá theo grammar_lesson_id, lấy từ chính câu hỏi.
    // Để trống ở lát này — xem chú thích cuối brief Task 5. Lát 1c mới cần
    // tới bảng này cho việc dựng đề bổ túc, và ghi bừa theo question_id
    // (không đúng khoá của bảng) sẽ hỏng dữ liệu chứ không phải bỏ trống.
    return;
  }

  const { data: current, error: currentErr } = await supabase
    .from("word_mastery")
    .select("correct_count, wrong_count, mastered")
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
