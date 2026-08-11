import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadCards } from "@/lib/vocab/load-cards";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(URL && ANON && SERVICE);

describe.skipIf(!hasEnv)("loadCards", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "noop", {
    auth: { persistSession: false },
  });
  const email = `load-cards-${Date.now()}@test.local`;
  const password = "load-pass-1234";
  let userId = "";
  let userClient = createClient(URL ?? "http://localhost", ANON ?? "noop");
  let lesson1 = 0;
  let lesson2 = 0;

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: "Người thử loadCards" },
    });
    if (error) throw error;
    userId = data.user!.id;

    userClient = createClient(URL!, ANON!);
    const signIn = await userClient.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;

    const { data: ls, error: lsErr } = await admin
      .from("lessons").select("id, ordinal").in("ordinal", [1, 2]).order("ordinal");
    if (lsErr) throw lsErr;
    lesson1 = ls![0]!.id as number;
    lesson2 = ls![1]!.id as number;
  });

  afterAll(async () => {
    if (userId) {
      await admin.from("word_notes").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("một buổi trả đúng 30 thẻ, theo đúng position", async () => {
    const cards = await loadCards(userClient, [lesson1], userId);
    expect(cards).toHaveLength(30);
    expect(new Set(cards.map((c) => c.id)).size).toBe(30);
  });

  it("hai buổi trả 60 thẻ, buổi đầu đứng trước", async () => {
    const mot = await loadCards(userClient, [lesson1], userId);
    const hai = await loadCards(userClient, [lesson1, lesson2], userId);
    expect(hai).toHaveLength(60);
    expect(hai.slice(0, 30).map((c) => c.id)).toEqual(mot.map((c) => c.id));
  });

  it("thứ tự theo mảng lessonIds, không theo giá trị id", async () => {
    const nguoc = await loadCards(userClient, [lesson2, lesson1], userId);
    const xuoi = await loadCards(userClient, [lesson1, lesson2], userId);
    expect(nguoc[0]!.id).toBe(xuoi[30]!.id);
  });

  it("câu ví dụ đã điền lại, không còn chỗ trống", async () => {
    const cards = await loadCards(userClient, [lesson1], userId);
    for (const c of cards) expect(c.exampleEn).not.toContain("___");
  });

  it("không mang theo blankAnswer xuống client", async () => {
    const cards = await loadCards(userClient, [lesson1], userId);
    expect(Object.keys(cards[0]!)).not.toContain("blankAnswer");
  });

  it("ghi chú rỗng khi chưa viết gì, và đọc đúng khi đã có", async () => {
    const truoc = await loadCards(userClient, [lesson1], userId);
    expect(truoc[0]!.note).toBe("");

    const body = "ghi chú\nnhiều dòng";
    const ins = await admin
      .from("word_notes").insert({ user_id: userId, word_id: truoc[0]!.id, body });
    expect(ins.error).toBeNull();

    const sau = await loadCards(userClient, [lesson1], userId);
    expect(sau[0]!.note).toBe(body);
  });
});
