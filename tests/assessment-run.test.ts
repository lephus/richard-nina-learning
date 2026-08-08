import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  startAssessment, answerItem, submitAssessment, closeExpired, PASS_MARK,
} from "@/lib/assessment/run";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const hasEnv = Boolean(URL && SERVICE && ANON);

describe.skipIf(!hasEnv)("vong lam bai danh gia", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "noop", {
    auth: { persistSession: false },
  });
  const email = `assess-run-${Date.now()}@test.local`;
  const password = "assess-pass-1234";
  let userId = "";
  let user: ReturnType<typeof createClient>;

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: "Người làm bài" },
    });
    if (error) throw error;
    userId = data.user!.id;

    user = createClient(URL!, ANON!, { auth: { persistSession: false } });
    const { error: sErr } = await user.auth.signInWithPassword({ email, password });
    if (sErr) throw sErr;
  });

  // Một người chỉ được có MỘT bài `in_progress` (spec mục 7), nên mỗi test phải
  // trả sân về trạng thái sạch cho test sau. Đóng bằng `admin` chứ không gọi
  // `submitAssessment`: dọn dẹp không được đi qua chính hàm đang kiểm thử, nếu
  // không một lỗi ở `finalize` sẽ hiện ra thành lỗi dọn dẹp khó đọc ở test kế.
  // CHỈ theo user_id của tài khoản test này — xem Global Constraints.
  afterEach(async () => {
    if (!userId) return;
    await admin
      .from("assessments")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("status", "in_progress");
  });

  afterAll(async () => {
    // CHỈ xoá theo user_id của chính tài khoản này — xem Global Constraints.
    if (userId) {
      await admin.from("assessments").delete().eq("user_id", userId);
      await admin.from("word_mastery").delete().eq("user_id", userId);
      await admin.from("grammar_mastery").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  interface ItemRow {
    position: number;
    item_type: "vocab" | "grammar";
    ref_id: number;
    payload: { prompt: string; options: string[] };
    user_answer: string | null;
    is_correct: boolean | null;
  }

  const itemsOf = async (assessmentId: number): Promise<ItemRow[]> => {
    const { data, error } = await admin
      .from("assessment_items")
      .select("position, item_type, ref_id, payload, user_answer, is_correct")
      .eq("assessment_id", assessmentId)
      .order("position");
    if (error) throw error;
    return (data ?? []) as unknown as ItemRow[];
  };

  /**
   * Đáp án đúng đọc bằng `admin` (bỏ qua quyền cột), độc lập hoàn toàn với
   * đường mà `answerItem` dùng — nên test này kiểm chứng được việc chấm chứ
   * không lặp lại chính giả định của bản cài đặt.
   */
  const correctAnswerFor = async (row: ItemRow): Promise<string> => {
    if (row.item_type === "vocab") {
      const { data, error } = await admin
        .from("vocab_words").select("meaning_vi").eq("id", row.ref_id).single();
      if (error) throw error;
      return data!.meaning_vi as string;
    }
    const { data, error } = await admin
      .from("grammar_questions").select("options, answer").eq("id", row.ref_id).single();
    if (error) throw error;
    const options = data!.options as string[];
    const index = (data!.answer as string).charCodeAt(0) - "A".charCodeAt(0);
    return options[index]!;
  };

  it("bắt đầu bài ôn tập thì sinh đủ 25 câu, chưa câu nào có đáp án", async () => {
    const now = new Date();
    const id = await startAssessment(user, userId, "review", [1, 2], null, now);

    const { data } = await admin
      .from("assessment_items")
      .select("position, item_type, user_answer, is_correct")
      .eq("assessment_id", id)
      .order("position");

    expect(data).toHaveLength(25);
    expect(data!.every((r) => r.user_answer === null)).toBe(true);
    expect(data!.every((r) => r.is_correct === null)).toBe(true);
    expect(data!.filter((r) => r.item_type === "vocab")).toHaveLength(20);
  });

  /**
   * Trả lời một loạt câu, nhanh nhất mà vẫn an toàn.
   *
   * Câu từ vựng chạy SONG SONG: mỗi câu là một từ khác nhau nên mỗi câu chạm
   * một dòng `word_mastery` riêng, không dòng nào bị hai lượt ghi tranh nhau.
   * Câu ngữ pháp chạy TUẦN TỰ: `grammar_mastery` khoá theo `grammar_lesson_id`
   * nên nhiều câu trong cùng một đề có thể dùng chung một dòng, và ghi song
   * song lên đó sẽ mất lượt cộng.
   *
   * Mỗi lượt gọi tốn ~0,7s vì mạng, nên vòng lặp tuần tự 25 câu vượt xa mọi
   * ngưỡng thời gian hợp lý — đây là lý do có hàm này thay vì một vòng `for`.
   */
  const answerAll = async (
    assessmentId: number,
    rows: ItemRow[],
    answerFor: (row: ItemRow) => Promise<string> | string,
    now: Date,
  ): Promise<void> => {
    await Promise.all(
      rows
        .filter((r) => r.item_type === "vocab")
        .map(async (r) =>
          answerItem(user, userId, assessmentId, r.position, await answerFor(r), now),
        ),
    );
    for (const r of rows.filter((r) => r.item_type === "grammar")) {
      await answerItem(user, userId, assessmentId, r.position, await answerFor(r), now);
    }
  };

  it("trả lời sai hết thì trượt, điểm 0", async () => {
    const now = new Date();
    const id = await startAssessment(user, userId, "review", [3, 4], null, now);

    await answerAll(id, await itemsOf(id), () => "chắc chắn không phải đáp án", now);

    const r = await submitAssessment(user, userId, id, now);
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
    expect(PASS_MARK.review).toBe(80);

    // Đã trả lời đủ 25 câu, không câu nào bị bỏ sót.
    const rows = await itemsOf(id);
    expect(rows.filter((r2) => r2.user_answer !== null)).toHaveLength(25);
    expect(rows.filter((r2) => r2.is_correct === false)).toHaveLength(25);
  }, 30_000);

  it("bài kiểm tra quá hạn thì tự đóng, câu chưa làm tính sai", async () => {
    const start = new Date();
    const id = await startAssessment(user, userId, "test", [5, 6, 7, 8], null, start);

    // Quá hạn: 61 phút sau.
    const after = new Date(start.getTime() + 61 * 60 * 1000);
    const r = await closeExpired(user, userId, id, after);

    expect(r.score).toBe(0); // không câu nào được trả lời
    expect(r.passed).toBe(false);

    const { data } = await admin
      .from("assessments").select("status, submitted_at")
      .eq("id", id).single();
    expect(data!.status).toBe("submitted");
    expect(data!.submitted_at).not.toBeNull();
  });

  it("bài kiểm tra từ chối câu trả lời sau khi hết giờ", async () => {
    const start = new Date();
    const id = await startAssessment(user, userId, "test", [9, 10, 11, 12], null, start);
    const after = new Date(start.getTime() + 61 * 60 * 1000);

    const r = await answerItem(user, userId, id, 0, "bất kỳ", after);
    expect(r.ok).toBe(false);

    const { data } = await admin
      .from("assessment_items").select("user_answer")
      .eq("assessment_id", id).eq("position", 0).single();
    expect(data!.user_answer).toBeNull();
  });

  it("bài ôn tập KHÔNG khoá cứng thời gian", async () => {
    const start = new Date();
    const id = await startAssessment(user, userId, "review", [13, 14], null, start);
    const after = new Date(start.getTime() + 61 * 60 * 1000);

    const r = await answerItem(user, userId, id, 0, "bất kỳ", after);
    expect(r.ok).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Chấm bài: đáp án đúng phải THẬT SỰ được chấm là đúng.
  //
  // Không có test này thì cả bộ test trên vẫn xanh khi hàm chấm so câu trả lời
  // với NHẦM cột: mọi test ở trên đều trả lời sai, nên "chấm sai tất" và "chấm
  // đúng" không phân biệt được. Câu từ vựng của bài đánh giá là câu CHỌN NGHĨA
  // (`buildAssessmentItems` dựng options từ `meaning_vi`), trong khi RPC
  // `answer_for_word` trả `blank_answer` — từ bị khoét khỏi câu ví dụ, một
  // chuỗi khác hẳn và không nằm trong 4 phương án. Chấm bằng RPC đó thì 80% số
  // câu của MỌI đề luôn sai và không ai qua nổi ngưỡng 70/80%.
  // ─────────────────────────────────────────────────────────────────────────
  it("trả lời đúng thì được chấm đúng — cả câu từ vựng lẫn câu ngữ pháp", async () => {
    const now = new Date();
    const id = await startAssessment(user, userId, "review", [15, 16], null, now);
    const rows = await itemsOf(id);

    const vocab = rows.find((r) => r.item_type === "vocab")!;
    const grammar = rows.find((r) => r.item_type === "grammar")!;

    const vocabAnswer = await correctAnswerFor(vocab);
    const grammarAnswer = await correctAnswerFor(grammar);

    // Đáp án đúng phải nằm trong 4 phương án hiển thị — nếu không, chính đề bài
    // đã hỏng và kết quả chấm dưới đây không nói lên điều gì.
    expect(vocab.payload.options).toContain(vocabAnswer);
    expect(grammar.payload.options).toContain(grammarAnswer);

    const rv = await answerItem(user, userId, id, vocab.position, vocabAnswer, now);
    const rg = await answerItem(user, userId, id, grammar.position, grammarAnswer, now);
    expect(rv).toEqual({ ok: true, correct: true });
    expect(rg).toEqual({ ok: true, correct: true });

    const after = await itemsOf(id);
    expect(after.find((r) => r.position === vocab.position)!.is_correct).toBe(true);
    expect(after.find((r) => r.position === grammar.position)!.is_correct).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Câu chưa làm phải thành `is_correct = false` TRONG DATABASE, không chỉ
  // trong phép chia tính điểm. Đây là lỗi đã truy được đến tận nơi: bài bổ túc
  // dựng từ `is_correct = false` của lần thử cha; nếu câu bỏ trống vẫn là NULL
  // thì một người trượt vì hết giờ sẽ nhận bài bổ túc RỖNG, bài rỗng chấm 0/0
  // không bao giờ qua, và `nextStep` đẩy họ vào bổ túc lại mãi mãi.
  // ─────────────────────────────────────────────────────────────────────────
  it("nộp bài rồi thì câu bỏ trống mang is_correct = false trong database", async () => {
    const now = new Date();
    const id = await startAssessment(user, userId, "review", [17, 18], null, now);
    const rows = await itemsOf(id);

    // 3 câu đúng, 2 câu sai, 20 câu bỏ trống. Năm vị trí đầu đều là câu từ
    // vựng (đề xếp 20 câu từ vựng trước, 5 câu ngữ pháp sau) nên chạy song
    // song được — xem giải thích ở `answerAll`.
    expect(rows.slice(0, 5).every((r) => r.item_type === "vocab")).toBe(true);
    await Promise.all([
      ...rows.slice(0, 3).map(async (row) =>
        answerItem(user, userId, id, row.position, await correctAnswerFor(row), now),
      ),
      ...rows.slice(3, 5).map(async (row) =>
        answerItem(user, userId, id, row.position, "không phải đáp án", now),
      ),
    ]);

    const r = await submitAssessment(user, userId, id, now);
    expect(r.score).toBe(Math.round((3 / 25) * 100)); // 12
    expect(r.passed).toBe(false);

    const after = await itemsOf(id);
    const answered = after.slice(0, 5);
    const skipped = after.slice(5);

    expect(skipped).toHaveLength(20);
    // Điều kiện then chốt: KHÔNG còn dòng nào `is_correct = null`.
    expect(after.filter((r2) => r2.is_correct === null)).toHaveLength(0);
    expect(skipped.every((r2) => r2.is_correct === false)).toBe(true);
    // Vẫn phân biệt được "bỏ trống" với "trả lời sai": `user_answer` giữ null.
    expect(skipped.every((r2) => r2.user_answer === null)).toBe(true);
    expect(answered.every((r2) => r2.user_answer !== null)).toBe(true);
    expect(answered.filter((r2) => r2.is_correct === true)).toHaveLength(3);
  }, 30_000);

  // ─────────────────────────────────────────────────────────────────────────
  // Vòng thoát khi trượt, đi hết đầu-cuối: trượt CHỈ VÌ bỏ dở (không sai câu
  // nào đã làm) → bổ túc vẫn có câu → làm đúng hết → qua. Nếu bỏ phần điền
  // `is_correct = false` ở `finalize`, bài bổ túc ở đây có 0 câu và test dừng
  // ngay tại đó — đúng chỗ người học bị kẹt.
  // ─────────────────────────────────────────────────────────────────────────
  it("trượt vì bỏ dở vẫn sinh được bài bổ túc, và bổ túc qua được", async () => {
    const now = new Date();
    const parentId = await startAssessment(user, userId, "review", [19, 20], null, now);
    const rows = await itemsOf(parentId);

    // 19 câu từ vựng đầu, trả lời ĐÚNG hết → 19/25 = 76% < 80%: trượt mà không
    // sai câu nào. Chạy song song được vì 19 vị trí là 19 từ khác nhau, mỗi từ
    // một dòng `word_mastery` riêng — không dòng nào bị hai lượt ghi tranh nhau.
    const answered = rows.filter((r) => r.item_type === "vocab").slice(0, 19);
    await Promise.all(
      answered.map(async (row) =>
        answerItem(user, userId, parentId, row.position, await correctAnswerFor(row), now),
      ),
    );

    const parent = await submitAssessment(user, userId, parentId, now);
    expect(parent.score).toBe(76);
    expect(parent.passed).toBe(false);

    const skipped = (await itemsOf(parentId)).filter((r) => r.user_answer === null);
    expect(skipped).toHaveLength(6);
    expect(skipped.every((r) => r.is_correct === false)).toBe(true);

    const remedialId = await startAssessment(user, userId, "remedial", [19, 20], parentId, now);
    const remedialRows = await itemsOf(remedialId);

    expect(remedialRows).toHaveLength(6);
    expect(remedialRows.map((r) => r.position)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(remedialRows.map((r) => r.ref_id)).toEqual(skipped.map((r) => r.ref_id));
    expect(remedialRows[0]!.payload).toEqual(skipped[0]!.payload);

    // Tuần tự: mấy câu ngữ pháp có thể cùng một `grammar_lesson_id`, tức cùng
    // một dòng `grammar_mastery` — chạy song song sẽ mất lượt cộng.
    for (const row of remedialRows) {
      const r = await answerItem(
        user, userId, remedialId, row.position, await correctAnswerFor(row), now,
      );
      expect(r).toEqual({ ok: true, correct: true });
    }

    const rem = await submitAssessment(user, userId, remedialId, now);
    expect(rem.score).toBe(100);
    expect(rem.passed).toBe(true);
    expect(PASS_MARK.remedial).toBe(80);
  }, 60_000);

  it("nộp lần thứ hai không đổi gì, trả lại đúng kết quả cũ", async () => {
    const now = new Date();
    const id = await startAssessment(user, userId, "review", [1, 2], null, now);
    const rows = await itemsOf(id);
    await answerItem(user, userId, id, rows[0]!.position, await correctAnswerFor(rows[0]!), now);

    const first = await submitAssessment(user, userId, id, now);
    const { data: before } = await admin
      .from("assessments").select("submitted_at, score, passed").eq("id", id).single();

    const later = new Date(now.getTime() + 5 * 60 * 1000);
    const second = await submitAssessment(user, userId, id, later);
    expect(second).toEqual(first);

    const { data: after } = await admin
      .from("assessments").select("submitted_at, score, passed").eq("id", id).single();
    expect(after).toEqual(before);
  });

  it("đang dở một bài thì không bắt đầu được bài mới", async () => {
    const now = new Date();
    const open = await startAssessment(user, userId, "review", [3, 4], null, now);

    await expect(
      startAssessment(user, userId, "review", [5, 6], null, now),
    ).rejects.toThrow(String(open));

    const { count } = await admin
      .from("assessments").select("*", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "in_progress");
    expect(count).toBe(1);
  });

  it("làm lại cùng phạm vi thì ra đề khác — hạt giống theo id bài", async () => {
    const now = new Date();
    const first = await startAssessment(user, userId, "review", [7, 8], null, now);
    const firstRefs = (await itemsOf(first)).map((r) => r.ref_id);
    await submitAssessment(user, userId, first, now);

    const second = await startAssessment(user, userId, "review", [7, 8], null, now);
    const secondRefs = (await itemsOf(second)).map((r) => r.ref_id);

    expect(secondRefs).not.toEqual(firstRefs);
  });
});
