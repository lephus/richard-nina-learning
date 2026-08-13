import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyWordMastery } from "@/lib/mastery/write";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const hasEnv = Boolean(URL && SERVICE && ANON);

describe.skipIf(!hasEnv)("applyWordMastery", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "x", {
    auth: { persistSession: false },
  });
  let alice: SupabaseClient;
  let aliceId = "";
  const WORD_ID = 1;

  beforeAll(async () => {
    const email = `mastery-${Date.now()}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password: "test-pass-1234", email_confirm: true,
    });
    if (error) throw error;
    aliceId = data.user.id;
    const c = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password: "test-pass-1234" });
    alice = c;
  });

  afterAll(async () => {
    if (aliceId) {
      await admin.from("word_mastery").delete().eq("user_id", aliceId);
      await admin.auth.admin.deleteUser(aliceId);
    }
  });

  it("đúng hai lần thì cộng dồn và đánh dấu đã thuộc", async () => {
    await applyWordMastery(alice, aliceId, WORD_ID, true);
    await applyWordMastery(alice, aliceId, WORD_ID, true);

    const { data } = await admin
      .from("word_mastery")
      .select("correct_count, wrong_count, mastered")
      .eq("user_id", aliceId).eq("word_id", WORD_ID).single();

    expect(data).toMatchObject({ correct_count: 2, wrong_count: 0, mastered: true });
  });

  it("trả lời sai vẫn được đếm, và làm mất trạng thái đã thuộc", async () => {
    await applyWordMastery(alice, aliceId, WORD_ID, false);

    const { data } = await admin
      .from("word_mastery")
      .select("correct_count, wrong_count, mastered")
      .eq("user_id", aliceId).eq("word_id", WORD_ID).single();

    expect(data).toMatchObject({ correct_count: 2, wrong_count: 1, mastered: false });
  });

  // Day la loi da tra gia that: nuot loi doc khien current = null, masteryDelta
  // tinh lai tu 0, roi upsert GHI DE sach tien do da tich luy.
  it("ném khi không đọc được dòng hiện tại, thay vì ghi đè tiến độ", async () => {
    const nguoiLa = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await expect(
      applyWordMastery(nguoiLa, aliceId, WORD_ID, true),
    ).rejects.toBeTruthy();

    const { data } = await admin
      .from("word_mastery")
      .select("correct_count").eq("user_id", aliceId).eq("word_id", WORD_ID).single();
    expect(data?.correct_count).toBe(2);
  });
});
