import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildGrammarExam, type GrammarExamQuestion, type GrammarQuestionLite } from "@/lib/exam/build-grammar";
import { createGrammarExam, recordAnswer } from "@/lib/exam/run";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const hasEnv = Boolean(URL && SERVICE && ANON);

/**
 * KHÔNG khớp brief nguyên văn ở MỘT điểm, đã kiểm chứng thật trên database
 * trước khi viết test này (không phải suy đoán) — xem báo cáo Task 3 mục
 * "Điều không khớp với brief" để có đầy đủ bằng chứng:
 *
 * Brief (task-3-brief.md, kế thừa từ design doc) nói bài ngữ pháp ghi
 * `scope = [ordinal]` và `grammarLessonId` (dùng để ghi `grammar_mastery`)
 * "lấy từ `scope[0]` của bài thi". Thực tế schema sống đã KHÔNG còn như vậy
 * từ `0010_phase2_reset.sql:76-84` (lát 2a, TRƯỚC lát 2d) — migration đó tự
 * ghi lý do bằng lời: "KHONG nhet id bai ngu phap vao `scope int[]`: scope
 * dang mang ordinal buoi tu vung (1..20), con id bai ngu phap la mot he so
 * hoan toan khac. Tron hai he vao mot cot la loi khong bao, khong vo, chi
 * sai" — rồi dựng riêng cột `assessments.grammar_lesson_id` (FK tới
 * `grammar_lessons.id`) kèm ràng buộc CHECK
 * `assessments_grammar_scope: (type = 'grammar') = (grammar_lesson_id is not
 * null)`. Đã INSERT thật (dùng service role, một user tạm, xoá ngay sau) một
 * dòng `type: 'grammar', scope: [1]` KHÔNG kèm `grammar_lesson_id` để xác
 * nhận: Postgres từ chối ngay với lỗi 23514 (`violates check constraint
 * "assessments_grammar_scope"`) — INSERT theo đúng câu chữ brief không bao
 * giờ thành công được, không phải một khả năng lý thuyết.
 *
 * Vì vậy `createGrammarExam` ở đây ghi `scope: []` (khớp giả định đã có sẵn
 * từ TRƯỚC lát này ở `src/lib/stats/compute.ts` — "bài ngữ pháp có mảng
 * rỗng") và ghi danh tính bài ngữ pháp vào CHÍNH cột được dựng riêng cho việc
 * đó — `grammar_lesson_id`. `recordAnswer` đọc `grammarLessonId` từ CỘT đó
 * (qua quan hệ nhúng `assessments(...)`), không phải từ `scope[0]` (luôn rỗng
 * nên không đọc được gì) — vẫn giữ đúng tinh thần cái bẫy brief cảnh báo
 * ("không suy `grammarLessonId` từ `ref_id`"), chỉ khác NGUỒN đọc cho khớp
 * với cột thật đã tồn tại trong database.
 */
