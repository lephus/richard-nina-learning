import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lessonStatuses, type LessonRow, type ProgressRow } from "@/lib/curriculum/lesson-status";
import {
  nextStep,
  toAssessmentRow,
  toLessonDones,
  type AssessmentDbRow,
} from "@/lib/assessment/next-step";
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

  // Gộp CẢ BA lượt đọc vào một wave (Task 7 review vòng 4, finding 3):
  // `assessments` chỉ cần cho tấm chắn thứ hai bên dưới, nhưng trang này là
  // trang được tải nhiều nhất trong app — thêm một wave tuần tự riêng cho nó
  // (như bản trước, gọi loadNextStep SAU Promise.all rồi tự đọc lại đúng hai
  // bảng lessons/user_lesson_progress đã có sẵn trong bộ nhớ) là nhân đôi
  // round-trip cho hai trong ba bảng, và biến một lỗi thoáng qua ở
  // assessments thành lỗi của MỘT trang chưa từng cần bảng đó trước lát 1c.
  const [lessonsRes, progressRes, assessmentsRes] = await Promise.all([
    supabase.from("lessons").select("id, ordinal").order("ordinal"),
    supabase.from("user_lesson_progress").select("lesson_id, status"),
    supabase.from("assessments").select("id, type, scope, status, passed, expires_at, parent_id"),
  ]);
  if (lessonsRes.error) throw lessonsRes.error;
  if (progressRes.error) throw progressRes.error;
  if (assessmentsRes.error) throw assessmentsRes.error;

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
  // CHƯA xong chỉ được vào khi nó đúng là slot `nextStep` đang trỏ tới —
  // tính THẲNG từ ba mảng đã đọc ở trên, không gọi lại loadNextStep (nó sẽ
  // tự đọc lại đúng ba bảng này một lần nữa).
  const isCompleted = statuses.get(id) === "completed";
  if (!isCompleted) {
    const assessments = ((assessmentsRes.data ?? []) as AssessmentDbRow[]).map(toAssessmentRow);
    const { action } = nextStep(toLessonDones(lessons, statuses), assessments, new Date());
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
      />
    </main>
  );
}
