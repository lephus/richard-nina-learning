import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  lessonStatuses,
  type LessonRow,
  type LessonStatus,
  type ProgressRow,
} from "@/lib/curriculum/lesson-status";

interface LessonWithGrammar extends LessonRow {
  grammar_lessons: { title: string } | null;
}

const LABEL: Record<LessonStatus, string> = {
  locked: "Chưa mở",
  available: "Sẵn sàng",
  in_progress: "Đang học",
  completed: "Đã xong",
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const [lessonsRes, progressRes] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, ordinal, grammar_lessons(title)")
      .order("ordinal"),
    supabase.from("user_lesson_progress").select("lesson_id, status"),
  ]);

  if (lessonsRes.error) throw lessonsRes.error;
  if (progressRes.error) throw progressRes.error;

  const lessons = (lessonsRes.data ?? []) as unknown as LessonWithGrammar[];
  const progress = (progressRes.data ?? []) as ProgressRow[];
  const statuses = lessonStatuses(lessons, progress);

  const next = lessons.find((l) => statuses.get(l.id) !== "completed");

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Lộ trình 20 buổi</h1>
        {next && (
          <Link
            href={`/learn/${next.id}`}
            data-testid="continue-link"
            className="rounded bg-slate-900 px-4 py-2 text-white"
          >
            Học tiếp
          </Link>
        )}
      </div>

      <ol className="flex flex-col gap-2">
        {lessons.map((lesson) => {
          const status = statuses.get(lesson.id) ?? "locked";
          return (
            <li
              key={lesson.id}
              data-testid="lesson-row"
              data-status={status}
              className="flex items-center justify-between rounded border border-slate-200 bg-white px-4 py-3"
            >
              <span>
                <span className="mr-2 font-medium">Buổi {lesson.ordinal}</span>
                <span className="text-slate-600">{lesson.grammar_lessons?.title}</span>
              </span>
              <span className="text-sm text-slate-500">{LABEL[status]}</span>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
