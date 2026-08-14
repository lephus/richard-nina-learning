import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { danhTinhNguoiDung } from "@/lib/supabase/danh-tinh";

// Trước đây middleware giữ một danh sách TAY các route "được bảo vệ"
// (`PROTECTED = ["/dashboard", "/learn"]`) — sai không chỉ vì THIẾU (bỏ sót
// `/stats` và `/assessment`, hai trong bốn route của nhóm `(app)`), mà còn sai
// cả về HÌNH DẠNG: nó liệt kê đúng thứ sẽ còn PHÌNH RA theo mỗi tính năng mới
// — gần như mọi trang thêm sau này rơi vào `(app)`, vì đó là toàn bộ sản
// phẩm. Ai thêm một `page.tsx` mới dưới `(app)/` mà quên cập nhật danh sách ở
// đây sẽ lặp lại đúng lỗ hổng vừa ghi nhận, chỉ ở một route khác.
// `(app)/layout.tsx` tự mô tả mình là lớp chặn THỨ HAI, đỡ cho middleware cấu
// hình sai — nhưng với `/stats` và `/assessment` (bị bỏ sót) thì không có lớp
// THỨ NHẤT nào để đỡ, layout phải gánh một mình.
//
// Danh sách dưới đây đổi hướng: liệt kê CÔNG KHAI (route nào KHÔNG cần đăng
// nhập), không phải BẢO VỆ. Nhóm `(auth)` (đăng nhập/đăng ký) và `/` (chỉ
// redirect sang /dashboard, không đọc dữ liệu gì) là một tập hợp NHỎ và ỔN
// ĐỊNH — sản phẩm này hiếm khi thêm một luồng công khai mới, trong khi
// `(app)` gần như chắc chắn sẽ phình theo mỗi lát tính năng kế tiếp. Mặc định
// coi MỌI route khác là được bảo vệ (fail-closed): một trang mới thêm vào
// `(app)/` tự động được bảo vệ mà không cần sửa file này — middleware không
// còn cách nào lệch khỏi hệ thống tệp, vì nó không còn giữ một bản sao (dù là
// bản sao đúng hay sai) của hệ thống tệp đó nữa.
//
// `/api/*` TỪNG đứng ngoài phép kiểm này: một request POST JSON bị redirect
// sang /login sẽ vỡ hợp đồng response mà phía gọi (`fetch`) đang chờ, và
// route DUY NHẤT khi đó dưới `/api/` (`src/app/api/assessment/[id]/submit/route.ts`)
// tự kiểm `getUser()` (trả 401 JSON) và `Sec-Fetch-Site` — một lớp phòng thủ
// độc lập với middleware, nên miễn trừ là chính đáng.
//
// Lát 2a (Task 3) xoá route đó cùng cả luồng cũ — `src/app/api/` giờ RỖNG.
// Lý do biện minh cho miễn trừ đã mất, nhưng bản thân nhánh miễn trừ thì
// không tự mất theo: để nguyên nó sẽ thành một lối vòng qua xác thực đang mở
// sẵn, không có gì phía sau canh gác — route `/api/*` ĐẦU TIÊN mà một lát sau
// này thêm vào sẽ ÂM THẦM thừa hưởng lỗ hổng đó mà không ai chủ ý cho phép.
// Vì vậy KHÔNG còn nhánh riêng cho `/api/*` ở đây — nó rơi vào đúng mặc định
// fail-closed như mọi route khác. Lát nào thêm route API trở lại thì phải TỰ
// cân nhắc lại điều này một cách có ý thức (route đó có tự kiểm `getUser()`
// không? có cần trả JSON thay vì redirect không?), không được thừa hưởng một
// miễn trừ cũ đã mất căn cứ.
const PUBLIC_PATHS = ["/", "/login", "/register"];

function isProtectedRoute(pathname: string): boolean {
  return !PUBLIC_PATHS.includes(pathname);
}

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
  // response đã chốt thì phiên mới không ghi được vào cookie. danhTinhNguoiDung
  // gọi getClaims(), mà bên trong vẫn gọi getSession() nên việc làm mới token
  // phiên mà middleware gánh không đổi.
  //
  // Không còn try/catch ở đây: fail-closed (lỗi thoáng qua → coi như CHƯA
  // đăng nhập, không bao giờ coi như đã đăng nhập) giờ nằm TRONG helper, xem
  // danh-tinh.ts. Bọc thêm một lớp try/catch nữa ở đây là thừa, không phải
  // là mất đi sự đảm bảo đó.
  const user = await danhTinhNguoiDung(supabase);

  if (!user && isProtectedRoute(request.nextUrl.pathname)) {
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
