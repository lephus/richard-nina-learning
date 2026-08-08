import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  lessonStatuses,
  type LessonRow,
  type LessonStatus,
  type ProgressRow,
} from "@/lib/curriculum/lesson-status";
import { slotAt, TOTAL_SLOTS, type Slot, type SlotKind } from "@/lib/assessment/slots";
import {
  nextStep,
  sameScope,
  latest,
  toAssessmentRow,
  toLessonDones,
  type Action,
  type AssessmentDbRow,
  type AssessmentRow,
} from "@/lib/assessment/next-step";
import { startAssessmentAction, closeExpiredAction } from "./actions";

interface LessonWithGrammar extends LessonRow {
  grammar_lessons: { title: string } | null;
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

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // AppLayout đã chặn ở tầng trên, nhưng vẫn tường minh ở đây — cùng cách
  // assessment/[id]/page.tsx và learn/[lessonId]/page.tsx đang làm. Cũng cần
  // user.id ngay dưới đây để lọc tường minh hai bảng riêng-tư-theo-người-dùng.
  if (!user) redirect("/login");

  const [lessonsRes, progressRes, assessmentsRes] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, ordinal, grammar_lessons(title)")
      .order("ordinal"),
    // `.eq("user_id", user.id)` tường minh dù RLS đã lọc đúng — không dựa
    // vào một lớp phòng thủ duy nhất, cùng cách assessment/[id]/page.tsx và
    // run.ts đang làm với mọi bảng riêng-tư-theo-người-dùng.
    supabase.from("user_lesson_progress").select("lesson_id, status").eq("user_id", user.id),
    // Đọc CẢ ba loại (review/test/remedial): nextStep cần tới bài bổ túc để
    // theo đúng nhánh trượt → bổ túc → làm lại, dù dòng hiển thị của 35 slot
    // chỉ khớp review/test (remedial không chiếm slot riêng — xem slots.ts).
    // Không chọn is_correct/answer ở đâu trong cả trang: đáp án không có việc
    // gì ở dashboard.
    supabase
      .from("assessments")
      .select("id, type, scope, status, passed, expires_at, parent_id")
      .eq("user_id", user.id)
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

  // nextStep nhận camelCase — ánh xạ qua toAssessmentRow/toLessonDones dùng
  // chung với current-step.ts (Server Action), không viết lại tay ở đây
  // (Task 7 review, finding D).
  const assessments: AssessmentRow[] = ((assessmentsRes.data ?? []) as AssessmentDbRow[]).map(
    toAssessmentRow,
  );
  const lessonDones = toLessonDones(lessons, statuses);

  const { slotIndex, action } = nextStep(lessonDones, assessments, new Date());

  /** Một slot đánh giá chỉ `available` khi MỌI buổi trong phạm vi đã `completed`. */
  function scopeCompleted(scope: number[]): boolean {
    return scope.every((ordinal) => {
      const lesson = lessonByOrdinal.get(ordinal);
      return lesson !== undefined && statuses.get(lesson.id) === "completed";
    });
  }

  /**
   * Trạng thái THẬT của một slot, đọc thẳng từ dữ liệu của riêng nó — không
   * biết gì về `slotIndex`. `latest`/`sameScope` import từ next-step.ts
   * (Task 7 review, finding 3): đây phải là ĐÚNG phép so khớp mà nextStep
   * dùng để chọn lần thử, không phải một bản chép tay dễ lệch.
   */
  function ownStatus(slot: Slot): RowStatus {
    if (slot.kind === "lesson") {
      const lesson = lessonByOrdinal.get(slot.lessons[0]!);
      return lesson ? statuses.get(lesson.id) ?? "locked" : "locked";
    }
    const attempt = latest(assessments, (r) => r.type === slot.kind && sameScope(r.scope, slot.lessons));
    if (attempt === null) return scopeCompleted(slot.lessons) ? "available" : "locked";
    if (attempt.status === "in_progress") return "in_progress";
    // Đã nộp hoặc bị đóng vì quá hạn: `passed !== true` tính là chưa đạt —
    // fail-closed giống hệt cách nextStep đọc hai cột này, nên một dòng
    // `passed === null` (chưa từng chấm) cũng hiện "Chưa đạt" chứ không im
    // lặng biến mất khỏi màn hình.
    return attempt.passed === true ? "completed" : "failed";
  }

