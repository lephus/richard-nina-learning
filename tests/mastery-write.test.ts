import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

  // Hai bai test duoi day di qua RLS that (client cua Alice DA dang nhap, nen
  // auth.uid() = aliceId khop policy own_wmastery). Ghi chu de nguoi sau khoi
  // phai do lai bang thuc nghiem: mot client CHUA dang nhap doc dong cua nguoi
  // khac se nhan `{ data: null, error: null }` — RLS LOC dong ra khoi ket qua
  // (tra ve 0 dong, HTTP 200), khong phai TU CHOI bang mot loi. `.maybeSingle()`
  // coi 0 dong la hop le, nen nhanh `if (currentErr) throw currentErr;` khong
  // he chay trong kich ban do. Vi vay bai test "nem khi doc loi" o describe
  // ben duoi phai dung fake client de ep loi doc that, thay vi mot client that
  // chua dang nhap — dung client that se cho ket qua xanh nhung khong chung
  // minh dieu no tuyen bo (da kiem chung: xoa han guard doc-loi roi chay lai
  // bang client that chua dang nhap, ca 3 test cu VAN pass).
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
});

/**
 * Dung fake `SupabaseClient` thay vi client that chua dang nhap, vi doi tuong
 * can kiem la CACH XU LY LOI cua applyWordMastery, khong phai hanh vi cua
 * Supabase — va mot loi doc that khong the ep xay ra mot cach xac dinh (xem
 * ghi chu ben tren describe "applyWordMastery": client that chua dang nhap bi
 * RLS LOC ket qua ve rong chu khong TRA VE LOI). Khong phu thuoc bien moi
 * truong nen luon chay, ke ca tren may khong co khoa Supabase.
 */
describe("applyWordMastery — bảo vệ khi đọc lỗi", () => {
  function fakeSupabaseVoiLoiDoc() {
    const upsertSpy = vi.fn();
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: null,
                error: { message: "loi doc gia lap", code: "XXXXX" },
              }),
            }),
          }),
        }),
        upsert: upsertSpy,
      }),
    } as unknown as SupabaseClient;
    return { client, upsertSpy };
  }

  // Day la loi da tra gia that: nuot loi doc khien current = null, masteryDelta
  // tinh lai tu 0, roi upsert GHI DE sach correct_count/wrong_count/mastered da
  // tich luy ve diem xuat phat — mat lich su hoc ma khong co gi bao cho nguoi
  // hoc biet. Ca hai ve cua phep thu deu bat buoc: khong chi throw (khong nuot
  // loi) ma con KHONG DUOC goi upsert (khong co gi de ghi de) — thieu ve sau
  // thi test chi chung minh co mot exception thoat ra, khong chung minh du
  // lieu con nguyen.
  it("ném lỗi đọc thật, và KHÔNG gọi upsert — dữ liệu cũ không bị ghi đè", async () => {
    const { client, upsertSpy } = fakeSupabaseVoiLoiDoc();

    await expect(
      applyWordMastery(client, "u", 1, true),
    ).rejects.toBeTruthy();

    expect(upsertSpy).not.toHaveBeenCalled();
  });
});
