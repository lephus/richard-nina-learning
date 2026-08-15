import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const hasEnv = Boolean(URL && SERVICE && ANON);

describe.skipIf(!hasEnv)("RPC đáp án và giải thích", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "x", {
    auth: { persistSession: false },
  });
  let alice: SupabaseClient;
  let aliceId = "";
  let questionId = 0;

  beforeAll(async () => {
    const email = `giaithich-${Date.now()}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password: "test-pass-1234", email_confirm: true,
    });
    if (error) throw error;
    aliceId = data.user.id;
    const c = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password: "test-pass-1234" });
    alice = c;

    const { data: q } = await admin
      .from("grammar_questions").select("id").order("id").limit(1).single();
    questionId = q!.id as number;
  });

  afterAll(async () => {
    if (aliceId) await admin.auth.admin.deleteUser(aliceId);
  });

  it("trả về đáp án dạng chữ hiển thị và giải thích không rỗng", async () => {
    const { data, error } = await alice.rpc("dap_an_va_giai_thich", {
      p_question_id: questionId,
    });
    expect(error).toBeNull();
    const hang = Array.isArray(data) ? data[0] : data;
    expect(typeof hang.dap_an).toBe("string");
    expect(hang.dap_an.length).toBeGreaterThan(0);
    expect(typeof hang.giai_thich).toBe("string");
    expect(hang.giai_thich.length).toBeGreaterThan(10);
  });

  it("đáp án trả về đúng là một trong bốn phương án của câu đó", async () => {
    const { data } = await alice.rpc("dap_an_va_giai_thich", { p_question_id: questionId });
    const hang = Array.isArray(data) ? data[0] : data;
    const { data: q } = await admin
      .from("grammar_questions").select("options").eq("id", questionId).single();
    expect(q!.options as string[]).toContain(hang.dap_an);
  });

  // Chốt chặn: RPC là đường HỢP LỆ DUY NHẤT. Nếu ai đó "tiện tay" cấp cột
  // `explanation` cho `authenticated`, client đọc thẳng được giải thích TRƯỚC
  // khi trả lời — tức biết luôn đáp án. Test này giữ cho cửa đó đóng.
  it("explanation vẫn KHÔNG đọc trực tiếp được bằng vai authenticated", async () => {
    const { error } = await alice
      .from("grammar_questions").select("explanation").eq("id", questionId);
    expect(error).not.toBeNull();
  });
});
