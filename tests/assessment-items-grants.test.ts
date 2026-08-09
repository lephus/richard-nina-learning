import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startAssessment, submitAssessment } from "@/lib/assessment/run";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(URL && ANON && SERVICE);

/**
 * 0008_assessment_items_grants.sql thu hoi TOAN BO quyen mac dinh cua
 * `authenticated`/`anon` tren assessment_items roi cap lai tuong minh: SELECT
 * chi tren mot danh sach cot (KHONG co is_correct), INSERT nguyen bang, UPDATE
 * chi tren (user_answer, is_correct). Doc is_correct chuyen sang hai ham
 * `security definer` — finalize_assessment_items, wrong_items_for_assessment
 * — moi ham tu kiem tra chu so huu BANG auth.uid() VA (voi
 * wrong_items_for_assessment) trang thai bai KHONG con 'in_progress'.
 *
 * File nay kiem ba lop rieng, doc lap voi nhau:
 *   (A) grant cot: is_correct khong doc duoc qua client thuong, cac cot con
 *       lai van doc duoc — tests 1-2.
 *   (B) guard trang thai tren wrong_items_for_assessment: goi duoc GIUA
 *       CHUNG mot bai dang lam (ke ca chinh chu) la mot oracle do dap an
 *       tung cau, phai bi tu choi — tests 3-4.
 *   (C) finalize_assessment_items tu DONG BAI ngay lan goi dau, nen khong the
 *       dung lap lai nhu mot oracle cham diem; goi tu nguoi khac phai bi tu
 *       choi VA khong de lai tac dung phu — tests 5-7.
 * Tests 3-7 se do "Could not find the function" cho toi khi 0008 va 0009
 * duoc dan len dashboard that — xem task-9-report.md va task-1-report.md.
 *
 * XOA test (D) cu ("dong treo tu sua o lan goi ke tiep", tung la test 8):
 * test do dung tay mot dong 'submitted' voi score/passed/submitted_at con
 * NULL de mo phong dung hinh dang loi tach RPC/UPDATE cua BAN CU. Ke tu
 * 0009_finalize_atomic.sql (dong bai + ghi diem trong DUNG MOT UPDATE), hinh
 * dang do khong con duong nao sinh ra nua — VA neu no van ton tai (du lieu
 * cu tu truoc migration), CAS moi ("UPDATE ... WHERE status = 'in_progress'")
 * se KHONG khop mot dong da 'submitted' tu truoc, nen khong con tu sua duoc
 * nua (doc lai duoc gia tri NULL cu, khong nem loi, nhung cung khong chua).
 * Giu nguyen test do la giu mot khang dinh chi dung voi co che HAI luot ghi
 * da bi go bo — xem them run.ts va 0009_finalize_atomic.sql.
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
  /** Bài ôn tập của Alice, còn `in_progress` suốt các test 1-4. */
  let openId = 0;

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

    openId = await startAssessment(alice, aliceId, "review", [1, 2], null, new Date());
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

  // ── (A) grant cột ──────────────────────────────────────────────────────

  it("is_correct bị thu hồi SELECT khỏi authenticated qua client thường", async () => {
    const { error } = await alice
      .from("assessment_items")
      .select("is_correct")
      .eq("assessment_id", openId);
    // Cùng dạng khẳng định mạnh như các test "từ chối" khác trong file này
    // (không chỉ `not.toBeNull()`, vốn cũng thoả với một lỗi 500 hay lỗi
    // đường truyền bất kỳ — đúng điểm yếu mà lần review trước đã nêu và đã
    // vá ở các test kia, còn sót lại đúng một chỗ này). Một lượt từ chối
    // quyền cột nổi lên phía PostgREST với `error.code` là chính SQLSTATE
    // Postgres trả — `42501` (insufficient_privilege) — đã đo trực tiếp
    // bằng PostgreSQL cục bộ: `ERROR: 42501: permission denied for table
    // assessment_items`.
    expect(error?.code, "is_correct phải bị thu hồi khỏi authenticated").toBe("42501");
  });

  it("các cột được phép vẫn đọc được bình thường qua client thường", async () => {
    const { data, error } = await alice
      .from("assessment_items")
      .select("id, assessment_id, position, item_type, ref_id, payload, user_answer")
      .eq("assessment_id", openId);
    expect(error, "một revoke quá tay không được chặn luôn các cột hợp lệ").toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  // ── (B) guard trạng thái trên wrong_items_for_assessment ───────────────

  it("wrong_items_for_assessment từ chối NGAY CẢ chính chủ khi bài còn đang làm dở", async () => {
    // Đây là chỗ chặn oracle: nếu hàm này trả lời được giữa chừng một bài
    // đang làm, gọi lại sau MỖI câu trả lời sẽ lộ dần câu nào vừa sai mà
    // không cần biết đáp án thật.
    const res = await alice.rpc("wrong_items_for_assessment", { p_assessment_id: openId });
    expect(res.error?.code, "PostgREST phải trả đúng SQLSTATE 42501 đã raise").toBe("42501");
    expect(res.data).toBeNull();
  });

  it("người học KHÁC cũng bị từ chối trên bài đang làm dở của Alice", async () => {
    const res = await bob.rpc("wrong_items_for_assessment", { p_assessment_id: openId });
    expect(res.error?.code).toBe("42501");
    expect(res.data).toBeNull();
  });

  // ── (C) finalize_assessment_items tự đóng bài ───────────────────────────

  it("người học KHÁC bị từ chối khi gọi finalize_assessment_items, KHÔNG để lại tác dụng phụ", async () => {
    // p_pass_mark/p_now (0009_finalize_atomic.sql) là tham số BẮT BUỘC,
    // không có mặc định — thiếu một trong hai thì PostgREST không tìm được
    // hàm khớp chữ ký (lỗi định tuyến, không phải 42501) và test này sẽ đo
    // nhầm loại lỗi. Kiểm chủ sở hữu vẫn là dòng ĐẦU TIÊN trong thân hàm nên
    // Bob bị chặn trước khi bất kỳ tham số nào khác được dùng tới.
    const res = await bob.rpc("finalize_assessment_items", {
      p_assessment_id: openId,
      p_pass_mark: 80,
      p_now: new Date().toISOString(),
    });
    expect(res.error?.code, "phải bị từ chối đúng vì không phải chủ bài").toBe("42501");
    expect(res.data).toBeNull();

    // Bài của Alice phải CÒN NGUYÊN 'in_progress' và mọi câu vẫn NULL — cuộc
    // gọi bị từ chối của Bob không được phép tự ý đóng bài hay backfill bất
    // cứ dòng nào. Đọc bằng `admin` (bỏ qua quyền cột) để đối chiếu độc lập.
    const { data: assessment, error: aErr } = await admin
      .from("assessments").select("status").eq("id", openId).single();
    if (aErr) throw aErr;
    expect(assessment!.status).toBe("in_progress");

    const { data: rows, error: iErr } = await admin
      .from("assessment_items").select("is_correct").eq("assessment_id", openId);
    if (iErr) throw iErr;
    expect((rows ?? []).length).toBeGreaterThan(0);
    expect((rows ?? []).every((r) => r.is_correct === null)).toBe(true);
  });

  it("Alice nộp bài (submitAssessment) đóng bài thật — chỉ MỘT lần chấm, dùng đúng finalize_assessment_items", async () => {
    const result = await submitAssessment(alice, aliceId, openId, new Date());
    expect(result.score).toBe(0); // chưa trả lời câu nào
    expect(result.passed).toBe(false);

    const { data: assessment, error } = await admin
      .from("assessments").select("status, score, passed, submitted_at").eq("id", openId).single();
    if (error) throw error;
    expect(assessment!.status).toBe("submitted");
    expect(assessment!.score).toBe(0);
    expect(assessment!.submitted_at).not.toBeNull();
  });

  it("sau khi đã chấm: chủ bài gọi được wrong_items_for_assessment, người khác vẫn bị từ chối", async () => {
    const own = await alice.rpc("wrong_items_for_assessment", { p_assessment_id: openId });
    expect(own.error).toBeNull();
    expect(Array.isArray(own.data)).toBe(true);

    const other = await bob.rpc("wrong_items_for_assessment", { p_assessment_id: openId });
    expect(other.error?.code).toBe("42501");
  });

  it("chủ bài tự gọi finalize_assessment_items trực tiếp trên bài MỚI, đóng bài và trả đúng tổng/đúng", async () => {
    // Bài mới (openId đã 'submitted' nên không dùng lại được — một người chỉ
    // có một bài `in_progress`).
    const freshId = await startAssessment(alice, aliceId, "review", [3, 4], null, new Date());

    const res = await alice
      .rpc("finalize_assessment_items", {
        p_assessment_id: freshId,
        p_pass_mark: 80,
        p_now: new Date().toISOString(),
      })
      .single();
    expect(res.error).toBeNull();
    const row = res.data as { total: number; correct: number; score: number; passed: boolean };
    expect(row.total).toBeGreaterThan(0);
    expect(row.correct).toBe(0); // chưa trả lời câu nào
    // 0009_finalize_atomic.sql: hàm giờ tự tính cả score/passed, không chỉ
    // tổng/đúng — 0 câu đúng luôn là 0 điểm, luôn trượt bất kể ngưỡng.
    expect(row.score).toBe(0);
    expect(row.passed).toBe(false);

    const { data: assessment, error } = await admin
      .from("assessments").select("status").eq("id", freshId).single();
    if (error) throw error;
    // Hàm SQL tự đóng bài — KHÔNG cần một lượt UPDATE riêng nào khác để
    // status rời khỏi 'in_progress'.
    expect(assessment!.status).toBe("submitted");
  });
});
