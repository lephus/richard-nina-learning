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

  it("bài bổ túc trỏ được tới lần thử đã trượt", async () => {
    const later = new Date(Date.now() + 60_000).toISOString();

    const { data: parent, error: pErr } = await admin.from("assessments").insert({
      user_id: userId, type: "review", scope: [1, 2],
      status: "submitted", score: 60, passed: false, expires_at: later,
    }).select("id").single();
    expect(pErr).toBeNull();

    const { data: child, error: cErr } = await admin.from("assessments").insert({
      user_id: userId, type: "remedial", scope: [1, 2],
      parent_id: parent!.id, expires_at: later,
    }).select("id, parent_id").single();
    expect(cErr).toBeNull();
    expect(child!.parent_id).toBe(parent!.id);
  });

  it("bài thường có parent_id null", async () => {
    const later = new Date(Date.now() + 60_000).toISOString();
    const { data } = await admin.from("assessments").insert({
      user_id: userId, type: "test", scope: [1, 2, 3, 4], expires_at: later,
    }).select("parent_id").single();
    expect(data!.parent_id).toBeNull();
  });

  it("xoá lần thử gốc thì bài bổ túc biến mất theo", async () => {
    const later = new Date(Date.now() + 60_000).toISOString();
    const { data: p } = await admin.from("assessments").insert({
      user_id: userId, type: "review", scope: [5, 6],
      status: "submitted", passed: false, expires_at: later,
    }).select("id").single();
    const { data: c } = await admin.from("assessments").insert({
      user_id: userId, type: "remedial", scope: [5, 6],
      parent_id: p!.id, expires_at: later,
    }).select("id").single();

    await admin.from("assessments").delete().eq("id", p!.id);
    const { data: gone } = await admin.from("assessments").select("id").eq("id", c!.id);
    expect(gone).toEqual([]);
  });
});
