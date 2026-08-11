import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { wordRangeLabel, WORDS_PER_LESSON } from "@/lib/curriculum/groups";
import {
  groupStates, groupDone, toAssessmentRow, toCursorRow,
  type ActivityState, type CursorRow,
} from "@/lib/curriculum/progress";

export default async function VocabPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [lessonsRes, assessmentsRes, cursorsRes] = await Promise.all([
    supabase.from("lessons").select("id, ordinal").order("ordinal"),
    // `.eq("user_id", user.id)` tường minh dù RLS đã lọc đúng — không dựa vào
    // một lớp phòng thủ duy nhất. Không chọn `is_correct` hay đáp án ở đâu
    // trong cả trang: chúng không có việc gì ở màn hình danh sách.
    supabase
      .from("assessments")
      .select("id, type, scope, status, passed, score, parent_id")
      .eq("user_id", user.id)
      .order("id"),
    supabase.from("lesson_cursor").select("lesson_id, word_index").eq("user_id", user.id),
  ]);
  if (lessonsRes.error) throw lessonsRes.error;
  if (assessmentsRes.error) throw assessmentsRes.error;
  if (cursorsRes.error) throw cursorsRes.error;

  const lessons = lessonsRes.data ?? [];
  const idByOrdinal = new Map(lessons.map((l) => [l.ordinal as number, l.id as number]));
  const ordinalById = new Map(lessons.map((l) => [l.id as number, l.ordinal as number]));

  const assessments = (assessmentsRes.data ?? []).map(toAssessmentRow);
  const cursors = (cursorsRes.data ?? [])
    .map((r) => toCursorRow(r as { lesson_id: number; word_index: number }, ordinalById))
    .filter((c): c is CursorRow => c !== null);

  const states = groupStates(assessments, cursors);
  const doneCount = states.filter(groupDone).length;

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Từ vựng</h1>
        <p data-testid="group-summary" className="mt-1 text-sm text-slate-600">
          {doneCount}/{states.length} nhóm hoàn thành
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-200">
          <div
            className="h-full bg-slate-700"
            style={{ width: `${(doneCount / states.length) * 100}%` }}
          />
        </div>
      </div>

      <ol className="flex flex-col gap-3">
        {states.map((s) => (
          <li
            key={s.group}
            data-testid="group-row"
            data-group={s.group}
            className="rounded border border-slate-200 bg-white p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="font-medium">
                NHÓM {s.group} · {wordRangeLabel(s.group)}
              </span>
              <Link
                href={`/vocab/browse/${s.group}`}
                data-testid="browse-link"
                className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-600"
              >
                📖 Xem lại
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {s.activities.map((activity, i) => {
                // Ô ôn tập chưa có đích tới ở lát 2a (bài thi là 2b). Ô buổi
                // chỉ có link khi tra được id thật — thiếu dòng `lessons` thì
                // để `null`, không dựng ra "/vocab/learn/undefined".
                const lessonId = i === 2 ? undefined : idByOrdinal.get(s.lessons[i as 0 | 1]);
                return (
                  <ActivityBox
                    key={i}
                    // Số thứ tự TOÀN CỤC (1..20), không phải thứ tự trong nhóm:
                    // trang học đặt tiêu đề "Buổi 5", nên nhãn ở đây cũng phải
                    // là "Buổi 5". Đánh số lại theo nhóm thì bấm "Buổi 1" ở
                    // nhóm 3 sẽ mở ra một trang tên "Buổi 5".
                    label={i === 2 ? "Ôn tập" : `Buổi ${s.lessons[i as 0 | 1]}`}
                    state={activity}
                    isReview={i === 2}
                    href={lessonId === undefined ? null : `/vocab/learn/${lessonId}`}
                  />
                );
              })}
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}

function describe(state: ActivityState, isReview: boolean): string {
  switch (state.kind) {
    case "chua-lam":
      // Ô Ôn tập không có bài thi nào để làm ở lát 2a — loại "review" chưa
      // từng được ghi vào `assessments` (bài thi là lát 2b), nên trạng thái
      // của nó CHỈ có thể là "chua-lam" suốt lát này. "chưa học" ngụ ý người
      // học bỏ dở một việc có thể làm; nói vậy cho ô này là sai — đổi thành
      // "sắp có", nhất quán với nút LÀM BÀI (dẫn `/sap-co`) và thẻ Ngữ pháp
      // trên dashboard ("Sắp có").
      return isReview ? "sắp có" : "chưa học";
    case "dang-hoc":
      // +1 vì `wordIndex` đếm từ 0 còn người học đếm từ 1.
      return `từ ${state.wordIndex + 1}/${WORDS_PER_LESSON}`;
    case "dang-thi":
      return "đang thi";
    case "dat":
      return `${state.score}đ ✓`;
    case "chua-dat":
      return `${state.score}đ · bổ túc`;
  }
}

function ActivityBox({
  label, state, href, isReview,
}: {
  label: string;
  state: ActivityState;
  href: string | null;
  isReview: boolean;
}) {
  const shell = "rounded border px-2 py-3 text-center text-xs";
  const tone =
    state.kind === "dat"
      ? "border-slate-300 bg-slate-100"
      : state.kind === "chua-lam"
        ? "border-slate-200 text-slate-400"
        : "border-slate-400";
  const inner = (
    <>
      <span className="block font-medium">{label}</span>
      <span className="block text-slate-600">{describe(state, isReview)}</span>
    </>
  );
  return (
    <div data-testid="activity" data-kind={state.kind}>
      {/* Ô ôn tập chưa có đích tới ở lát 2a — bài thi là lát 2b. Vẫn render
          đúng trạng thái để `progress.ts` được kiểm chứng thật trên màn hình,
          chỉ không bấm được. */}
      {href ? (
        <Link href={href} className={`${shell} ${tone} block bg-white hover:border-slate-500`}>
          {inner}
        </Link>
      ) : (
        <div className={`${shell} ${tone}`}>{inner}</div>
      )}
    </div>
  );
}
