import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export default async function LearnPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lessons")
    .select("ordinal")
    .eq("id", Number(lessonId))
    .single();

  // .single() báo "không có dòng nào khớp" bằng error.code === "PGRST116",
  // không phải bằng data === null suông — phải tách hai trường hợp: buổi
  // không tồn tại thật (PGRST116) đi tới notFound(), còn lỗi khác (mất mạng,
  // máy chủ khởi động lại, id không hợp lệ...) phải throw để error.tsx xử lý,
  // giống cách dashboard/page.tsx throw lessonsRes.error/progressRes.error.
  if (error && error.code !== "PGRST116") throw error;
  if (!data) notFound();

  return (
    <main className="flex flex-col gap-4">
      <h1 data-testid="learn-heading" className="text-2xl font-semibold">
        Buổi {data.ordinal}
      </h1>
      <p className="text-slate-600">Luồng học sẽ được triển khai ở lát 1b.</p>
      <Link href="/dashboard" className="underline">
        Về lộ trình
      </Link>
    </main>
  );
}
