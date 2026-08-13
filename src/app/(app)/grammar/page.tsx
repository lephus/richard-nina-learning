import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Danh sách 20 bài ngữ pháp, mỗi dòng ghép điểm GẦN NHẤT (bài đã nộp mới
 * nhất) của người dùng cho bài đó, nếu có. Chọn tự do — không khoá, không
 * đòi thứ tự (mục "Không thuộc phạm vi" của thiết kế lát 2d).
 */
export default async function GrammarPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [lessonsRes, assessmentsRes] = await Promise.all([
    supabase.from("grammar_lessons").select("id, ordinal, title").order("ordinal"),
    // `.eq("user_id", ...)` tường minh dù RLS đã lọc đúng — cùng khuôn phòng
    // thủ hai lớp mà `/vocab` (list) đã dùng, không dựa vào một lớp chặn duy
    // nhất. Không chọn `passed`/đáp án nào cần bảo mật ở đây — chỉ `score`.
    supabase
      .from("assessments")
      .select("grammar_lesson_id, status, score")
      .eq("user_id", user.id)
      .eq("type", "grammar")
      .order("id"),
  ]);
  if (lessonsRes.error) throw lessonsRes.error;
  if (assessmentsRes.error) throw assessmentsRes.error;

  const lessons = lessonsRes.data ?? [];

  // Ghép điểm GẦN NHẤT: duyệt các bài đã nộp theo thứ tự `id` TĂNG DẦN rồi
  // GHI ĐÈ vào Map — dòng ghi SAU CÙNG (id lớn nhất, tức mới nhất) luôn thắng,
  // nên giá trị còn lại trong Map sau vòng lặp chính là lần nộp gần nhất cho
  // mỗi bài. Bỏ qua bài còn `in_progress` (chưa có `score`) — trang này chỉ
  // hiện điểm ĐÃ CHẤM, không đoán điểm của một bài đang làm dở.
  const diemGanNhat = new Map<number, number>();
  for (const a of assessmentsRes.data ?? []) {
    if (a.status !== "submitted" || a.grammar_lesson_id === null) continue;
    diemGanNhat.set(a.grammar_lesson_id as number, a.score as number);
  }

  return (
    <main className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">Ngữ pháp</h1>

      <ol className="flex flex-col gap-2">
        {lessons.map((l) => {
          const diem = diemGanNhat.get(l.id as number);
          return (
            <li key={l.id as number}>
              <Link
                href={`/grammar/${l.ordinal as number}`}
                data-testid="grammar-row"
                className="flex items-center justify-between rounded border border-slate-200 bg-white px-4 py-3 hover:border-slate-400"
              >
                <span className="font-medium">
                  Bài {l.ordinal as number} · {l.title as string}
                </span>
                <span className="text-sm text-slate-600">
                  {diem === undefined ? "Chưa làm" : `${diem}đ`}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
