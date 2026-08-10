"use server";

import { redirect } from "next/navigation";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { createClient, createNonPersistingClient } from "@/lib/supabase/server";

// AuthState mang hai loại thông điệp: "error" (đỏ, role="alert",
// data-testid="auth-error" — Playwright chọn qua testid này) và "success"
// (thông điệp trung lập, KHÔNG phải lỗi — trước đây thông điệp thành công
// của signUp đi nhờ kênh error nên luôn hiện đỏ, sai ngữ nghĩa. Mở rộng type
// ở đây để tách hai kênh; login-form.tsx và register-form.tsx đọc theo
// `status` thay vì kiểm tra sự tồn tại của field `error`).
export type AuthState = { status: "error"; message: string } | { status: "success"; message: string } | null;

// Thông báo cố tình chung chung: phân biệt "sai mật khẩu" với "email chưa
// đăng ký" là để lộ email nào đã có tài khoản.
const GENERIC_SIGNIN_ERROR = "Email hoặc mật khẩu không đúng.";
const GENERIC_SIGNUP_ERROR = "Không tạo được tài khoản. Kiểm tra lại email và mật khẩu.";
// Lỗi hạ tầng (mạng/Supabase ngủ) không phải lỗi sai thông tin đăng nhập —
// gộp chung sẽ khiến người dùng tưởng nhầm mật khẩu trong khi hệ thống chỉ
// đang tạm thời không phản hồi.
const RETRYABLE_ERROR = "Hệ thống đang bận, vui lòng thử lại sau ít phút.";
// Thông điệp DUY NHẤT cho MỌI lần đăng ký hợp lệ về mặt định dạng — dù email
// đó thật sự vừa được tạo hay đã có tài khoản từ trước. Xem lý do đầy đủ ở
// comment trong signUp() bên dưới.
const SIGNUP_DONE_MESSAGE = "Tài khoản đã sẵn sàng. Vui lòng đăng nhập.";

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { status: "error", message: GENERIC_SIGNIN_ERROR };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (isAuthRetryableFetchError(error)) return { status: "error", message: RETRYABLE_ERROR };
    return { status: "error", message: GENERIC_SIGNIN_ERROR };
  }

  redirect("/dashboard");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!displayName) return { status: "error", message: "Vui lòng nhập tên hiển thị." };
  if (password.length < 8) return { status: "error", message: "Mật khẩu phải có ít nhất 8 ký tự." };

  // Client KHÔNG BAO GIỜ ghi cookie — xem JSDoc của createNonPersistingClient
  // trong src/lib/supabase/server.ts. Bắt buộc phải dùng client này ở đây:
  // dùng createClient() bình thường thì dù có bù lại bằng signOut() sau khi
  // thấy data.session, response vẫn phát Set-Cookie cho nhánh "email mới"
  // (lúc ghi phiên) mà không phát cho nhánh "email đã đăng ký" (lỗi bật ra
  // trước khi có phiên nào để ghi) — kênh dò email chuyển từ nội dung trang
  // sang chính header phản hồi, đọc được bằng curl/Python, trình duyệt
  // không cần chạy JS cũng thấy.
  const supabase = await createNonPersistingClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    // Trigger on_auth_user_created đọc đúng khoá này để đặt profiles.display_name.
    options: { data: { display_name: displayName } },
  });

  if (error) {
    if (isAuthRetryableFetchError(error)) return { status: "error", message: RETRYABLE_ERROR };
    // Email này đã có tài khoản. Quan sát trực tiếp trên project thật:
    // error.code === "user_already_exists", error.status === 422, khi
    // "Confirm email" tắt. Nhưng Supabase còn trả error.code ===
    // "email_exists" ở một số cấu hình khác của "Confirm email" — cùng một
    // tình huống (email đã đăng ký), chỉ khác mã lỗi theo cấu hình project.
    // Bỏ sót mã thứ hai thì nó rơi xuống GENERIC_SIGNUP_ERROR ở nhánh dưới,
    // mở lại đúng kênh dò email mà toàn bộ hàm này dựng ra để đóng: người
    // dò chỉ cần thử một email, so thông điệp, là biết email đó đã có tài
    // khoản hay chưa. Cả hai mã cùng dẫn tới MỘT thông điệp trung lập,
    // byte-for-byte với nhánh thành công bên dưới, để hai kết quả hết phân
    // biệt được cả ở nội dung trang lẫn ở việc có Set-Cookie hay không
    // (client không bao giờ ghi cookie, xem trên).
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return { status: "success", message: SIGNUP_DONE_MESSAGE };
    }
    return { status: "error", message: GENERIC_SIGNUP_ERROR };
  }

  // Thành công (email mới hoặc không): dù "Confirm email" tắt trên project
  // khiến Supabase trả kèm session ngay (tự động đăng nhập), client ở trên
  // không bao giờ ghi cookie nên phiên đó không tới được trình duyệt — chỉ
  // tồn tại trong response của lần gọi signUp() này rồi biến mất, không ai
  // cầm được token. Không cần signOut() bù lại (không có gì để xoá), và
  // không redirect. Trả đúng thông điệp trung lập cho MỌI lần đăng ký hợp
  // lệ, dù mới hay trùng email.
  //
  // Giá phải trả, chấp nhận được: người dùng THẬT SỰ mới giờ phải bấm đăng
  // nhập thêm một bước sau khi đăng ký (dùng createClient() bình thường,
  // ghi cookie thật), thay vì được đưa thẳng vào /dashboard. Đổi lấy việc
  // đóng hẳn kênh dò email — cả ở nội dung trang lẫn ở header phản hồi.
  return { status: "success", message: SIGNUP_DONE_MESSAGE };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
