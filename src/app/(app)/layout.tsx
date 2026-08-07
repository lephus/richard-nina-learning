import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Lớp chặn thứ hai. Không thừa: middleware có thể bị bỏ qua khi matcher
  // cấu hình sai, và đó là loại lỗi âm thầm để lộ dữ liệu.
  if (!user) redirect("/login");

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col p-6">
      <header className="mb-6 flex items-center justify-between">
        <span className="font-semibold">Học TOEIC</span>
        <form action={signOut}>
          <button type="submit" className="text-sm underline">
            Đăng xuất
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}