  // MỘT con đường tính trạng thái dòng, không phải hai (Task 7 review,
  // finding 1): `nextStep` đã đi qua 35 slot THEO ĐÚNG THỨ TỰ và dừng ở
  // `slotIndex` — slot đầu tiên CHƯA xong. Vị trí của một dòng so với
  // `slotIndex` quyết định nó khoá hay không, KHÔNG PHẢI trạng thái riêng
  // của chính buổi/bài đó: một buổi 3 tự nó "available" theo
  // `lessonStatuses` (buổi 2 đã completed) vẫn phải khoá nếu ôn tập(1,2)
  // đứng trước nó trong chuỗi 35 slot còn chưa xong — nếu không, người học
  // đọc trên xuống dưới sẽ bấm thẳng vào buổi 3 (dòng duy nhất có link) mà
  // bỏ qua hẳn ôn tập, đi thẳng tới cuối chương trình không qua một bài đánh
  // giá nào.
  const rows: Row[] = [];
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const slot: Slot = slotAt(i);
    let status: RowStatus;

    if (i > slotIndex) {
      status = "locked";
    } else if (i < slotIndex) {
      const actual = ownStatus(slot);
      if (actual !== "completed") {
        // nextStep đã đi QUA slot này để tới slotIndex — nghĩa là theo chính
        // nextStep, slot này phải xong rồi. Đọc lại bằng ownStatus ra một
        // giá trị khác "completed" nghĩa là dữ liệu và nextStep đang KHÔNG
        // khớp nhau (ví dụ một dòng assessments bị xoá tay sau khi nextStep
        // đã tính). Thà vỡ ồn ào ở đây còn hơn âm thầm vẽ ra một dòng sai —
        // xem error.tsx cho màn hình lỗi người học sẽ thấy.
        throw new Error(
          `slot ${i} (${slot.kind}) đứng trước slotIndex=${slotIndex} nhưng ownStatus="${actual}", không phải "completed"`,
        );
      }
      status = "completed";
    } else {
      status = ownStatus(slot);
    }

    if (slot.kind === "lesson") {
      const ordinal = slot.lessons[0]!;
      const lesson = lessonByOrdinal.get(ordinal);
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

  const continueControl = renderContinue(action, lessonByOrdinal, statuses);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Lộ trình 35 hoạt động</h1>
        {continueControl}
      </div>

      {/* continueControl null xảy ra ở HAI trường hợp: đã xong toàn bộ
          chương trình (action.kind === "done", bình thường), hoặc tấm chắn
          trong renderContinue vừa chặn một buổi thực ra chưa mở (không nên
          xảy ra ở dữ liệu hợp lệ — xem comment nhánh "lesson" bên dưới, Task
          7 review finding E). Cả hai đều phải có một dòng giải thích: 35
          dòng không nút, không lời nào là màn hình tệ nhất có thể đưa cho
          người học. */}
      {continueControl === null && (
        <p className="text-sm text-slate-500">
          {action.kind === "done"
            ? "Bạn đã hoàn thành toàn bộ chương trình — 20 buổi học, các bài ôn tập và kiểm tra."
            : "Không tìm thấy hoạt động nào để tiếp tục ngay lúc này — thử tải lại trang."}
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
  statuses: Map<number, LessonStatus>,
): React.ReactNode {
  const className = "rounded bg-slate-900 px-4 py-2 text-white";

  switch (action.kind) {
    case "lesson": {
      const lesson = lessonByOrdinal.get(action.lesson);
      if (!lesson) return null;

      // Chỉ trỏ "Học tiếp" vào buổi THẬT SỰ học được (available/in_progress).
      // "!== completed" là bẫy: một dòng user_lesson_progress mới được ghi
      // tay mà chưa set status rõ ràng rơi vào default 'locked' của cột (xem
      // supabase/migrations/0003_user_state.sql:14) — dòng đó cũng
      // "!== completed" nên vẫn lọt qua nếu chỉ kiểm tra như vậy, dẫn thẳng
      // người học vào một buổi đang khoá. `nextStep` chỉ biết buổi này
      // "chưa hoàn thành" (đúng — nó chưa 'completed'), nó KHÔNG biết buổi
      // đó đã mở hay chưa; mở hay chưa là việc của `lessonStatuses`, và phải
      // hỏi lại ở đây trước khi vẽ nút, không phải tin thẳng `action`.
      // Không lọt qua được ở dữ liệu hợp lệ (locked ở đây nghĩa là nextStep
      // và lessonStatuses đang lệch nhau) — nhưng nếu NÓ có xảy ra, trả
      // `null` ở đây không được im lặng: khối "continueControl === null" bên
      // dưới component này luôn hiện một dòng giải thích, không để lại 35
      // dòng không nút không lời (Task 7 review, finding E).
      const status = statuses.get(lesson.id);
      if (status !== "available" && status !== "in_progress") return null;

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
