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
    // 42P01 (Postgres: undefined_table, khi schema cache PostgREST con cu va
    // request lot xuong toi Postgres that) hoac PGRST205 (PostgREST tu choi
    // truoc vi cache da biet bang khong con) — ca hai deu la dau hieu "bang
    // khong ton tai", khac han mot loi khac bat ky nao do lam test xanh gia.
    expect(["42P01", "PGRST205"]).toContain(error?.code);
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
    // Phai la 23514 (check_violation) — dung ma loi cu the, khong chi "co loi
    // bat ky". Neu chi assert not.toBeNull(), mot loi hoan toan khac (vi du
    // bang lesson_cursor chua ton tai) cung lam test nay xanh gia.
    expect(error?.code).toBe("23514");
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
    // 23514 = check_violation cua rang buoc char_length(body) <= 2000, cung
    // ly do voi test bien word_index o tren.
    expect(error?.code).toBe("23514");
  });

  it("assessment_type nhận 'lesson' và 'grammar', từ chối 'test'", async () => {
    const mk = async (type: string, extra: Record<string, unknown>) =>
      admin.from("assessments").insert({ user_id: userId, type, scope: [1], ...extra }).select("id").single();

    const ok = await mk("lesson", {});
    expect(ok.error).toBeNull();
    if (ok.data) await admin.from("assessments").delete().eq("id", ok.data.id);

    const bad = await mk("test", {});
    // 22P02 = invalid_text_representation: loi ep kieu enum vi 'test' khong
    // con la gia tri hop le, khong chi "co loi bat ky".
    expect(bad.error?.code).toBe("22P02");
  });

  it("bài grammar buộc có grammar_lesson_id, bài từ vựng buộc không có", async () => {
    const { data: gl } = await admin.from("grammar_lessons").select("id").limit(1).single();

    const thieu = await admin
      .from("assessments").insert({ user_id: userId, type: "grammar", scope: [] });
    // 23514 = check_violation cua assessments_grammar_scope. Sua them ngoai
    // danh sach cua nguoi soat: cung mot loi "chi assert co loi" nhu ba test
    // tren, cung mot cach sua.
    expect(thieu.error?.code).toBe("23514");

    const thua = await admin
      .from("assessments").insert({ user_id: userId, type: "lesson", scope: [1], grammar_lesson_id: gl!.id });
    expect(thua.error?.code).toBe("23514");

    const dung = await admin
      .from("assessments")
      .insert({ user_id: userId, type: "grammar", scope: [], grammar_lesson_id: gl!.id })
      .select("id").single();
    expect(dung.error).toBeNull();
    if (dung.data) await admin.from("assessments").delete().eq("id", dung.data.id);
  });

  it("cột expires_at không còn tồn tại", async () => {
    const { error } = await admin.from("assessments").select("expires_at").limit(1);
    // 42703 (Postgres: undefined_column) hoac PGRST204 (PostgREST tu choi
    // truoc vi cache biet cot khong con). KHONG dung 42P01/PGRST205 (danh cho
    // BANG khong ton tai) — bang `assessments` van con, chi mot COT bien mat,
    // nen ma loi phai la lop "undefined_column", khong phai "undefined_table".
    // Da xac nhan that bang mot probe doc rieng truoc khi sua: select mot cot
    // vo nghia tu chinh bang `assessments` tra ve dung 42703.
    expect(["42703", "PGRST204"]).toContain(error?.code);
  });
});
