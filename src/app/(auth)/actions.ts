"use server";

import { redirect } from "next/navigation";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // Trigger on_auth_user_created đọc đúng khoá này để đặt profiles.display_name.
    options: { data: { display_name: displayName } },
  });

  if (error) {
    if (isAuthRetryableFetchError(error)) return { status: "error", message: RETRYABLE_ERROR };
    // Email này đã có tài khoản. Với "Confirm email" tắt trên project hiện
    // tại, Supabase trả lỗi `user_already_exists` riêng cho đúng trường hợp
    // này — nửa đầu của kênh dò email: địa chỉ mới không lỗi, địa chỉ cũ
    // luôn lỗi. Trả CÙNG thông điệp trung lập với nhánh thành công bên
    // dưới, byte-for-byte, để hai kết quả hết phân biệt được.
    if (error.code === "user_already_exists") {
      return { status: "success", message: SIGNUP_DONE_MESSAGE };
    }
    return { status: "error", message: GENERIC_SIGNUP_ERROR };
  }

  // Nửa sau của kênh dò email: khi "Confirm email" tắt, signUp() thành công
  // trả về NGAY một session — tự động đăng nhập. Nếu redirect /dashboard ở
  // đây như trước, request tiếp theo tới /dashboard sẽ thành công cho địa
  // chỉ mới và thất bại cho địa chỉ đã đăng ký (không có session) — vẫn là
  // hai kết quả phân biệt được dù trang HTML trả về giống hệt nhau. Phải huỷ
  // ngay session vừa được tự tạo, không redirect, và trả đúng thông điệp
  // trung lập ở trên cho MỌI lần đăng ký hợp lệ.
  //
  // Giá phải trả, chấp nhận được: người dùng THẬT SỰ mới giờ phải bấm đăng
  // nhập thêm một bước sau khi đăng ký, thay vì được đưa thẳng vào
  // /dashboard. Đổi lấy việc đóng hẳn kênh dò email.
  if (data.session) {
    await supabase.auth.signOut();
  }

  return { status: "success", message: SIGNUP_DONE_MESSAGE };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
