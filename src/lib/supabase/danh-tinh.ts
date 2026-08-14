import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Danh tính người dùng cho request hiện tại, **không gọi mạng**.
 *
 * Thay cho `auth.getUser()`, thứ mà mọi trang từng gọi. `getUser()` hỏi máy chủ
 * Supabase Auth mỗi lần — đo được 127–135ms — và app gọi nó BA lần cho một lần
 * điều hướng (middleware, layout, chính trang), tức ~64% thời gian tải trang chỉ
 * để hỏi đi hỏi lại cùng một token là của ai.
 *
 * `getClaims()` xác thực chữ ký **tại chỗ**: project ký JWT bằng ES256 (bất đối
 * xứng), nên SDK kiểm được bằng khoá công khai JWKS. Cache khoá là biến cấp
 * module dùng chung cho mọi client trong cùng tiến trình (`GLOBAL_JWKS` trong
 * `@supabase/auth-js`), TTL 10 phút — nên lần nạp đầu ~321ms trả một lần cho cả
 * tiến trình, còn mỗi lần xác thực sau tốn 1–2ms.
 *
 * Đây KHÔNG phải hạ chuẩn thành "tin cookie": chữ ký vẫn được kiểm bằng mật mã.
 * Cái mất là khả năng biết ngay một phiên đã bị thu hồi ở nơi khác — token sống
 * 60 phút. Đăng xuất trên chính máy đang dùng vẫn tức thì vì cookie bị xoá.
 *
 * `getClaims()` gọi `getSession()` bên trong, nên việc làm mới token phiên mà
 * middleware vốn gánh vẫn diễn ra như cũ.
 *
 * Đòi thêm `claims.role === "authenticated"` bên cạnh `sub`: `getUser()` cũ
 * NGẦM đòi hỏi điều này (nó chỉ trả về người dùng cho token hợp lệ của một
 * phiên đăng nhập), còn `getClaims()` chỉ kiểm CHỮ KÝ — nó trả claims cho BẤT
 * KỲ token nào project đã ký và còn hạn, kể cả token có `sub` nhưng
 * `role` khác `authenticated` (vd. `anon`, hoặc vai trò tuỳ biến qua Custom
 * Access Token Hook). Hiện tại không có cách khai thác được: key đối xứng
 * (anon/service cũ) là HS256 nên rơi xuống nhánh gọi mạng `getUser()` bên
 * trong SDK, token của project khác không tra được `kid` trong JWKS của
 * project này, và RLS `to authenticated` tự chặn phần còn lại — nhưng đó là
 * bảo đảm đang tồn tại NHỜ những gì key hiện có TÌNH CỜ là, không phải điều gì
 * hàm này tự đảm bảo. Viết tường minh ra đây để bảo đảm không còn phụ thuộc
 * ngầm vào việc bố trí key không đổi.
 */
export async function danhTinhNguoiDung(
  supabase: SupabaseClient,
): Promise<{ id: string } | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error) return null;
    const sub = data?.claims?.sub;
    const role = data?.claims?.role;
    // Thiếu `sub` phải thành `null`, không phải `{ id: undefined }`: một id
    // `undefined` lọt xuống `.eq("user_id", ...)` sẽ cho truy vấn rỗng lặng lẽ
    // thay vì một lỗi nhìn thấy được.
    return typeof sub === "string" && sub.length > 0 && role === "authenticated"
      ? { id: sub }
      : null;
  } catch {
    // Fail closed, cùng nguyên tắc mà middleware đã ghi: lỗi thoáng qua thì coi
    // như CHƯA đăng nhập, không bao giờ coi như đã đăng nhập.
    return null;
  }
}
