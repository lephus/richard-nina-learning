import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(URL && SERVICE);

describe.skipIf(!hasEnv)("schema lat 2a", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "noop", {
    auth: { persistSession: false },
  });
  const email = `phase2-schema-${Date.now()}@test.local`;
  let userId = "";
  let lessonId = 0;
  let wordId = 0;

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "schema-pass-1234",
      email_confirm: true,
      user_metadata: { display_name: "Người thử schema 2a" },
    });
    if (error) throw error;
    userId = data.user!.id;

    const { data: lesson } = await admin.from("lessons").select("id").eq("ordinal", 1).single();
    lessonId = lesson!.id as number;
    const { data: word } = await admin.from("vocab_words").select("id").eq("ordinal", 1).single();
    wordId = word!.id as number;
  });

  afterAll(async () => {
    // Chỉ xoá theo user_id của chính tài khoản này. Không bao giờ rộng hơn.
    if (userId) {
      await admin.from("word_notes").delete().eq("user_id", userId);
      await admin.from("lesson_cursor").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("bảng user_lesson_progress không còn tồn tại", async () => {
    const { error } = await admin.from("user_lesson_progress").select("user_id").limit(1);
    expect(error).not.toBeNull();
  });

  it("lesson_cursor ghi được và mặc định word_index = 0", async () => {
    const { error } = await admin.from("lesson_cursor").insert({ user_id: userId, lesson_id: lessonId });
    expect(error).toBeNull();

    const { data } = await admin
      .from("lesson_cursor").select("word_index")
      .eq("user_id", userId).eq("lesson_id", lessonId).single();
    expect(data).toEqual({ word_index: 0 });
  });

  it("lesson_cursor chặn word_index ngoài biên 0..29", async () => {
    const { error } = await admin
      .from("lesson_cursor").update({ word_index: 30 })
      .eq("user_id", userId).eq("lesson_id", lessonId);
    expect(error).not.toBeNull();
  });

  it("word_notes giữ được nhiều dòng", async () => {
    const body = "dòng một\ndòng hai\ndòng ba";
    const { error } = await admin.from("word_notes").insert({ user_id: userId, word_id: wordId, body });
    expect(error).toBeNull();

    const { data } = await admin
      .from("word_notes").select("body").eq("user_id", userId).eq("word_id", wordId).single();
    expect(data!.body).toBe(body);
  });

  it("word_notes chặn ghi chú dài quá 2000 ký tự", async () => {
    const { error } = await admin
      .from("word_notes").update({ body: "x".repeat(2001) })
      .eq("user_id", userId).eq("word_id", wordId);
    expect(error).not.toBeNull();
  });

  it("assessment_type nhận 'lesson' và 'grammar', từ chối 'test'", async () => {
    const mk = async (type: string, extra: Record<string, unknown>) =>
      admin.from("assessments").insert({ user_id: userId, type, scope: [1], ...extra }).select("id").single();

    const ok = await mk("lesson", {});
    expect(ok.error).toBeNull();
    if (ok.data) await admin.from("assessments").delete().eq("id", ok.data.id);

    const bad = await mk("test", {});
    expect(bad.error).not.toBeNull();
  });

  it("bài grammar buộc có grammar_lesson_id, bài từ vựng buộc không có", async () => {
    const { data: gl } = await admin.from("grammar_lessons").select("id").limit(1).single();

    const thieu = await admin
      .from("assessments").insert({ user_id: userId, type: "grammar", scope: [] });
    expect(thieu.error).not.toBeNull();

    const thua = await admin
      .from("assessments").insert({ user_id: userId, type: "lesson", scope: [1], grammar_lesson_id: gl!.id });
    expect(thua.error).not.toBeNull();

    const dung = await admin
      .from("assessments")
      .insert({ user_id: userId, type: "grammar", scope: [], grammar_lesson_id: gl!.id })
      .select("id").single();
    expect(dung.error).toBeNull();
    if (dung.data) await admin.from("assessments").delete().eq("id", dung.data.id);
  });

  it("cột expires_at không còn tồn tại", async () => {
    const { error } = await admin.from("assessments").select("expires_at").limit(1);
    expect(error).not.toBeNull();
  });
});
