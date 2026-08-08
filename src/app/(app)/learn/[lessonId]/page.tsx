import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lessonStatuses, type LessonRow, type ProgressRow } from "@/lib/curriculum/lesson-status";
import { loadNextStep } from "@/lib/assessment/current-step";
import { loadContext } from "@/lib/lesson/session";
import { itemAt, scoreOf, TOTAL_ITEMS } from "@/lib/lesson/item-plan";
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

  // Tấm chắn THỨ HAI, độc lập với tấm chắn ở trên (Task 7 review, finding
  // A): `lessonStatuses` chỉ nối chuỗi buổi→buổi, nó không biết gì về các
  // slot ôn tập/kiểm tra xen giữa trong chuỗi 35 hoạt động — buổi 3 có thể
  // "available" theo nó (buổi 2 đã completed) dù ôn tập(1,2) đứng trước còn
  // dang dở. dashboard đã tự chặn việc BẤM vào buổi 3 lúc đó
  // (data-status="locked", không render <Link>), nhưng đó chỉ là giao diện —
  // gõ thẳng /learn/{id buổi 3} vào thanh địa chỉ vẫn phải bị chặn ở đây.
  // Buổi đã học xong luôn được đọc lại (không có gì phải khoá thêm); buổi
  // CHƯA xong chỉ được vào khi nó đúng là slot `nextStep` đang trỏ tới.
  const isCompleted = statuses.get(id) === "completed";
  if (!isCompleted) {
    const { action } = await loadNextStep(supabase, user.id, new Date());
    const isCurrentSlot = action.kind === "lesson" && action.lesson === lesson.ordinal;
    if (!isCurrentSlot) redirect("/dashboard");
  }

  const { data: prog, error: progError } = await supabase
    .from("user_lesson_progress")
    .select("position, final_correct")
    .eq("user_id", user.id)
    .eq("lesson_id", id)
    .maybeSingle();
  if (progError) throw progError;

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
        ordinal={lesson.ordinal}
        initialPosition={position}
        initialItem={done ? null : buildItem(itemAt(position), ctx)}
        initialDone={done}
        initialScore={done ? scoreOf(prog?.final_correct ?? 0) : undefined}
        isLast={lessons[lessons.length - 1]?.id === id}
      />
    </main>
  );
}
