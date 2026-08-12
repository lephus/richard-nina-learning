import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BOOK_BUCKET, TOTAL_BOOK_PAGES } from "@/lib/book/pages";

// Cần Supabase thật; thiếu khoá thì bỏ qua TƯỜNG MINH để `npm test` vẫn chạy
// được trên máy chưa cấu hình — cùng khuôn với tests/db-integrity.test.ts.
const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(URL && SERVICE && ANON);

describe.skipIf(!hasEnv)("bucket ảnh trang sách", () => {
  const db = createClient(URL ?? "http://localhost", SERVICE ?? "không-dùng", {
    auth: { persistSession: false },
  });

  it("tồn tại và KHÔNG công khai", async () => {
    const { data, error } = await db.storage.getBucket(BOOK_BUCKET);
    expect(error).toBeNull();
    expect(data?.public).toBe(false);
  });

  it("chứa đủ 112 ảnh, đúng tên 001.webp..112.webp", async () => {
    const { data, error } = await db.storage
      .from(BOOK_BUCKET)
      .list("", { limit: 1000 });
    expect(error).toBeNull();

    const names = (data ?? []).map((o) => o.name).sort();
    expect(names).toHaveLength(TOTAL_BOOK_PAGES);
    // Kiểm cả hai biên: lệch một đơn vị ở bước đổi tên sẽ lộ ra ở đây.
    expect(names[0]).toBe("001.webp");
    expect(names[TOTAL_BOOK_PAGES - 1]).toBe("112.webp");
  });

  // Hai `it` phía trên dùng SERVICE ROLE — key này BỎ QUA RLS hoàn toàn, nên
  // chúng vẫn xanh ngay cả khi policy read_book_pages bị xóa mất hoặc bị nới
  // rộng ra cho cả vai trò anon. Hai bài test dưới đây mới thực sự chạy qua
  // RLS: một client thật sự đăng nhập (vai trò authenticated) và một client
  // chưa đăng nhập (vai trò anon), cùng khuôn với tests/rls.test.ts.
  describe("policy read_book_pages qua RLS", () => {
    let reader: SupabaseClient;
    let readerId = "";

    beforeAll(async () => {
      const email = `book-reader-${Date.now()}@test.local`;
      const { data, error } = await db.auth.admin.createUser({
        email, password: "test-pass-1234", email_confirm: true,
      });
      if (error) throw error;
      readerId = data.user!.id;

      reader = createClient(URL!, ANON!);
      await reader.auth.signInWithPassword({ email, password: "test-pass-1234" });
    });

    // Dọn tài khoản test thật khỏi auth.users — không dọn sẽ để lại tài khoản
    // thật trong hệ thống xác thực mỗi lần chạy trên project Thật.
    afterAll(async () => {
      if (readerId) await db.auth.admin.deleteUser(readerId);
    });

    it("client ĐÃ ĐĂNG NHẬP tạo được signed URL cho 001.webp và tải được ảnh", async () => {
      const { data, error } = await reader.storage
        .from(BOOK_BUCKET)
        .createSignedUrl("001.webp", 60);
      expect(error).toBeNull();
      expect(data?.signedUrl).toBeTruthy();

      const res = await fetch(data!.signedUrl);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("image");
    });

    it("client ẨN DANH (chưa đăng nhập) KHÔNG lấy được ảnh 001.webp", async () => {
      const anon = createClient(URL!, ANON!);
      const { data, error } = await anon.storage
        .from(BOOK_BUCKET)
        .createSignedUrl("001.webp", 60);

      // RLS có thể chặn ngay ở bước ký URL (createSignedUrl trả lỗi) hoặc
      // muộn hơn ở bước GET thực sự vào URL đã ký — kiểm cả hai trường hợp
      // thay vì giả định chặn ở đâu, vì hành vi thật là bằng chứng, không
      // phải suy đoán.
      if (error) {
        expect(error).not.toBeNull();
      } else {
        const res = await fetch(data!.signedUrl);
        expect(res.status, "URL ký cho client ẩn danh vẫn tải được ảnh — RLS rò rỉ").not.toBe(200);
      }
    });
  });
});
