import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Client Supabase cho Server Component, Server Action và route handler.
 *
 * LUÔN tạo mới cho mỗi lần render — không bao giờ dùng chung giữa các request,
 * vì cookie phiên của người này sẽ rò sang người khác.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        // @supabase/ssr 0.12 kèm tham số `headers` thứ hai (Cache-Control,
        // Expires, Pragma) để chặn CDN/proxy cache response có Set-Cookie —
        // xem node_modules/@supabase/ssr/dist/module/types.d.ts. Kho cookies()
        // của Next trong Server Component/Server Action chỉ có API ghi cookie,
        // KHÔNG có API ghi header response tuỳ ý ở đây (không có NextResponse
        // như trong middleware), nên phần `headers` không áp dụng được tại chỗ
        // này — đã nhận tham số để không tự ý bỏ, dù chưa dùng hết được. An
        // toàn cache vẫn được giữ vì src/middleware.ts gán Cache-Control:
        // private, no-store cho MỌI response, kể cả response render qua client
        // này — đây là phụ thuộc chéo file, có chủ đích, không phải sơ suất.
        setAll(cookiesToSet, _headers) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Next chặn ghi cookie từ Server Component. Bỏ qua an toàn vì
            // middleware đã làm mới token trước khi request tới đây.
          }
        },
      },
    },
  );
}

/**
 * Client Supabase KHÔNG BAO GIỜ ghi cookie phiên — `setAll` là no-op tuyệt
 * đối, không đụng tới `cookies()` của Next dù `@supabase/ssr` gọi tới.
 *
 * Chỉ dùng cho `signUp()` trong `(auth)/actions.ts`. Lý do: `setAll` trong
 * `createClient()` ở trên chỉ được `@supabase/ssr` gọi khi có phiên để ghi
 * (xem `node_modules/@supabase/ssr/dist/main/createServerClient.js` —
 * `applyServerStorage` chỉ gọi `setAll` lúc `setItems`/`removedItems` khác
 * rỗng). Đăng ký địa chỉ MỚI khi autoconfirm bật khiến Supabase trả kèm
 * session ngay → `setAll` chạy → response mang `Set-Cookie`. Đăng ký địa
 * chỉ ĐÃ tồn tại thì lỗi bật ra trước khi có session nào để ghi → `setAll`
 * không bao giờ chạy → response không có `Set-Cookie`. Có `Set-Cookie` hay
 * không tự nó đã là kênh dò email — độc lập với nội dung trang HTML, đọc
 * được bằng curl/Python mà không cần trình duyệt. Gọi `signOut()` bù lại
 * sau đó (cách làm cũ) vẫn để lại ít nhất một `Set-Cookie` (cookie bị xoá
 * cũng phải phát `Set-Cookie` với ngày hết hạn trong quá khứ), nên không
 * đóng được kênh này — phải chặn từ gốc bằng cách không bao giờ cho
 * `setAll` chạm tới `cookies()`.
 */
export async function createNonPersistingClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        // Cố tình để trống — xem giải thích ở JSDoc phía trên hàm.
        setAll() {},
      },
    },
  );
}
