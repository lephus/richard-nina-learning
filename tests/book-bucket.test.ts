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
  const db = createClient(URL ?? "http://localhost", SERVICE ?? "khong-dung", {
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
    // Kiem ca hai bien: lech mot don vi o buoc doi ten se lo ra o day.
    expect(names[0]).toBe("001.webp");
    expect(names[TOTAL_BOOK_PAGES - 1]).toBe("112.webp");
  });

  // Hai `it` phia tren dung SERVICE ROLE — key nay BO QUA RLS hoan toan, nen
  // chung van xanh ngay ca khi policy read_book_pages bi xoa mat hoac bi noi
  // rong ra cho ca vai tro anon. Hai bai test duoi day moi thuc su chay qua
  // RLS: mot client that su dang nhap (vai tro authenticated) va mot client
  // chua dang nhap (vai tro anon), cung khuon voi tests/rls.test.ts.
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

    // Don tai khoan test that khoi auth.users — khong don se de lai tai khoan
    // that trong he thong xac thuc moi lan chay tren project That.
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

      // RLS co the chan ngay o buoc ky URL (createSignedUrl tra loi) hoac
      // muon hon o buoc GET thuc su vao URL da ky — kiem ca hai truong hop
      // thay vi gia dinh chan o dau, vi hanh vi that la bang chung, khong
      // phai suy doan.
      if (error) {
        expect(error).not.toBeNull();
      } else {
        const res = await fetch(data!.signedUrl);
        expect(res.status, "URL ky cho client an danh van tai duoc anh — RLS ro ri").not.toBe(200);
      }
    });
  });
});
