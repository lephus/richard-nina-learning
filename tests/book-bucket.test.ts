import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { BOOK_BUCKET } from "@/lib/book/pages";

// Cần Supabase thật; thiếu khoá thì bỏ qua TƯỜNG MINH để `npm test` vẫn chạy
// được trên máy chưa cấu hình — cùng khuôn với tests/db-integrity.test.ts.
const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(URL && SERVICE);

describe.skipIf(!hasEnv)("bucket ảnh trang sách", () => {
  const db = createClient(URL ?? "http://localhost", SERVICE ?? "khong-dung", {
    auth: { persistSession: false },
  });

  it("tồn tại và KHÔNG công khai", async () => {
    const { data, error } = await db.storage.getBucket(BOOK_BUCKET);
    expect(error).toBeNull();
    expect(data?.public).toBe(false);
  });
});
