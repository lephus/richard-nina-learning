import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/dashboard", "/learn"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // @supabase/ssr 0.12 truyền kèm các header chống cache. Bỏ qua chúng
          // thì CDN có thể cache response mang Set-Cookie và phục vụ phiên của
          // người này cho người khác.
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Phải gọi SỚM, trước khi sinh response. Nếu token làm mới xong sau khi
  // response đã chốt thì phiên mới không ghi được vào cookie.
  let user = null;
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  } catch {
    // getUser() gọi mạng tới Supabase Auth — có thể lỗi mạng/timeout tạm
    // thời. Fail closed: coi như CHƯA đăng nhập, không bao giờ coi như đã
    // đăng nhập khi có lỗi. Route bảo vệ sẽ bị chuyển hướng /login (an
    // toàn), route công khai vẫn render bình thường.
    user = null;
  }

  const isProtected = PROTECTED.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    response = NextResponse.redirect(url);
  }

  // Vercel chạy sau CDN; response của route xác thực không được cache. Gán
  // header ở MỘT chỗ duy nhất sau khi `response` đã chốt (dù là redirect
  // hay fallthrough) để hai nhánh không thể lệch nhau.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
