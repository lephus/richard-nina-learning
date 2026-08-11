import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TOTAL_GROUPS } from "@/lib/curriculum/groups";
import {
  groupStates, groupDone, nextActivity, toAssessmentRow, toCursorRow,
  type CursorRow,
} from "@/lib/curriculum/progress";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // HAI truy vấn nhỏ, không phải ba cộng một vòng duyệt 35 slot như trước.
  // Không đọc `lessons` ở đây: dashboard chỉ cần ordinal, mà ordinal suy được
  // từ chính `scope` của assessments và từ số học nhóm.
  const [assessmentsRes, cursorsRes] = await Promise.all([
    supabase
      .from("assessments")
      .select("id, type, scope, status, passed, score, parent_id")
      .eq("user_id", user.id)
      .order("id"),
    supabase
      .from("lesson_cursor")
      .select("lesson_id, word_index, lessons(ordinal)")
      .eq("user_id", user.id),
  ]);
  if (assessmentsRes.error) throw assessmentsRes.error;
  if (cursorsRes.error) throw cursorsRes.error;

  const assessments = (assessmentsRes.data ?? []).map(toAssessmentRow);

  // Không có generic Database trên client nên postgrest-js suy luận mọi quan hệ
  // nhúng là mảng dù FK là 1-1. Ép qua `unknown` trước — cùng lý do đã ghi ở
  // load-cards.ts.
  const cursorRows = (cursorsRes.data ?? []) as unknown as {
    lesson_id: number; word_index: number; lessons: { ordinal: number } | null;
  }[];
  const ordinalById = new Map(
    cursorRows.flatMap((r) => (r.lessons ? [[r.lesson_id, r.lessons.ordinal] as const] : [])),
  );
  const cursors = cursorRows
    .map((r) => toCursorRow(r, ordinalById))
    .filter((c): c is CursorRow => c !== null);

  const states = groupStates(assessments, cursors);
  const doneCount = states.filter(groupDone).length;
  const next = nextActivity(states);

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Hôm nay học gì?</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/vocab"
          data-testid="track-vocab"
          className="flex flex-col items-center gap-1 rounded border border-slate-200 bg-white p-8 text-center hover:border-slate-400"
        >
          <span className="text-3xl" aria-hidden>📘</span>
          <span className="font-semibold tracking-wide">TỪ VỰNG</span>
          <span className="text-sm text-slate-600">
            {doneCount}/{TOTAL_GROUPS} nhóm · 605 từ
          </span>
          {/* Gợi ý, KHÔNG phải luật: 10 nhóm vẫn mở hết, bấm thẳng nhóm 7 lúc
              nào cũng được. Dòng này chỉ đỡ cho người học không phải nhớ mình
              đang dở ở đâu. */}
          {next && (
            <span data-testid="continue-hint" className="mt-2 text-xs text-slate-500">
              Tiếp tục: Nhóm {next.group} ·{" "}
              {/* `lessonOrdinal` là số thứ tự TOÀN CỤC — cùng nhãn với trang
                  /vocab và tiêu đề trang học. `null` nghĩa là ô ôn tập. */}
              {next.lessonOrdinal === null ? "Ôn tập" : `Buổi ${next.lessonOrdinal}`}
            </span>
          )}
        </Link>

        <div
          data-testid="track-grammar"
          className="flex flex-col items-center gap-1 rounded border border-slate-200 bg-slate-100 p-8 text-center text-slate-400"
        >
          <span className="text-3xl" aria-hidden>📗</span>
          <span className="font-semibold tracking-wide">NGỮ PHÁP</span>
          <span className="text-sm">20 bài</span>
          {/* Lộ trình ngữ pháp là lát 2c. Thẻ vẫn hiện để hình dạng dashboard
              đúng ngay từ bây giờ, nhưng chưa dẫn đi đâu. */}
          <span className="mt-2 text-xs">Sắp có</span>
        </div>
      </div>
    </main>
  );
}
