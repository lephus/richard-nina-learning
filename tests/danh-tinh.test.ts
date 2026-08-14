import { describe, expect, it } from "vitest";
import { danhTinhNguoiDung } from "@/lib/supabase/danh-tinh";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Client giả tối thiểu: chỉ cần đúng hình dạng `auth.getClaims()`. */
function gia(ketQua: unknown): SupabaseClient {
  return { auth: { getClaims: async () => ketQua } } as unknown as SupabaseClient;
}

describe("danhTinhNguoiDung", () => {
  it("trả id từ claims.sub khi token hợp lệ", async () => {
    const r = await danhTinhNguoiDung(
      gia({ data: { claims: { sub: "abc-123", role: "authenticated" } }, error: null }),
    );
    expect(r).toEqual({ id: "abc-123" });
  });

  it("trả null khi getClaims báo lỗi — chữ ký sai hoặc token hết hạn", async () => {
    const r = await danhTinhNguoiDung(
      gia({ data: null, error: { message: "invalid JWT" } }),
    );
    expect(r).toBeNull();
  });

  it("trả null khi không có phiên nào", async () => {
    expect(await danhTinhNguoiDung(gia({ data: null, error: null }))).toBeNull();
  });

  // `sub` là thứ DUY NHẤT hàm này lấy ra, nên thiếu nó phải là `null` chứ không
  // phải `{ id: undefined }` — một id `undefined` lọt xuống `.eq("user_id", ...)`
  // sẽ thành truy vấn không khớp gì thay vì một lỗi thấy được.
  it("trả null khi claims thiếu sub", async () => {
    const r = await danhTinhNguoiDung(
      gia({ data: { claims: { role: "authenticated" } }, error: null }),
    );
    expect(r).toBeNull();
  });

  // Không được ném: mọi chỗ gọi đều dùng kết quả để quyết định chuyển hướng,
  // và một exception ở đó thành trang lỗi thay vì màn hình đăng nhập.
  it("không ném khi getClaims tự ném", async () => {
    const noi = { auth: { getClaims: async () => { throw new Error("mạng hỏng"); } } };
    await expect(
      danhTinhNguoiDung(noi as unknown as SupabaseClient),
    ).resolves.toBeNull();
  });
});
