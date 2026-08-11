import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(URL && ANON && SERVICE);

describe.skipIf(!hasEnv)("RLS word_notes va lesson_cursor", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "noop", {
    auth: { persistSession: false },
  });
  let alice: SupabaseClient;
  let bob: SupabaseClient;
  let aliceId = "";
  let bobId = "";
  let wordId = 0;
  let lessonId = 0;

  beforeAll(async () => {
    // `setId` chạy NGAY sau khi `createUser` thành công, trước bước `signIn`
    // có thể ném lỗi tiếp theo. Bản trước ghi `aliceId`/`bobId` ở phần tử trả
    // về cuối hàm `mk` — nếu `signInWithPassword` lỗi thì `mk` throw trước khi
    // trả, biến ngoài mãi mãi là chuỗi rỗng, và guard `if (!id) continue` ở
    // `afterAll` bỏ qua dọn: một tài khoản auth.users THẬT bị bỏ quên vĩnh
    // viễn trên production, bảng dùng chung với người học thật. Tách `setId`
    // ra khỏi giá trị trả về để việc ghi nhận không phụ thuộc hàm có chạy hết
    // hay không.
    const mk = async (email: string, name: string, setId: (id: string) => void) => {
      const { data, error } = await admin.auth.admin.createUser({
        email, password: "notes-pass-1234", email_confirm: true,
        user_metadata: { display_name: name },
      });
      if (error) throw error;
      setId(data.user!.id);
      const c = createClient(URL!, ANON!);
      const signIn = await c.auth.signInWithPassword({ email, password: "notes-pass-1234" });
      if (signIn.error) throw signIn.error;
      return c;
    };
    alice = await mk(`notes-alice-${Date.now()}@test.local`, "Alice", (id) => { aliceId = id; });
    bob = await mk(`notes-bob-${Date.now()}@test.local`, "Bob", (id) => { bobId = id; });

    const { data: w } = await admin.from("vocab_words").select("id").eq("ordinal", 1).single();
    wordId = w!.id as number;
    const { data: l } = await admin.from("lessons").select("id").eq("ordinal", 1).single();
    lessonId = l!.id as number;
  });

  afterAll(async () => {
    for (const id of [aliceId, bobId]) {
      if (!id) continue;
      await admin.from("word_notes").delete().eq("user_id", id);
      await admin.from("lesson_cursor").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("Alice ghi được ghi chú của chính mình", async () => {
    const { error } = await alice
      .from("word_notes").insert({ user_id: aliceId, word_id: wordId, body: "của Alice" });
    expect(error).toBeNull();
  });

  it("Bob không đọc được ghi chú của Alice", async () => {
    const { data, error } = await bob.from("word_notes").select("body").eq("user_id", aliceId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("Bob không ghi được ghi chú mang user_id của Alice", async () => {
    const { error } = await bob
      .from("word_notes").insert({ user_id: aliceId, word_id: wordId, body: "giả mạo" });
    expect(error).not.toBeNull();
  });

  it("Bob không sửa được ghi chú của Alice", async () => {
    const { error } = await bob
      .from("word_notes").update({ body: "bị sửa" }).eq("user_id", aliceId);
    expect(error).toBeNull(); // RLS lọc theo DÒNG: không thấy dòng nào để sửa.

    const { data } = await admin
      .from("word_notes").select("body").eq("user_id", aliceId).eq("word_id", wordId).single();
    expect(data!.body).toBe("của Alice");
  });

  it("Bob không đọc được con trỏ của Alice", async () => {
    const ins = await alice
      .from("lesson_cursor").insert({ user_id: aliceId, lesson_id: lessonId, word_index: 7 });
    expect(ins.error).toBeNull();

    const { data } = await bob.from("lesson_cursor").select("word_index").eq("user_id", aliceId);
    expect(data).toEqual([]);
  });
});
