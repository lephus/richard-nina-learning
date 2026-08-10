import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(URL && SERVICE);

// Bỏ qua tường minh khi thiếu env, để `npm test` vẫn chạy được trên máy
// chưa cấu hình Supabase — cùng khuôn với tests/db-integrity.test.ts.
describe.skipIf(!hasEnv)("trigger tao profiles", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "noop", {
    auth: { persistSession: false },
  });
  // Email cố định: một lần chạy bị ngắt giữa chừng (trước afterAll) để lại
  // dòng auth.users mồ côi trên production, và mọi lần chạy sau đụng độ
  // email trùng cho tới khi ai đó xoá tay. Gắn timestamp như tests/rls.test.ts.
  const email = `trigger-probe-${Date.now()}@test.local`;
  let userId = "";

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "trigger-pass-1234",
      email_confirm: true,
      user_metadata: { display_name: "Người thử trigger" },
    });
    if (error) throw error;
    userId = data.user!.id;
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("tạo user thì có ngay dòng profiles với đúng display_name", async () => {
    const { data, error } = await admin
      .from("profiles")
      .select("id, display_name")
      .eq("id", userId)
      .single();

    expect(error).toBeNull();
    expect(data?.display_name).toBe("Người thử trigger");
  });

  it("xoá user thì dòng profiles biến mất theo (cascade)", async () => {
    await admin.auth.admin.deleteUser(userId);
    const { data } = await admin.from("profiles").select("id").eq("id", userId);
    expect(data).toEqual([]);
    userId = "";
  });
});
