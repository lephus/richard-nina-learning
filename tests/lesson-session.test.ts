// tests/lesson-completion.test.ts (bắt buộc theo brief Task 5) mô phỏng
// submitAnswer bằng cách ghi thẳng qua service role — nó xác nhận công thức
// điểm và ràng buộc cột, nhưng KHÔNG gọi một dòng mã nào của session.ts.
// submitAnswer tự nó không gọi được ngoài request Next.js thật (createClient
// gọi `cookies()` từ next/headers, throw khi chạy ngoài ngữ cảnh request).
//
// File này lấp khoảng đó: gọi thẳng loadContext + secretFor — hai hàm MỚI
// của lát này — bằng một client `authenticated` THẬT (đăng nhập qua anon key,
// không phải service role), đúng như submitAnswer sẽ dùng trên Vercel. Nếu
// grant cột hay RPC ở migration 0006 sai, đây là chỗ sẽ đỏ trước khi người
// dùng thật gặp phải.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { itemAt } from "@/lib/lesson/item-plan";
import { buildItem } from "@/lib/lesson/build-item";
import { loadContext, secretFor } from "@/lib/lesson/session";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(URL && ANON && SERVICE);

describe.skipIf(!hasEnv)("session.ts qua client authenticated that", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "noop", {
    auth: { persistSession: false },
  });
  const email = `lesson-session-${Date.now()}@test.local`;
  const password = "lesson-session-1234";
  let user: SupabaseClient;
  let userId = "";
  let lessonId = 0;

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: "Phiên kiểm thử session.ts" },
    });
    if (error) throw error;
    userId = data.user!.id;

    user = createClient(URL!, ANON!);
    const { error: signInErr } = await user.auth.signInWithPassword({ email, password });
    if (signInErr) throw signInErr;

    const { data: lesson } = await admin
      .from("lessons").select("id").eq("ordinal", 1).single();
    lessonId = lesson!.id as number;
  });

  afterAll(async () => {
    // CHỈ xoá theo user_id của chính tài khoản này — xem Global Constraints.
    if (userId) {
      await admin.from("user_lesson_progress").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("loadContext đọc đủ 30 từ của buổi, không rò blankAnswer", async () => {
    const ctx = await loadContext(user, lessonId, userId);
    expect(ctx.lessonWords).toHaveLength(30);
    expect(ctx.grammar.length).toBeGreaterThan(0);
    expect(ctx.bank.length).toBeGreaterThanOrEqual(ctx.lessonWords.length);
    for (const w of ctx.lessonWords) {
      expect(w.blankAnswer).toBe("");
      expect(w.meaningVi.length).toBeGreaterThan(0);
    }
  });

  it("secretFor(fill) qua client thường khớp RPC answer_for_word", async () => {
    const ctx = await loadContext(user, lessonId, userId);
    const spec = itemAt(0); // cluster 0, item 0 = flashcard của từ index 0 — dùng "fill" cùng từ thay vì flashcard
    const fillSpec = { kind: "fill" as const, index: spec.index };
    const item = buildItem(fillSpec, ctx);
    if (item.kind !== "fill") throw new Error("kỳ vọng item fill");

    const got = await secretFor(user, fillSpec, ctx);

    const { data: expected, error } = await admin.rpc("answer_for_word", {
      p_word_id: item.wordId,
    });
    if (error) throw error;
    expect(got).toBe(expected);
    expect(got.length).toBeGreaterThan(0);
  });

  it("secretFor(grammar) qua client thường khớp RPC answer_for_question", async () => {
    const ctx = await loadContext(user, lessonId, userId);
    const spec = { kind: "grammar" as const, index: 0 };
    const item = buildItem(spec, ctx);
    if (item.kind !== "grammar") throw new Error("kỳ vọng item grammar");

    const got = await secretFor(user, spec, ctx);

    const { data: expected, error } = await admin.rpc("answer_for_question", {
      p_question_id: item.questionId,
    });
    if (error) throw error;
    expect(got).toBe(expected);
    expect(item.options).toContain(got);
  });
});
