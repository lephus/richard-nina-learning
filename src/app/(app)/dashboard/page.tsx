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

  // Không có generic Database trên client nên postgrest-js suy luận MỌI quan
  // hệ nhúng có sub-field là mảng, bất kể FK thật sự là 1-1 hay 1-n (xem
  // node_modules/@supabase/postgrest-js/src/select-query-parser/result.ts).
  // Ép qua `unknown` trước vì TS không cho ép thẳng hai kiểu không giao nhau
  // đủ. Runtime thực sự trả về một đối tượng vì lessons.grammar_lesson_id là
  // khoá ngoại `unique` (supabase/migrations/0002_curriculum.sql:4).
  const lessons = (lessonsRes.data ?? []) as unknown as LessonWithGrammar[];
  const progress = (progressRes.data ?? []) as ProgressRow[];
  const statuses = lessonStatuses(lessons, progress);

  // Chỉ trỏ "Học tiếp" vào buổi THẬT SỰ học được (available/in_progress).
  // "!== completed" là bẫy: một dòng user_lesson_progress mới được ghi tay mà
  // chưa set status rơi vào default 'locked' của cột (xem
  // supabase/migrations/0003_user_state.sql:14) — dòng đó cũng "!== completed"
  // nên vẫn lọt qua, dẫn thẳng người học vào một buổi đang khoá.
  const next = lessons.find((l) => {
    const status = statuses.get(l.id);
    return status === "available" || status === "in_progress";
  });

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
