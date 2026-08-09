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
 *   (D) hai nhanh cua 0009_finalize_atomic.sql do vong review sau ban vay
 *       dau tien do duoc — bao ve tham so (p_pass_mark/p_now la NULL phai bi
 *       chan) VA hanh vi CHAP NHAN CO CHU DICH tren mot dong 'submitted' ton
 *       du co score=NULL (khong tu sua, khong nem) — tests 8-9.
 * Tests 3-9 se do "Could not find the function" cho toi khi 0008 va 0009
 * duoc dan len dashboard that — xem task-9-report.md va task-1-report.md.
 *
 * XOA test (D) CU ("dong treo tu sua o lan goi ke tiep", tung la test 8
 * truoc khi muc (D) hien tai duoc them): test do dung tay mot dong
 * 'submitted' voi score/passed/submitted_at con NULL de mo phong dung hinh
 * dang loi tach RPC/UPDATE cua BAN CU, roi khang dinh SAI rang goi lai se TU
 * SUA duoc no. Ke tu 0009_finalize_atomic.sql (dong bai + ghi diem trong
 * DUNG MOT UPDATE), hinh dang do khong con duong nao SINH RA nua — VA neu no
 * van ton tai (du lieu cu tu truoc migration), CAS moi
 * ("UPDATE ... WHERE status = 'in_progress'") se KHONG khop mot dong da
 * 'submitted' tu truoc, nen khong con tu sua duoc nua (doc lai duoc gia tri
 * NULL cu, khong nem loi, nhung cung khong chua). Test (D) MOI ben duoi pin
 * DUNG hanh vi nay thay vi khang dinh sai cua test cu — xem them run.ts va
 * 0009_finalize_atomic.sql.
 *
 * THU TU CAC TEST TRONG FILE NAY LA MOT RANG BUOC THAT, KHONG PHAI TINH CO
 * (vong review sau ban vay dau tien cua muc (D) da do duoc mot vi du sai vi
 * bo qua dieu nay): moi `it` bay gio hoac DOC trang thai ma test TRUOC de
 * lai, hoac TAO trang thai cho test SAU dung, tren cung MOT bai `in_progress`
 * duy nhat cua Alice (`assessments_one_in_progress`, 0007_assessment_parent.sql
 * — mot nguoi chi duoc mot bai dang do tai mot thoi diem). Vitest chay cac
 * `it` trong CUNG mot `describe` TUAN TU theo dung thu tu khai bao (khong
 * song song) nen chuoi phu thuoc nay an toan, nhung no la mot RANG BUOC THAT
 * cua thu tu — doi cho hai test bat ky trong so nay se lam mot trong hai test
 * do sai. So thu tu duoi day dem theo THU TU KHAI BAO `it(...)` trong tep
 * (1..10), khong theo nhan nhom (A)/(B)/(C)/(D) o tren — hai cach dem nay
 * TUNG lech nhau mot don vi, va nguoi doc dung so cua nhan nhom de tim "test
 * 8" se sua nham dung cai test giu bat bien thu tu nay.
 *
 * Chuoi cu the: test 6 dong `openId` → test 7 doc `openId` da dong → test 8
 * tao roi dong `freshId` (can Alice dang KHONG co bai in_progress nao) →
 * test 9 tao `pendingId` roi CO Y de no lai 'in_progress' (guard 22004 tu
 * choi dong) → test 10 TAI SU DUNG dung `pendingId` do (KHONG goi
 * startAssessment lan nua — Alice dang co san mot bai in_progress, goi lai se
 * an ngay AssessmentInProgressError).
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
  /**
   * Bài Alice tạo ở test 9 (đếm theo thứ tự khai báo `it`), bị guard 22004
   * từ chối đóng nên còn lại `in_progress` — test 10 TÁI SỬ DỤNG chính dòng
   * này (không gọi
   * `startAssessment` lần nữa) để dựng hình dạng dòng "treo". Xem chú thích
   * thứ tự test ở đầu file.
   */
  let pendingId = 0;

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

  // ── (D) bảo vệ tham số + dòng 'submitted' tồn dư với score=NULL ─────────
  //
  // Hai test này pin đúng hai nhánh mà vòng review sau bản vá đầu tiên của
  // 0009_finalize_atomic.sql đã đo được:
  //   - p_pass_mark/p_now là NULL PHẢI bị chặn NGAY, bài KHÔNG bị đóng.
  //   - một dòng 'submitted' với score/passed CÒN NULL (hình dạng đúng của
  //     dòng treo từ cơ chế HAI-lượt-ghi cũ, dựng tay ở đây vì migration mới
  //     không còn đường nào TỰ SINH ra nó nữa) là hành vi ĐƯỢC CHẤP NHẬN,
  //     không tự sửa: RPC trả đúng NULL đã lưu, KHÔNG ném lỗi. Gọi RPC TRỰC
  //     TIẾP (không qua submitAssessment/finalize) vì bản TypeScript giờ ném
  //     lỗi rõ ràng khi gặp NULL này (xem run.ts) — test này quan sát đúng
  //     những gì tầng SQL trả về, tầng dưới cùng của quyết định thiết kế.

  it("p_pass_mark hoặc p_now là NULL: RPC ném lỗi, bài KHÔNG bị đóng", async () => {
    // Gán vào biến ở phạm vi describe — test 10 tái sử dụng CHÍNH dòng này
    // (xem chú thích thứ tự test ở đầu file). Không đóng được ở đây (guard
    // 22004 từ chối cả hai lượt gọi bên dưới) nên dòng còn nguyên
    // 'in_progress' sau test này — CỐ Ý, không phải một lỗi dọn dẹp thiếu.
    pendingId = await startAssessment(alice, aliceId, "review", [5, 6], null, new Date());

    // Đo ĐÚNG SQLSTATE `22004` mà 0009_finalize_atomic.sql raise — không chỉ
    // "có lỗi" (điểm yếu mà chú thích ở test 1 của chính file này đã nêu và
    // vá: một khẳng định `not.toBeNull()` cũng thoả với một lỗi 500 bất kỳ,
    // hay với chính lỗi định tuyến "Could not find the function" nếu ai đó
    // lỡ xoá guard này — test sẽ vẫn xanh trong khi bug đã quay lại).
    //
    // Đo CẢ HAI tham số — đúng như tên test nói "p_pass_mark HOẶC p_now" —
    // không chỉ một nhánh của điều kiện `or` trong 0009. Gọi lần hai trên
    // CHÍNH dòng vừa bị từ chối ở lần một: dòng đó vẫn 'in_progress' (lần
    // một không đóng gì), nên vẫn là một lời gọi hợp lệ để đo nhánh còn lại.
    const noPassMark = await alice.rpc("finalize_assessment_items", {
      p_assessment_id: pendingId,
      p_pass_mark: null,
      p_now: new Date().toISOString(),
    });
    expect(noPassMark.error?.code, "p_pass_mark NULL phải bị chặn đúng 22004").toBe("22004");
    expect(noPassMark.data).toBeNull();

    const noNow = await alice.rpc("finalize_assessment_items", {
      p_assessment_id: pendingId,
      p_pass_mark: 80,
      p_now: null,
    });
    expect(noNow.error?.code, "p_now NULL cũng phải bị chặn đúng 22004").toBe("22004");
    expect(noNow.data).toBeNull();

    const { data: after, error } = await admin
      .from("assessments").select("status, score").eq("id", pendingId).single();
    if (error) throw error;
    // Dòng KHÔNG hề bị đụng tới bởi CẢ HAI lượt gọi trên — không phải
    // đóng-trước-ném-sau như bản trước fix, và cũng không phải một
    // `passed = NULL` len lỏi vào một bài đã đóng.
    expect(after!.status).toBe("in_progress");
    expect(after!.score).toBeNull();
  });

  it("dòng 'submitted' sẵn có score=NULL (tồn dư từ cơ chế cũ): RPC trả NULL, KHÔNG ném, KHÔNG tự sửa", async () => {
    // TÁI SỬ DỤNG dòng `pendingId` mà test trước đã để lại 'in_progress' —
    // KHÔNG gọi `startAssessment` lần nữa ở đây. Alice chỉ được có MỘT bài
    // `in_progress` tại một thời điểm (0007_assessment_parent.sql,
    // `assessments_one_in_progress`); một lượt `startAssessment` thứ hai sẽ
    // ăn ngay `AssessmentInProgressError` từ chính dòng `pendingId` còn mở —
    // đây CHÍNH LÀ lỗi mà vòng review trước đã đo được trên bản test cũ của
    // file này (gọi `startAssessment` lần nữa thay vì tái dùng dòng có sẵn).
    expect(pendingId, "test trước phải chạy trước và để lại pendingId").not.toBe(0);
    const tornId = pendingId;

    // Dựng tay đúng HÌNH DẠNG dòng treo của cơ chế cũ (trước 0009): status đã
    // 'submitted' nhưng score/passed/submitted_at còn NULL — không cần đi
    // qua RPC thật để tạo ra nó, chỉ cần đúng shape.
    const { error: tornErr } = await admin
      .from("assessments").update({ status: "submitted" }).eq("id", tornId);
    if (tornErr) throw tornErr;

    const res = await alice
      .rpc("finalize_assessment_items", {
        p_assessment_id: tornId,
        p_pass_mark: 80,
        p_now: new Date().toISOString(),
      })
      .single();
    expect(res.error).toBeNull();
    const row = res.data as {
      total: number; correct: number; score: number | null; passed: boolean | null;
    };
    expect(row.score).toBeNull();
    expect(row.passed).toBeNull();

    // Database KHÔNG bị sửa bởi lượt gọi này — vẫn đúng hình dạng treo ban
    // đầu, không có giá trị fail-closed nào bị ghi ngầm vào thay cho NULL.
    // Dòng này còn lại đúng shape treo sau khi describe kết thúc — không sao,
    // vì đây là test CUỐI trong file, không có test nào sau nó cần Alice
    // rảnh tay; `afterAll` xoá sạch theo `user_id` bất kể trạng thái.
    const { data: after, error: afterErr } = await admin
      .from("assessments")
      .select("status, score, passed, submitted_at")
      .eq("id", tornId).single();
    if (afterErr) throw afterErr;
    expect(after).toEqual({ status: "submitted", score: null, passed: null, submitted_at: null });
  });
});
