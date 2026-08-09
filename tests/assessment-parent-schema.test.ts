import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(URL && SERVICE);

describe.skipIf(!hasEnv)("schema parent_id cua assessments", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "noop", {
    auth: { persistSession: false },
  });
  const email = `parent-probe-${Date.now()}@test.local`;
  let userId = "";

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email, password: "parent-pass-1234", email_confirm: true,
      user_metadata: { display_name: "Người thử parent" },
    });
    if (error) throw error;
    userId = data.user!.id;
  });

  afterAll(async () => {
    // CHỈ xoá theo user_id của chính tài khoản này.
    if (userId) {
      await admin.from("assessments").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  // MỌI dòng ở đây đặt `status` TƯỜNG MINH và khác `in_progress`. Cột đó mặc
  // định là `in_progress` (0003_user_state.sql:43), mà `assessments_one_in_progress`
  // (0007) chỉ cho MỘT dòng `in_progress` trên mỗi người — nên bỏ trống `status`
  // ở dòng thứ hai là chèn hỏng, `data` về null, và test vỡ bằng một TypeError
  // đọc thuộc tính của null thay vì nói ra điều gì đã sai. Ba test này kiểm
  // KHOÁ NGOẠI và cascade, không kiểm trạng thái, nên giá trị nào cũng được
  // miễn là không chiếm mất suất `in_progress` của nhau.
  const NOT_OPEN = "submitted" as const;

  it("bài bổ túc trỏ được tới lần thử đã trượt", async () => {
    const later = new Date(Date.now() + 60_000).toISOString();

    const { data: parent, error: pErr } = await admin.from("assessments").insert({
      user_id: userId, type: "review", scope: [1, 2],
      status: NOT_OPEN, score: 60, passed: false, expires_at: later,
    }).select("id").single();
    expect(pErr).toBeNull();

    const { data: child, error: cErr } = await admin.from("assessments").insert({
      user_id: userId, type: "remedial", scope: [1, 2],
      status: NOT_OPEN, parent_id: parent!.id, expires_at: later,
    }).select("id, parent_id").single();
    expect(cErr).toBeNull();
    expect(child!.parent_id).toBe(parent!.id);
  });

  it("bài thường có parent_id null", async () => {
    const later = new Date(Date.now() + 60_000).toISOString();
    const { data, error } = await admin.from("assessments").insert({
      user_id: userId, type: "test", scope: [1, 2, 3, 4],
      status: NOT_OPEN, expires_at: later,
    }).select("parent_id").single();
    expect(error).toBeNull();
    expect(data!.parent_id).toBeNull();
  });

  it("xoá lần thử gốc thì bài bổ túc biến mất theo", async () => {
    const later = new Date(Date.now() + 60_000).toISOString();
    const { data: p, error: pErr } = await admin.from("assessments").insert({
      user_id: userId, type: "review", scope: [5, 6],
      status: NOT_OPEN, passed: false, expires_at: later,
    }).select("id").single();
    expect(pErr).toBeNull();

    const { data: c, error: cErr } = await admin.from("assessments").insert({
      user_id: userId, type: "remedial", scope: [5, 6],
      status: NOT_OPEN, parent_id: p!.id, expires_at: later,
    }).select("id").single();
    expect(cErr).toBeNull();

    const { error: dErr } = await admin.from("assessments").delete().eq("id", p!.id);
    expect(dErr).toBeNull();
    const { data: gone, error: gErr } = await admin.from("assessments").select("id").eq("id", c!.id);
    expect(gErr).toBeNull();
    expect(gone).toEqual([]);
  });

  it("chỉ số duy nhất chặn dòng in_progress thứ hai của cùng một người", async () => {
    // Chính là bất biến vừa làm ba test trên đỏ. Đây là chỗ nó ĐƯỢC khẳng định
    // thay vì tình cờ va phải: hai lần bắt đầu song song (bấm đúp, hai tab) đều
    // đọc thấy "không có bài nào đang dở" rồi đều chèn — đọc-rồi-chèn không
    // nguyên tử, nên hàng rào thật phải nằm ở database.
    const later = new Date(Date.now() + 60_000).toISOString();
    const row = {
      user_id: userId, type: "review" as const, scope: [7, 8],
      status: "in_progress" as const, expires_at: later,
    };

    const { data: first, error: firstErr } = await admin
      .from("assessments").insert(row).select("id").single();
    expect(firstErr).toBeNull();

    const { error: secondErr } = await admin.from("assessments").insert(row).select("id").single();
    expect(secondErr?.code).toBe("23505");

    // Trả bảng về trạng thái không còn dòng in_progress nào cho người này, để
    // thứ tự chạy của test không ảnh hưởng lẫn nhau.
    const { error: cleanErr } = await admin
      .from("assessments").delete().eq("id", first!.id);
    expect(cleanErr).toBeNull();
  });
});
