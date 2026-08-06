import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(URL, SERVICE);
let alice: ReturnType<typeof createClient>;
let bob: ReturnType<typeof createClient>;
let aliceId = "";

beforeAll(async () => {
  const mk = async (email: string) => {
    const { data } = await admin.auth.admin.createUser({
      email, password: "test-pass-1234", email_confirm: true,
    });
    const c = createClient(URL, ANON);
    await c.auth.signInWithPassword({ email, password: "test-pass-1234" });
    return { client: c, id: data.user!.id };
  };
  const a = await mk(`alice-${Date.now()}@test.local`);
  const b = await mk(`bob-${Date.now()}@test.local`);
  alice = a.client; bob = b.client; aliceId = a.id;

  await admin.from("profiles").insert({ id: aliceId, display_name: "Alice" });
});

describe("RLS", () => {
  it("Alice đọc được hồ sơ của chính mình", async () => {
    const { data } = await alice.from("profiles").select("*").eq("id", aliceId);
    expect(data).toHaveLength(1);
  });

  it("Bob KHÔNG đọc được hồ sơ của Alice", async () => {
    const { data } = await bob.from("profiles").select("*").eq("id", aliceId);
    expect(data).toHaveLength(0);
  });

  it("Bob KHÔNG ghi đè được tiến độ của Alice", async () => {
    const { error } = await bob.from("word_mastery")
      .insert({ user_id: aliceId, word_id: 1, correct_count: 999 });
    expect(error).not.toBeNull();
  });

  it("người dùng đọc được từ vựng nhưng KHÔNG đọc được blank_answer", async () => {
    const okay = await alice.from("vocab_words").select("word, ipa").limit(1);
    expect(okay.error).toBeNull();
    const leak = await alice.from("vocab_words").select("blank_answer").limit(1);
    expect(leak.error, "blank_answer phải bị chặn").not.toBeNull();
  });

  it("người dùng đọc được đề bài nhưng KHÔNG đọc được đáp án", async () => {
    const okay = await alice.from("grammar_questions").select("stem, options").limit(1);
    expect(okay.error).toBeNull();
    const leak = await alice.from("grammar_questions").select("answer").limit(1);
    expect(leak.error, "answer phải bị chặn").not.toBeNull();
  });
});
