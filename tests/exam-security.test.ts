import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PASS_MARK, createVocabExam, recordAnswer, submitExam } from "@/lib/exam/run";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const hasEnv = Boolean(URL && SERVICE && ANON);

describe.skipIf(!hasEnv)("an toàn bài thi", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "x", {
    auth: { persistSession: false },
  });
  let alice: SupabaseClient, bob: SupabaseClient;
  let aliceId = "", bobId = "", baiId = 0;

  async function taoNguoiDung(nhan: string) {
    const email = `exam-${nhan}-${Date.now()}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password: "test-pass-1234", email_confirm: true,
    });
    if (error) throw error;
    const c = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password: "test-pass-1234" });
    return { client: c, id: data.user.id };
  }

  beforeAll(async () => {
    const a = await taoNguoiDung("alice");
    const b = await taoNguoiDung("bob");
    alice = a.client; aliceId = a.id; bob = b.client; bobId = b.id;

    // Dựng một bài thi thật cho Alice từ 30 từ đầu.
    const { data: rows } = await admin
      .from("vocab_words")
      .select("id, word, pos, ipa, meaning_vi, definition_en, synonyms, example_en, example_vi, blank_answer")
      .order("ordinal").limit(30);
    const words = (rows ?? []).map((r) => ({
      id: r.id as number, word: r.word as string, pos: r.pos as string,
      ipa: r.ipa as string, meaningVi: r.meaning_vi as string,
      definitionEn: r.definition_en as string, synonyms: (r.synonyms ?? []) as string[],
      exampleEn: r.example_en as string, exampleVi: r.example_vi as string,
      // Rỗng, đúng như VocabLite thật ở phía client (xem tests/exam-build.test.ts):
      // blank_answer đã bị thu hồi khỏi `authenticated`, đáp án thật truyền riêng
      // qua `blanks` bên dưới.
      blankAnswer: "",
    }));
    const blanks = new Map((rows ?? []).map((r) => [r.id as number, r.blank_answer as string]));
    baiId = await createVocabExam(alice, aliceId, "lesson", [1], words, blanks, 1);
  });

  afterAll(async () => {
    for (const id of [aliceId, bobId]) {
      if (!id) continue;
      await admin.from("assessments").delete().eq("user_id", id);
      await admin.from("word_mastery").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("ngưỡng đạt là một hằng số 80% cho mọi loại bài", () => {
    expect(PASS_MARK).toBe(80);
  });

  it("payload không bao giờ chứa đáp án", async () => {
    const { data } = await admin
      .from("assessment_items").select("payload").eq("assessment_id", baiId);
    for (const row of data ?? []) {
      const p = row.payload as Record<string, unknown>;
      expect(Object.keys(p).sort()).toEqual(["kind", "options", "prompt"]);
    }
  });

  it("is_correct bị từ chối SELECT với authenticated, cột khác vẫn đọc được", async () => {
    const bi = await alice.from("assessment_items").select("is_correct").eq("assessment_id", baiId);
    expect(bi.error?.code).toBe("42501");
    const duoc = await alice.from("assessment_items").select("position").eq("assessment_id", baiId);
    expect(duoc.error).toBeNull();
  });

  it("wrong_items_for_assessment từ chối CẢ CHÍNH CHỦ khi bài còn in_progress", async () => {
    const { error } = await alice.rpc("wrong_items_for_assessment", { p_assessment_id: baiId });
    expect(error?.code).toBe("42501");
  });

  it("finalize từ chối người không phải chủ", async () => {
    const { error } = await bob.rpc("finalize_assessment_items", {
      p_assessment_id: baiId, p_pass_mark: PASS_MARK, p_now: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it("finalize chặn p_pass_mark NULL bằng lỗi 22004", async () => {
    const { error } = await alice.rpc("finalize_assessment_items", {
      p_assessment_id: baiId, p_pass_mark: null, p_now: new Date().toISOString(),
    });
    expect(error?.code).toBe("22004");
  });

  it("double-submit song song: đúng một lần thắng, điểm là số thật", async () => {
    await recordAnswer(alice, aliceId, baiId, 0, "sai-hoan-toan");
    const [a, b] = await Promise.allSettled([
      submitExam(alice, baiId), submitExam(alice, baiId),
    ]);
    const thang = [a, b].filter((r) => r.status === "fulfilled");
    expect(thang.length).toBeGreaterThanOrEqual(1);
    const { data } = await admin
      .from("assessments").select("status, score, passed").eq("id", baiId).single();
    expect(data?.status).toBe("submitted");
    expect(data?.score).not.toBeNull();
    expect(data?.passed).not.toBeNull();
  });
});
