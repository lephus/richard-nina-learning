import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  lessonStatuses,
  type LessonRow,
  type LessonStatus,
  type ProgressRow,
} from "@/lib/curriculum/lesson-status";
import { slotAt, TOTAL_SLOTS, type Slot, type SlotKind } from "@/lib/assessment/slots";
import { nextStep, type Action, type AssessmentRow, type LessonDone } from "@/lib/assessment/next-step";
import { startAssessmentAction, closeExpiredAction } from "./actions";

interface LessonWithGrammar extends LessonRow {
  grammar_lessons: { title: string } | null;
}

/** Hàng thô từ bảng `assessments` — snake_case như Postgres trả về. */
interface AssessmentDbRow {
  id: number;
  type: "review" | "test" | "remedial";
  scope: number[];
  status: "in_progress" | "submitted" | "expired";
  passed: boolean | null;
  expires_at: string;
  parent_id: number | null;
}

/** Trạng thái hiển thị: bốn giá trị của `lesson_status` cộng thêm `failed` —
 * `failed` CHỈ là nhãn trên màn hình, suy ra từ `assessments`, không phải một
 * giá trị enum trong database (enum đó chỉ phục vụ `user_lesson_progress`). */
type RowStatus = LessonStatus | "failed";

const LABEL: Record<RowStatus, string> = {
  locked: "Chưa mở",
  available: "Sẵn sàng",
  in_progress: "Đang làm",
  completed: "Đã xong",
  failed: "Chưa đạt",
};

interface Row {
  key: string;
  kind: SlotKind;
  status: RowStatus;
  label: string;
  subtitle: string | null;
  href: string | null;
}

const sameScope = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

