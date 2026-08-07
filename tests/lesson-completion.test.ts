// Bản gốc của tệp này (theo brief Task 5) chỉ mô phỏng submitAnswer bằng ghi
// thẳng qua service role — review sau đó chỉ ra: xoá hết session.ts/actions.ts
// đi thì tệp này VẪN xanh, vì import duy nhất từ src/ là itemAt/TOTAL_ITEMS
// (đã có từ Task 1), và assertion đầu đọc lại đúng giá trị nó vừa ghi mười
// một dòng trước đó — chỉ xác nhận Postgres lưu đúng cái mình ghi.
//
// Tệp này thay bằng test THẬT: gọi thẳng `runSubmit` — lõi của submitAnswer,
// tách ra ở src/lib/lesson/run-submit.ts đúng để gọi được ngoài request
// Next.js (phần duy nhất không gọi được ngoài request thật là
// createClient() → cookies(), và runSubmit không đụng tới nó) — bằng một
// client `authenticated` THẬT (đăng nhập qua anon key), qua đúng RLS người
// dùng thật sẽ chạy dưới, không phải service role.
//
// Mỗi ca tự gieo trạng thái xuất phát bằng service role (đúng vai trò của
// service role trong test: dựng dữ liệu, không phải chạy code đang kiểm thử)
// rồi gọi runSubmit bằng client thường, rồi đọc lại bằng service role để xác
// nhận đúng những gì đã ghi (hoặc đúng những gì KHÔNG được ghi).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { itemAt, TOTAL_ITEMS } from "@/lib/lesson/item-plan";
import { loadContext, secretFor } from "@/lib/lesson/session";
import { runSubmit } from "@/lib/lesson/run-submit";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(URL && ANON && SERVICE);

