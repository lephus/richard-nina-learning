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
        setAll(cookiesToSet) {
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