export default async function DashboardPage() {
  const supabase = await createClient();

  const [lessonsRes, progressRes, assessmentsRes] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, ordinal, grammar_lessons(title)")
      .order("ordinal"),
    supabase.from("user_lesson_progress").select("lesson_id, status"),
    // Đọc CẢ ba loại (review/test/remedial): nextStep cần tới bài bổ túc để
    // theo đúng nhánh trượt → bổ túc → làm lại, dù dòng hiển thị của 35 slot
    // chỉ khớp review/test (remedial không chiếm slot riêng — xem slots.ts).
    // Không chọn is_correct/answer ở đâu trong cả trang: đáp án không có việc
    // gì ở dashboard.
    supabase
      .from("assessments")
      .select("id, type, scope, status, passed, expires_at, parent_id")
      .order("id"),
  ]);

  if (lessonsRes.error) throw lessonsRes.error;
  if (progressRes.error) throw progressRes.error;
  if (assessmentsRes.error) throw assessmentsRes.error;

  // Không có generic Database trên client nên postgrest-js suy luận MỌI quan
  // hệ nhúng có sub-field là mảng, bất kể FK thật sự là 1-1 hay 1-n (xem
  // node_modules/@supabase/postgrest-js/src/select-query-parser/result.ts).
  // Ép qua `unknown` trước vì TS không cho ép thẳng hai kiểu không giao nhau
  // đủ. Runtime thực sự trả về một đối tượng vì lessons.grammar_lesson_id là
  // khoá ngoại `unique` (supabase/migrations/0002_curriculum.sql:4).
  const lessons = (lessonsRes.data ?? []) as unknown as LessonWithGrammar[];
  const progress = (progressRes.data ?? []) as ProgressRow[];
  const statuses = lessonStatuses(lessons, progress);
  const lessonByOrdinal = new Map(lessons.map((l) => [l.ordinal, l]));

  // nextStep nhận camelCase — tự tay ánh xạ từ hàng snake_case Postgres trả
  // về, nó không làm hộ việc này.
  const assessmentDbRows = (assessmentsRes.data ?? []) as AssessmentDbRow[];
  const assessments: AssessmentRow[] = assessmentDbRows.map((r) => ({
    id: r.id,
    type: r.type,
    scope: r.scope,
    status: r.status,
    passed: r.passed,
    expiresAt: r.expires_at,
    parentId: r.parent_id,
  }));
  const lessonDones: LessonDone[] = lessons.map((l) => ({
    ordinal: l.ordinal,
    completed: statuses.get(l.id) === "completed",
  }));

  const { action } = nextStep(lessonDones, assessments, new Date());

  /** Lần thử gần nhất (id lớn nhất) của một slot ôn tập/kiểm tra. */
  function latestAttempt(kind: "review" | "test", scope: number[]): AssessmentRow | null {
    let found: AssessmentRow | null = null;
    for (const r of assessments) {
      if (r.type === kind && sameScope(r.scope, scope) && (found === null || r.id > found.id)) {
        found = r;
      }
    }
    return found;
  }

  /** Một slot đánh giá chỉ `available` khi MỌI buổi trong phạm vi đã `completed`. */
  function scopeCompleted(scope: number[]): boolean {
    return scope.every((ordinal) => {
      const lesson = lessonByOrdinal.get(ordinal);
      return lesson !== undefined && statuses.get(lesson.id) === "completed";
    });
  }

  const rows: Row[] = [];
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const slot: Slot = slotAt(i);

    if (slot.kind === "lesson") {
      const ordinal = slot.lessons[0]!;
      const lesson = lessonByOrdinal.get(ordinal);
      const status: RowStatus = lesson ? statuses.get(lesson.id) ?? "locked" : "locked";
      rows.push({
        key: `lesson-${ordinal}`,
        kind: "lesson",
        status,
        label: `Buổi ${ordinal}`,
        subtitle: lesson?.grammar_lessons?.title ?? null,
        href: lesson && status !== "locked" ? `/learn/${lesson.id}` : null,
      });
      continue;
    }

    const attempt = latestAttempt(slot.kind, slot.lessons);
    let status: RowStatus;
    if (attempt === null) {
      status = scopeCompleted(slot.lessons) ? "available" : "locked";
    } else if (attempt.status === "in_progress") {
      status = "in_progress";
    } else {
      // Đã nộp hoặc bị đóng vì quá hạn: `passed !== true` tính là chưa đạt —
      // fail-closed giống hệt cách nextStep đọc hai cột này, nên một dòng
      // `passed === null` (chưa từng chấm) cũng hiện "Chưa đạt" chứ không im
      // lặng biến mất khỏi màn hình.
      status = attempt.passed === true ? "completed" : "failed";
    }

    const label =
      slot.kind === "review"
        ? `Ôn tập buổi ${slot.lessons[0]}–${slot.lessons[1]}`
        : `Kiểm tra buổi ${slot.lessons[0]}–${slot.lessons[3]}`;

    rows.push({
      key: `${slot.kind}-${slot.lessons.join("-")}`,
      kind: slot.kind,
      status,
      label,
      subtitle: null,
      // Không bao giờ là <Link>: bắt đầu một bài đánh giá ghi database, nên
      // chỉ nút "Học tiếp" (Server Action) được phép làm việc đó — xem
      // quyết định trong brief. Xem lại kết quả một lần thử cũ không phải
      // yêu cầu của lát này.
      href: null,
    });
  }

  const continueControl = renderContinue(action, lessonByOrdinal);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Lộ trình 35 hoạt động</h1>
        {continueControl}
      </div>

      {action.kind === "done" && (
        <p className="text-sm text-slate-500">
          Bạn đã hoàn thành toàn bộ chương trình — 20 buổi học, các bài ôn tập và kiểm tra.
        </p>
      )}

      <ol className="flex flex-col gap-2">
        {rows.map((row) => {
          const shell =
            "flex items-center justify-between rounded border border-slate-200 px-4 py-3";
          const inner = (
            <>
              <span>
                <span className="mr-2 font-medium">{row.label}</span>
                {row.subtitle && <span className="text-slate-600">{row.subtitle}</span>}
              </span>
              <span className="text-sm text-slate-500">{LABEL[row.status]}</span>
            </>
          );
          return (
            <li key={row.key} data-testid="lesson-row" data-status={row.status} data-kind={row.kind}>
              {row.href ? (
                <Link href={row.href} className={`${shell} bg-white hover:border-slate-400`}>
                  {inner}
                </Link>
              ) : (
                <div
                  className={`${shell} ${
                    row.status === "locked" ? "bg-slate-100 text-slate-400" : "bg-white"
                  }`}
                >
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </main>
  );
}

/**
 * MỘT nút "Học tiếp" duy nhất lái toàn bộ chuỗi 35 hoạt động — hành vi của nó
 * theo đúng `action` mà `nextStep` trả về, không suy đoán lại ở đây.
 * `data-testid="continue-link"` giữ nguyên trên bất kể phần tử nào đóng vai
 * trò nút chính, để kịch bản e2e cũ (bấm rồi mong sang buổi 1) không vỡ.
 */
function renderContinue(
  action: Action,
  lessonByOrdinal: Map<number, LessonWithGrammar>,
): React.ReactNode {
  const className = "rounded bg-slate-900 px-4 py-2 text-white";

  switch (action.kind) {
    case "lesson": {
      const lesson = lessonByOrdinal.get(action.lesson);
      // Không nên xảy ra: slotAt chỉ sinh ordinal 1..20, khớp đúng 20 buổi đã
      // seed. Không có buổi thì không có gì để trỏ tới — im lặng ẩn nút còn
      // an toàn hơn trỏ vào một buổi không tồn tại.
      if (!lesson) return null;
      return (
        <Link href={`/learn/${lesson.id}`} data-testid="continue-link" className={className}>
          Học tiếp
        </Link>
      );
    }

    case "resume":
      return (
        <Link
          href={`/assessment/${action.assessmentId}`}
          data-testid="continue-link"
          className={className}
        >
          Học tiếp
        </Link>
      );

    case "start":
      return (
        <form action={startAssessmentAction.bind(null, action.type, action.scope, action.parentId)}>
          <button type="submit" data-testid="continue-link" className={className}>
            Học tiếp
          </button>
        </form>
      );

    case "close-expired":
      return (
        <form action={closeExpiredAction.bind(null, action.assessmentId)}>
          <button type="submit" data-testid="continue-link" className={className}>
            Học tiếp
          </button>
        </form>
      );

    case "done":
      return null;
  }
}