describe.skipIf(!hasEnv)("bài thi ngữ pháp", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "x", {
    auth: { persistSession: false },
  });

  // Bài "cấu trúc câu" (ordinal 1) — 20 câu, bài NHỎ NHẤT trong 20 bài (xem
  // task-2-report.md) — chọn để test chạy nhanh, vì buildGrammarExam lấy
  // TOÀN BỘ câu của một bài, không cắt bớt.
  let grammarLessonId = 0;
  let questions: GrammarQuestionLite[] = [];

  const nguoiDungDaTao: string[] = [];

  async function taoNguoiDung(nhan: string) {
    const email = `exam-grammar-${nhan}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password: "test-pass-1234", email_confirm: true,
    });
    if (error) throw error;
    nguoiDungDaTao.push(data.user.id);
    const c = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password: "test-pass-1234" });
    return { client: c, id: data.user.id };
  }

  /** Dựng một bài ngữ pháp thật cho một người dùng, trả kèm đề đã dựng (để biết đáp án đúng). */
  async function taoBaiNguPhap(
    client: SupabaseClient,
    userId: string,
    seed: number,
  ): Promise<{ baiId: number; cauHoi: GrammarExamQuestion[] }> {
    const baiId = await createGrammarExam(client, userId, grammarLessonId, questions, seed);
    const cauHoi = buildGrammarExam(questions, seed);
    return { baiId, cauHoi };
  }

  beforeAll(async () => {
    const { data: lesson, error: lessonErr } = await admin
      .from("grammar_lessons")
      .select("id, ordinal")
      .eq("ordinal", 1)
      .single();
    if (lessonErr) throw lessonErr;
    grammarLessonId = lesson.id as number;

    const { data: rows, error: qErr } = await admin
      .from("grammar_questions")
      .select("id, stem, options, answer")
      .eq("lesson_id", grammarLessonId);
    if (qErr) throw qErr;
    questions = (rows ?? []).map((r) => ({
      id: r.id as number,
      stem: r.stem as string,
      options: r.options as string[],
      answer: r.answer as string,
    }));
    // Bài "cấu trúc câu" phải có đúng 20 câu theo dữ liệu thật đã kiểm ở Task 2 —
    // nổ sớm ở đây (thay vì để các test bên dưới đỏ khó hiểu) nếu dữ liệu lệch.
    expect(questions.length).toBe(20);
  });

  afterAll(async () => {
    for (const id of nguoiDungDaTao) {
      await admin.from("assessments").delete().eq("user_id", id);
      await admin.from("grammar_mastery").delete().eq("user_id", id);
      await admin.from("word_mastery").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("ghi type=grammar, scope rỗng, grammar_lesson_id đúng bài, item_type mọi item là 'grammar'", async () => {
    const { client: alice, id: aliceId } = await taoNguoiDung("alice");
    const { baiId } = await taoBaiNguPhap(alice, aliceId, 1);

    const { data: bai } = await admin
      .from("assessments")
      .select("type, scope, grammar_lesson_id")
      .eq("id", baiId)
      .single();
    expect(bai?.type).toBe("grammar");
    // KHÔNG phải [1] — xem docblock đầu file lý do khác brief nguyên văn.
    expect(bai?.scope).toEqual([]);
    expect(bai?.grammar_lesson_id).toBe(grammarLessonId);

    const { data: items } = await admin
      .from("assessment_items")
      .select("item_type")
      .eq("assessment_id", baiId);
    expect(items).toHaveLength(20);
    for (const row of items ?? []) expect(row.item_type).toBe("grammar");
  });

  it("payload chỉ có prompt, options, kind — không có đáp án", async () => {
    const { client: alice, id: aliceId } = await taoNguoiDung("alice2");
    const { baiId } = await taoBaiNguPhap(alice, aliceId, 1);

    const { data } = await admin
      .from("assessment_items").select("payload").eq("assessment_id", baiId);
    expect(data).toHaveLength(20);
    for (const row of data ?? []) {
      const p = row.payload as Record<string, unknown>;
      expect(Object.keys(p).sort()).toEqual(["kind", "options", "prompt"]);
      expect(p.kind).toBe("grammar");
    }
  });

  it("trả lời đúng một câu ghi grammar_mastery theo (user_id, grammar_lesson_id) với correct_count=1, KHÔNG đụng word_mastery", async () => {
    const { client: bob, id: bobId } = await taoNguoiDung("bob");
    const { baiId, cauHoi } = await taoBaiNguPhap(bob, bobId, 2);

    const cauDung = cauHoi[0]!;
    const ket = await recordAnswer(bob, bobId, baiId, 0, cauDung.answer);
    expect(ket.dung).toBe(true);
    expect(ket.ghiNhanLanNay).toBe(true);

    const { data: gm } = await admin
      .from("grammar_mastery")
      .select("correct_count, wrong_count")
      .eq("user_id", bobId)
      .eq("grammar_lesson_id", grammarLessonId)
      .single();
    expect(gm?.correct_count).toBe(1);
    expect(gm?.wrong_count).toBe(0);

    // Bằng chứng TRỰC TIẾP không đụng word_mastery — không suy luận từ việc
    // recordAnswer "chỉ gọi applyGrammarMastery", đọc thẳng bảng để xác nhận.
    const { data: wm } = await admin.from("word_mastery").select("id").eq("user_id", bobId);
    expect(wm ?? []).toEqual([]);
  });

  it("trả lời sai một câu ghi wrong_count=1 vào đúng khoá, correct_count vẫn 0", async () => {
    const { client: carol, id: carolId } = await taoNguoiDung("carol");
    const { baiId, cauHoi } = await taoBaiNguPhap(carol, carolId, 3);

    const cauSai = cauHoi[0]!;
    const phuongAnSai = cauSai.options.find((o) => o !== cauSai.answer)!;
    const ket = await recordAnswer(carol, carolId, baiId, 0, phuongAnSai);
    expect(ket.dung).toBe(false);
    expect(ket.ghiNhanLanNay).toBe(true);

    const { data: gm } = await admin
      .from("grammar_mastery")
      .select("correct_count, wrong_count")
      .eq("user_id", carolId)
      .eq("grammar_lesson_id", grammarLessonId)
      .single();
    expect(gm?.wrong_count).toBe(1);
    expect(gm?.correct_count).toBe(0);
  });

  it("trả lời lại cùng một câu KHÔNG cộng lần hai (CAS giữ nguyên)", async () => {
    const { client: dave, id: daveId } = await taoNguoiDung("dave");
    const { baiId, cauHoi } = await taoBaiNguPhap(dave, daveId, 4);

    const cau = cauHoi[0]!;
    const lanDau = await recordAnswer(dave, daveId, baiId, 0, cau.answer);
    expect(lanDau.ghiNhanLanNay).toBe(true);

    const lanHai = await recordAnswer(dave, daveId, baiId, 0, cau.answer);
    expect(lanHai.ghiNhanLanNay).toBe(false);

    const { data: gm } = await admin
      .from("grammar_mastery")
      .select("correct_count")
      .eq("user_id", daveId)
      .eq("grammar_lesson_id", grammarLessonId)
      .single();
    // Đúng MỘT lần thắng CAS trong hai lượt gọi tuần tự — không phải 2.
    expect(gm?.correct_count).toBe(1);
  });
});
