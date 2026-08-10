import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(URL && SERVICE);

describe.skipIf(!hasEnv)("schema vi tri buoi hoc", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "noop", {
    auth: { persistSession: false },
  });
  const email = `schema-probe-${Date.now()}@test.local`;
  let userId = "";

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "schema-pass-1234",
      email_confirm: true,
      user_metadata: { display_name: "Người thử schema" },
    });
    if (error) throw error;
    userId = data.user!.id;
  });

  afterAll(async () => {
    // Chỉ xoá theo user_id của chính tài khoản này. Không bao giờ xoá rộng hơn.
    if (userId) {
      await admin.from("user_lesson_progress").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("chèn được dòng tiến độ với position và final_correct", async () => {
    const { data: lesson } = await admin
      .from("lessons").select("id").eq("ordinal", 1).single();

    const { error } = await admin.from("user_lesson_progress").insert({
      user_id: userId,
      lesson_id: lesson!.id,
      status: "in_progress",
      position: 42,
      final_correct: 3,
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from("user_lesson_progress")
      .select("position, final_correct")
      .eq("user_id", userId)
      .single();
    expect(data).toEqual({ position: 42, final_correct: 3 });
  });

  it("hai cột mới mặc định bằng 0", async () => {
    const { data: lesson } = await admin
      .from("lessons").select("id").eq("ordinal", 2).single();

    await admin.from("user_lesson_progress").insert({
      user_id: userId,
      lesson_id: lesson!.id,
      status: "available",
    });

    const { data } = await admin
      .from("user_lesson_progress")
      .select("position, final_correct")
      .eq("user_id", userId)
      .eq("lesson_id", lesson!.id)
      .single();
    expect(data).toEqual({ position: 0, final_correct: 0 });
  });
});
