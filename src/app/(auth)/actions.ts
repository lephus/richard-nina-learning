"use server";

import { redirect } from "next/navigation";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error: string } | null;

// Thông báo cố tình chung chung: phân biệt "sai mật khẩu" với "email chưa
// đăng ký" là để lộ email nào đã có tài khoản.
const GENERIC_SIGNIN_ERROR = "Email hoặc mật khẩu không đúng.";
const GENERIC_SIGNUP_ERROR = "Không tạo được tài khoản. Kiểm tra lại email và mật khẩu.";
// Lỗi hạ tầng (mạng/Supabase ngủ) không phải lỗi sai thông tin đăng nhập —
// gộp chung sẽ khiến người dùng tưởng nhầm mật khẩu trong khi hệ thống chỉ
// đang tạm thời không phản hồi.
const RETRYABLE_ERROR = "Hệ thống đang bận, vui lòng thử lại sau ít phút.";
const NEEDS_EMAIL_CONFIRMATION =
  "Tài khoản đã được tạo. Vui lòng kiểm tra email để xác nhận trước khi đăng nhập.";

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: GENERIC_SIGNIN_ERROR };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (isAuthRetryableFetchError(error)) return { error: RETRYABLE_ERROR };
    return { error: GENERIC_SIGNIN_ERROR };
  }

  redirect("/dashboard");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!displayName) return { error: "Vui lòng nhập tên hiển thị." };
  if (password.length < 8) return { error: "Mật khẩu phải có ít nhất 8 ký tự." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // Trigger on_auth_user_created đọc đúng khoá này để đặt profiles.display_name.
    options: { data: { display_name: displayName } },
  });
  if (error) return { error: GENERIC_SIGNUP_ERROR };

  // Khi bật xác nhận email trên project, signUp() thành công KHÔNG kèm
  // session (data.session === null) — người dùng chưa đăng nhập được cho tới
  // khi bấm link xác nhận. Chuyển hướng /dashboard lúc này chỉ để middleware
  // đá về /login mà không giải thích gì. Phải báo rõ và KHÔNG redirect.
  if (!data.session) return { error: NEEDS_EMAIL_CONFIRMATION };

  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
