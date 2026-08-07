"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type AuthState } from "@/app/(auth)/actions";

export function RegisterForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(signUp, null);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-semibold">Đăng ký</h1>

      <label className="flex flex-col gap-1">
        <span className="text-sm">Tên hiển thị</span>
        <input
          name="displayName"
          type="text"
          required
          className="rounded border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm">Mật khẩu</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded border border-slate-300 px-3 py-2"
        />
        <span className="text-xs text-slate-500">Ít nhất 8 ký tự</span>
      </label>

      {state?.error && (
        <p data-testid="auth-error" role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Đang tạo tài khoản…" : "Đăng ký"}
      </button>

      <p className="text-sm">
        Đã có tài khoản?{" "}
        <Link href="/login" className="underline">
          Đăng nhập
        </Link>
      </p>
    </form>
  );
}
