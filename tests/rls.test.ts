import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(URL, SERVICE);
let alice: SupabaseClient;
let bob: SupabaseClient;
let aliceId = "";
let bobId = "";
let testWordId = 0;

beforeAll(async () => {
  const mk = async (email: string, displayName: string) => {
    const { data } = await admin.auth.admin.createUser({
      email, password: "test-pass-1234", email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    const c = createClient(URL, ANON);
    await c.auth.signInWithPassword({ email, password: "test-pass-1234" });
    return { client: c, id: data.user!.id };
  };
  const a = await mk(`alice-${Date.now()}@test.local`, "Alice");
  const b = await mk(`bob-${Date.now()}@test.local`, "Bob");
  alice = a.client; bob = b.client; aliceId = a.id; bobId = b.id;

  // Chen truoc mot dong vocab_words bang service role (bo qua RLS) de khoa
  // ngoai cua word_mastery.word_id khong con che khuat policy RLS o duoi.
  // ordinal cao (9999) de khong dung du lieu seed that. Dung upsert de test
  // idempotent — chay lai nhieu lan khong can `supabase db reset` giua cac
  // lan van khong dinh loi trung khoa unique tren ordinal.
  const { data: word, error: wordErr } = await admin.from("vocab_words").upsert({
    ordinal: 9999,
    word: "placeholder",
    pos: "n",
    ipa: "/test/",
    meaning_vi: "test",
    definition_en: "test definition",
    definition_vi: "test dinh nghia",
    example_en: "test example",
    example_vi: "vi du test",
    blank_answer: "placeholder",
  }, { onConflict: "ordinal" }).select("id").single();
  if (wordErr) throw wordErr;
  testWordId = word!.id as number;
});

// Don sach moi thu test tao ra, dung client `admin` (service role) vi RLS se
// chan client thuong. Khi bo test nay chay tren project Supabase THAT cua
// nguoi dung (Task 15), khong don se tao 6 tai khoan nguoi dung that trong he
// thong xac thuc va chen mot tu vung gia vao noi dung hoc — khong chap nhan duoc.
afterAll(async () => {
  // 1. word_mastery.word_id -> vocab_words(id) KHONG cascade khi xoa, nen phai
  //    xoa moi dong word_mastery cua 2 user test truoc khi xoa dong vocab_words
  //    gia o buoc 4, neu khong se dinh loi khoa ngoai 23503.
  await admin.from("word_mastery").delete().in("user_id", [aliceId, bobId]);

  // 2. Xoa dong profiles minh dinh. profiles.id -> auth.users(id) on delete
  //    cascade nen ve ly thuyet buoc 3 (xoa auth user) se tu dong xoa profiles
  //    ho — nhung xoa minh dinh o day de khong phu thuoc thu tu voi buoc 3 va
  //    de test tu kiem chung lai cascade co that su hoat dong hay khong.
  await admin.from("profiles").delete().in("id", [aliceId, bobId]);

  // 3. Xoa 2 tai khoan test that khoi auth.users — day la phan quan trong nhat:
  //    neu bo qua buoc nay, moi lan chay test tren project That se de lai
  //    tai khoan nguoi dung that trong he thong xac thuc.
  if (aliceId) await admin.auth.admin.deleteUser(aliceId);
  if (bobId) await admin.auth.admin.deleteUser(bobId);

  // 4. Xoa dong vocab_words gia (ordinal 9999) chen o beforeAll — phai xoa
  //    SAU cung vi buoc 1 da don sach moi tham chieu khoa ngoai toi no.
  await admin.from("vocab_words").delete().eq("ordinal", 9999);
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
      .insert({ user_id: aliceId, word_id: testWordId, correct_count: 999 });
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
