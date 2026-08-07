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

  const { data } = await supabase
    .from("lessons")
    .select("ordinal")
    .eq("id", Number(lessonId))
    .single();

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
