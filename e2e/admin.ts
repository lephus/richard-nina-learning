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

/**
 * Xoá MỘT tài khoản theo đúng email truyền vào, nếu có. Luôn tra ra user_id
 * trước rồi mới xoá theo đúng id đó — không có đường nào xoá theo điều kiện
 * rộng hơn một email cụ thể, nên không thể vô tình đụng tài khoản khác
 * (kể cả tài khoản thật của chủ dự án) trong bảng auth.users dùng chung.
 */
export async function deleteUserByEmail(admin: SupabaseClient, email: string): Promise<void> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  // Nuốt lỗi ở đây thì `found` luôn undefined, không xoá gì, và teardown báo
  // thành công giả — để lại tài khoản thật (mật khẩu nằm trong
  // e2e/test-user.ts, đã commit) sống trong bảng auth production.
  if (error) throw error;
  const found = data.users.find((u) => u.email === email);
  if (found) await admin.auth.admin.deleteUser(found.id);
}

/** Xoá tài khoản kiểm thử cố định (TEST_EMAIL) nếu còn sót từ lần chạy trước. */
export async function deleteTestUser(admin: SupabaseClient): Promise<void> {
  await deleteUserByEmail(admin, TEST_EMAIL);
}
