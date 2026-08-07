import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TEST_EMAIL } from "./test-user";

export function adminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Thieu SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY trong .env.local");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Xoá tài khoản kiểm thử nếu còn sót từ lần chạy trước. */
export async function deleteTestUser(admin: SupabaseClient): Promise<void> {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = data?.users.find((u) => u.email === TEST_EMAIL);
  if (found) await admin.auth.admin.deleteUser(found.id);
}
