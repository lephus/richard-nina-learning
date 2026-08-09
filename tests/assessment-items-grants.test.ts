import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startAssessment } from "@/lib/assessment/run";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(URL && ANON && SERVICE);

/**
 * 0008_assessment_items_grants.sql thu hoi SELECT tren
 * assessment_items.is_correct khoi `authenticated`/`anon`, roi mo lai duong
 * doc DUY NHAT qua hai ham `security definer`: `finalize_assessment_items` va
 * `wrong_items_for_assessment`. Ca hai tu kiem tra chu so huu BEN TRONG ham
 * bang `auth.uid()` — day la file kiem thu DUY NHAT bam thang vao dieu kien
 * do, doc lap voi TypeScript o src/lib/assessment/run.ts: mot nguoi hoc co
 * the goi thang RPC nay qua PostgREST (vi du bang JWT doc tu document.cookie,
 * xem comment dau 0008), bo qua toan bo ung dung — nen phep kiem tra o day
 * PHAI goi RPC truc tiep bang client cua "Bob", khong di qua run.ts.
 *
 * THU TU CAC IT() CO Y NGHIA: `finalize_assessment_items` co tac dung phu
 * (backfill is_correct = false), nen test goi no THANH CONG duoc dat SAU
 * CUNG — neu dat truoc, no se lam "ban da bi backfill" thanh tien de sai cho
 * test kiem tra "Bob khong lam thay doi gi ca" o giua.
 */
describe.skipIf(!hasEnv)("chan kenh doc is_correct qua RPC (0008_assessment_items_grants)", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "noop", {
    auth: { persistSession: false },
  });
  const stamp = Date.now();
  const password = "grants-test-pass-1234";
  let alice: SupabaseClient;
  let bob: SupabaseClient;
  let aliceId = "";
  let bobId = "";
  let assessmentId = 0;

  beforeAll(async () => {
    const mk = async (email: string, displayName: string) => {
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { display_name: displayName },
      });
      if (error) throw error;
      const c = createClient(URL!, ANON!, { auth: { persistSession: false } });
      const { error: sErr } = await c.auth.signInWithPassword({ email, password });
      if (sErr) throw sErr;
      return { client: c, id: data.user!.id };
    };
    const a = await mk(`grants-alice-${stamp}@test.local`, "Alice grants");
    const b = await mk(`grants-bob-${stamp}@test.local`, "Bob grants");
    alice = a.client; bob = b.client; aliceId = a.id; bobId = b.id;

    // Bai cua Alice — Bob khong tham gia gi vao bai nay, chi thu doc no qua RPC.
    assessmentId = await startAssessment(alice, aliceId, "review", [1, 2], null, new Date());
  });

  // Don sach: CHI xoa theo user_id cua hai tai khoan chinh test nay tao —
  // xem Global Constraints. `assessments` xoa thi `assessment_items` tu xoa
  // theo (on delete cascade, 0003_user_state.sql).
  afterAll(async () => {
    if (aliceId) {
      await admin.from("assessments").delete().eq("user_id", aliceId);
      await admin.auth.admin.deleteUser(aliceId);
    }
    if (bobId) {
      await admin.from("assessments").delete().eq("user_id", bobId);
      await admin.auth.admin.deleteUser(bobId);
    }
  });

  it("chu bai goi duoc wrong_items_for_assessment cho dung bai cua minh", async () => {
    const res = await alice.rpc("wrong_items_for_assessment", { p_assessment_id: assessmentId });
    expect(res.error).toBeNull();
    // Chua ai tra loi cau nao nen is_correct con NULL het — loc "= false"
    // khong khop dong nao, dung nhu SQL "NULL = false" luon la NULL.
    expect(res.data).toEqual([]);
  });

  it("nguoi hoc KHAC bi tu choi khi goi wrong_items_for_assessment tren bai nay", async () => {
    const res = await bob.rpc("wrong_items_for_assessment", { p_assessment_id: assessmentId });
    expect(res.error, "phai bi tu choi, khong duoc tra ve du lieu cua Alice").not.toBeNull();
    expect(res.data).toBeNull();
  });

  it("nguoi hoc KHAC bi tu choi khi goi finalize_assessment_items tren bai nay, khong lam thay doi du lieu cua Alice", async () => {
    const res = await bob.rpc("finalize_assessment_items", { p_assessment_id: assessmentId });
    expect(res.error, "phai bi tu choi, khong duoc tra ve tong/dung cua Alice").not.toBeNull();
    expect(res.data).toBeNull();

    // Kiem tra chu so huu phai chay TRUOC buoc backfill trong ham SQL —
    // Bob bi tu choi thi KHONG mot dong nao cua Alice duoc dong is_correct =
    // false. Doc bang `admin` (bo qua quyen cot) de xac nhan doc lap.
    const { data: rows, error } = await admin
      .from("assessment_items")
      .select("is_correct")
      .eq("assessment_id", assessmentId);
    if (error) throw error;
    expect((rows ?? []).length).toBeGreaterThan(0);
    expect((rows ?? []).every((r) => r.is_correct === null)).toBe(true);
  });

  it("chu bai goi duoc finalize_assessment_items cho dung bai cua minh, tra ve tong/dung", async () => {
    const res = await alice.rpc("finalize_assessment_items", { p_assessment_id: assessmentId });
    expect(res.error).toBeNull();
    const rows = res.data as { total: number; correct: number }[] | null;
    expect(rows).toHaveLength(1);
    const row = rows![0]!;
    // Chua ai tra loi cau nao — sau backfill ca bai la "sai het".
    expect(row.total).toBeGreaterThan(0);
    expect(row.correct).toBe(0);
  });
});
