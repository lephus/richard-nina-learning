import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lessonStatuses, type LessonRow, type ProgressRow } from "@/lib/curriculum/lesson-status";
import { loadContext } from "@/lib/lesson/session";
import { itemAt, TOTAL_ITEMS } from "@/lib/lesson/item-plan";
import { buildItem } from "@/lib/lesson/build-item";
import { LessonRunner } from "@/components/lesson/lesson-runner";

export default async function LearnPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const id = Number(lessonId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [lessonsRes, progressRes] = await Promise.all([
    supabase.from("lessons").select("id, ordinal").order("ordinal"),
    supabase.from("user_lesson_progress").select("lesson_id, status"),
  ]);
  if (lessonsRes.error) throw lessonsRes.error;
  if (progressRes.error) throw progressRes.error;

  const lessons = (lessonsRes.data ?? []) as LessonRow[];
  const lesson = lessons.find((l) => l.id === id);
  if (!lesson) notFound();

  // Chặn ở SERVER, không dựa vào việc giấu link — dashboard nay bấm được nên
  // URL gõ tay là đường tấn công thật.
  const statuses = lessonStatuses(lessons, (progressRes.data ?? []) as ProgressRow[]);
  if (statuses.get(id) === "locked") redirect("/dashboard");

  const { data: prog } = await supabase
    .from("user_lesson_progress")
    .select("position, final_correct")
    .eq("lesson_id", id)
    .maybeSingle();

  const position = prog?.position ?? 0;
  const done = position >= TOTAL_ITEMS;
  const ctx = await loadContext(supabase, id, user.id);

  return (
    <main className="flex flex-col gap-6">
      <h1 data-testid="learn-heading" className="text-2xl font-semibold">
        Buổi {lesson.ordinal}
      </h1>
      <LessonRunner
        lessonId={id}
        initialPosition={position}
        initialItem={done ? null : buildItem(itemAt(position), ctx)}
        initialDone={done}
        initialScore={done ? Math.round(((prog?.final_correct ?? 0) / 15) * 100) : undefined}
      />
    </main>
  );
}