describe.skipIf(!hasEnv)("runSubmit — lõi của submitAnswer, gọi thật", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "noop", {
    auth: { persistSession: false },
  });
  const email = `lesson-run-${Date.now()}@test.local`;
  const password = "lesson-run-pass-1234";
  let user: SupabaseClient;
  let userId = "";
  let lesson1 = 0;
  let lesson2 = 0;
  let ctx: Awaited<ReturnType<typeof loadContext>>;

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: "Người chạy runSubmit" },
    });
    if (error) throw error;
    userId = data.user!.id;

    user = createClient(URL!, ANON!);
    const { error: signInErr } = await user.auth.signInWithPassword({ email, password });
    if (signInErr) throw signInErr;

    const { data: ls } = await admin
      .from("lessons").select("id, ordinal").in("ordinal", [1, 2]).order("ordinal");
    lesson1 = ls![0]!.id;
    lesson2 = ls![1]!.id;

    ctx = await loadContext(user, lesson1, userId);
  });

  // Mỗi ca tự gieo trạng thái xuất phát ở buổi 1 — xoá sạch giữa các ca để
  // upsert gieo trạng thái không kế thừa cột còn sót (score, completed_at)
  // từ ca trước.
  afterEach(async () => {
    await admin.from("word_mastery").delete().eq("user_id", userId);
    await admin.from("user_lesson_progress").delete().eq("user_id", userId).eq("lesson_id", lesson1);
  });

  // CHỈ xoá theo user_id của chính tài khoản này — xem Global Constraints.
  afterAll(async () => {
    if (userId) {
      await admin.from("word_mastery").delete().eq("user_id", userId);
      await admin.from("grammar_mastery").delete().eq("user_id", userId);
      await admin.from("user_lesson_progress").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  async function seed(position: number, finalCorrect: number): Promise<void> {
    const { error } = await admin.from("user_lesson_progress").upsert(
      { user_id: userId, lesson_id: lesson1, position, final_correct: finalCorrect, status: "in_progress" },
      { onConflict: "user_id,lesson_id" },
    );
    if (error) throw error;
  }

  it("vị trí client lệch database → ok:false, dòng tiến độ KHÔNG đổi", async () => {
    await seed(50, 3);

    const result = await runSubmit(user, userId, lesson1, 49, "bat-ky-cau-tra-loi-nao");
    expect(result.ok).toBe(false);
    expect(result.position).toBe(50);
    expect(result.done).toBe(false);

    const { data: row } = await admin.from("user_lesson_progress")
      .select("position, final_correct").eq("user_id", userId).eq("lesson_id", lesson1).single();
    expect(row).toEqual({ position: 50, final_correct: 3 });
  });

  it("lần chấm đầu tiên của buổi (chưa từng có dòng tiến độ): tự tạo dòng rồi ghi vị trí đầu", async () => {
    // KHÔNG gọi seed() — mô phỏng đúng cú bấm ĐẦU TIÊN của buổi, khi
    // user_lesson_progress chưa có dòng nào cho (user, buổi 1). Đây là nhánh
    // "insert-if-missing" của Finding 2 (ensureProgressRow) — nếu nó không
    // chạy, so-sánh-rồi-đổi ở advancePosition sẽ khớp 0 dòng vì chưa có
    // dòng nào để so khớp, và buổi sẽ không bao giờ bắt đầu được.
    const { data: before } = await admin.from("user_lesson_progress")
      .select("lesson_id").eq("user_id", userId).eq("lesson_id", lesson1);
    expect(before).toEqual([]); // xác nhận thật sự chưa có dòng nào trước khi gọi

    const spec = itemAt(0);
    expect(spec.kind).toBe("flashcard");
    const result = await runSubmit(user, userId, lesson1, 0, "bat-ky-cau-tra-loi-nao");

    expect(result.ok).toBe(true);
    expect(result.position).toBe(1);
    expect(result.done).toBe(false);

    const { data: row } = await admin.from("user_lesson_progress")
      .select("position, final_correct, status")
      .eq("user_id", userId).eq("lesson_id", lesson1).single();
    expect(row).toEqual({ position: 1, final_correct: 0, status: "in_progress" });
  });

  it("thẻ gặp từ: đẩy vị trí, KHÔNG chấm, KHÔNG đụng word_mastery", async () => {
    const spec = itemAt(0);
    expect(spec.kind).toBe("flashcard");
    await seed(0, 0);

    const result = await runSubmit(user, userId, lesson1, 0, "bat-ky-cau-tra-loi-nao");
    expect(result.ok).toBe(true);
    expect(result.position).toBe(1);
    expect(result.done).toBe(false);
    expect(result.correct).toBeUndefined();

    const wordId = ctx.lessonWords[spec.index]!.id;
    const { data: wm } = await admin.from("word_mastery")
      .select("*").eq("user_id", userId).eq("word_id", wordId).maybeSingle();
    expect(wm).toBeNull();
  });

  it("final_correct KHÔNG đổi ở item luyện tập (vị trí 0–119) dù trả lời đúng", async () => {
    const position = 100;
    const spec = itemAt(position);
    expect(spec.kind).not.toBe("flashcard"); // xác nhận đây là item được chấm, không phải thẻ gặp từ

    await seed(position, 5);
    const correctAnswer = await secretFor(user, spec, ctx);
    const result = await runSubmit(user, userId, lesson1, position, correctAnswer);

    expect(result.ok).toBe(true);
    expect(result.correct).toBe(true);
    expect(result.position).toBe(position + 1);

    const { data: row } = await admin.from("user_lesson_progress")
      .select("final_correct").eq("user_id", userId).eq("lesson_id", lesson1).single();
    expect(row!.final_correct).toBe(5); // không tăng, dù trả lời đúng
  });

  it("final_correct TĂNG ở item chốt buổi (vị trí 120–134) khi trả lời đúng", async () => {
    const position = 120;
    const spec = itemAt(position);
    expect(spec.kind).toBe("final-meaning");

    await seed(position, 5);
    const correctAnswer = await secretFor(user, spec, ctx);
    const result = await runSubmit(user, userId, lesson1, position, correctAnswer);

    expect(result.ok).toBe(true);
    expect(result.correct).toBe(true);

    const { data: row } = await admin.from("user_lesson_progress")
      .select("final_correct").eq("user_id", userId).eq("lesson_id", lesson1).single();
    expect(row!.final_correct).toBe(6);
  });

  it("trả lời đúng item cuối (134): đóng buổi — status/score/completed_at được ghi, buổi 2 mở khoá", async () => {
    const position = TOTAL_ITEMS - 1; // 134
    const spec = itemAt(position);
    expect(spec.kind).toBe("grammar");

    await seed(position, 14); // 14/14 câu chốt trước đó đã đúng
    const correctAnswer = await secretFor(user, spec, ctx);
    const result = await runSubmit(user, userId, lesson1, position, correctAnswer);

    expect(result.ok).toBe(true);
    expect(result.done).toBe(true);
    expect(result.position).toBe(TOTAL_ITEMS);
    expect(result.item).toBeNull();
    expect(result.score).toBe(100);

    const { data: row } = await admin.from("user_lesson_progress")
      .select("status, score, position, completed_at")
      .eq("user_id", userId).eq("lesson_id", lesson1).single();
    expect(row!.status).toBe("completed");
    expect(row!.score).toBe(100);
    expect(row!.position).toBe(135);
    expect(row!.completed_at).not.toBeNull();

    // Buổi 2 chưa có dòng nào — lessonStatuses suy ra 'available' vì buổi 1 xong.
    const { data: l2 } = await admin
      .from("user_lesson_progress").select("lesson_id")
      .eq("user_id", userId).eq("lesson_id", lesson2);
    expect(l2).toEqual([]);
  });

  it("buổi đang khoá: runSubmit từ chối, không tạo dòng tiến độ nào", async () => {
    // afterEach của ca trước đã xoá dòng buổi 1; ca này không tự ghi buổi 2 —
    // nên với chuỗi suy diễn của lessonStatuses, buổi 3 phải đang khoá
    // (buổi 1 → 'available' vì chưa có dòng, buổi 2 → 'locked' vì buổi 1
    // chưa 'completed', buổi 3 → 'locked' theo sau buổi 2).
    const { data: l3 } = await admin.from("lessons").select("id").eq("ordinal", 3).single();
    const lesson3 = l3!.id as number;

    await expect(runSubmit(user, userId, lesson3, 0, "bat-ky-cau-tra-loi-nao")).rejects.toThrow();

    const { data: row } = await admin.from("user_lesson_progress")
      .select("lesson_id").eq("user_id", userId).eq("lesson_id", lesson3);
    expect(row).toEqual([]);
  });

  it("hai yêu cầu đua nhau từ CÙNG vị trí: chỉ một được ghi, vị trí không bị đẩy lùi hay vượt quá 1 bước", async () => {
    // Mô phỏng đúng kịch bản Finding 2: hai request cùng tin mình đang ở vị
    // trí `position` (double-click, hoặc request gốc + một lần thử lại).
    // Nếu lượt ghi vị trí chỉ là đọc-rồi-ghi (upsert mù), request đến sau có
    // thể đẩy lùi hoặc ghi đè vị trí request đến trước vừa lập. So-sánh-rồi-
    // đổi ở tầng database (advancePosition's `.eq("position", expected)`)
    // phải đảm bảo: đúng MỘT request khớp WHERE và thắng, request kia khớp 0
    // dòng, không ghi gì, trả về ok:false với trạng thái THẬT sau khi thua.
    const position = 60;
    const spec = itemAt(position);
    expect(spec.kind).not.toBe("flashcard");
    // Phải là item chấm mastery theo TỪ (không phải grammar) để phép kiểm
    // word_mastery bên dưới thật sự bắt được lỗi đếm đôi/mất cập nhật.
    expect(["meaning", "synonym", "fill"]).toContain(spec.kind);

    await seed(position, 2);
    const correctAnswer = await secretFor(user, spec, ctx);

    const [r1, r2] = await Promise.all([
      runSubmit(user, userId, lesson1, position, correctAnswer),
      runSubmit(user, userId, lesson1, position, correctAnswer),
    ]);

    const results = [r1, r2];
    const won = results.filter((r) => r.ok && r.position === position + 1);
    const lost = results.filter((r) => !r.ok);
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    // Request thua phải thấy đúng vị trí THẬT (đã bị request thắng đẩy lên),
    // không phải vị trí cũ nó đã gửi — đây là bằng chứng nó KHÔNG ghi đè.
    expect(lost[0]!.position).toBe(position + 1);

    const { data: row } = await admin.from("user_lesson_progress")
      .select("position").eq("user_id", userId).eq("lesson_id", lesson1).single();
    // Đúng MỘT bước, không phải 0 (cả hai đều thua, kẹt) hay 2 (cả hai đều
    // thắng, đẩy vị trí vượt quá một item cho một lần trả lời).
    expect(row!.position).toBe(position + 1);

    // word_mastery phải tăng ĐÚNG MỘT LẦN — kẻ thua trong CAS không được
    // chấm mastery. Nếu applyMastery vẫn chạy trước CAS (bug đã sửa), số
    // này có thể là 2 (đếm đôi) hoặc 0 (kẻ thua ghi đè mất cập nhật của kẻ
    // thắng), tuỳ SELECT của kẻ thua chen vào trước hay sau UPSERT của kẻ
    // thắng.
    const wordId = ctx.lessonWords[spec.index]!.id;
    const { data: wm } = await admin.from("word_mastery")
      .select("correct_count, wrong_count")
      .eq("user_id", userId).eq("word_id", wordId).maybeSingle();
    expect(wm).toEqual({ correct_count: 1, wrong_count: 0 });
  });

  it("buổi đã đóng, gọi lại đúng vị trí 135: đi qua nhánh sẵn có (không throw), trả điểm THẬT", async () => {
    // Trước fix: cổng khoá từ chối status='completed', nên lần gọi lại này
    // (ví dụ trang tải lại rồi tự động gọi lại) sẽ throw thay vì đi vào
    // nhánh position>=TOTAL_ITEMS đã có sẵn.
    await admin.from("user_lesson_progress").upsert(
      {
        user_id: userId, lesson_id: lesson1, position: TOTAL_ITEMS,
        final_correct: 12, status: "completed", score: 80,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,lesson_id" },
    );

    const result = await runSubmit(user, userId, lesson1, TOTAL_ITEMS, "bat-ky-cau-tra-loi-nao");
    expect(result.ok).toBe(true);
    expect(result.done).toBe(true);
    expect(result.item).toBeNull();
    expect(result.score).toBe(80); // round(12/15*100)
  });

  it("buổi đã đóng, double-click gửi vị trí cũ: ok:false nhưng vẫn kèm điểm THẬT, không phải 0%", async () => {
    await admin.from("user_lesson_progress").upsert(
      {
        user_id: userId, lesson_id: lesson1, position: TOTAL_ITEMS,
        final_correct: 15, status: "completed", score: 100,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,lesson_id" },
    );

    // Client vẫn tưởng mình đang ở câu cuối (134) — ví dụ double-click gửi
    // request thứ hai với vị trí cũ, trong khi request thứ nhất đã đóng buổi.
    const result = await runSubmit(user, userId, lesson1, TOTAL_ITEMS - 1, "bat-ky-cau-tra-loi-nao");
    expect(result.ok).toBe(false);
    expect(result.done).toBe(true);
    expect(result.position).toBe(TOTAL_ITEMS);
    expect(result.score).toBe(100); // KHÔNG phải undefined — client hiển thị score ?? 0
  });
});
