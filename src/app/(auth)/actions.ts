"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error: string } | null;

// Thông báo cố tình chung chung: phân biệt "sai mật khẩu" với "email chưa
// đăng ký" là để lộ email nào đã có tài khoản.
const GENERIC_SIGNIN_ERROR = "Email hoặc mật khẩu không đúng.";
const GENERIC_SIGNUP_ERROR = "Không tạo được tài khoản. Kiểm tra lại email và mật khẩu.";

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: GENERIC_SIGNIN_ERROR };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: GENERIC_SIGNIN_ERROR };

  redirect("/dashboard");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!displayName) return { error: "Vui lòng nhập tên hiển thị." };
  if (password.length < 8) return { error: "Mật khẩu phải có ít nhất 8 ký tự." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    // Trigger on_auth_user_created đọc đúng khoá này để đặt profiles.display_name.
    options: { data: { display_name: displayName } },
  });
  if (error) return { error: GENERIC_SIGNUP_ERROR };

  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
