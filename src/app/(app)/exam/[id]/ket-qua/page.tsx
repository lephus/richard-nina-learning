import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { batDauBoTuc } from "./actions";

export default async function KetQuaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: raw } = await params;
  if (!/^[1-9][0-9]*$/.test(raw)) notFound();
  const assessmentId = Number(raw);

  const supabase = await createClient();
  const { data: bai } = await supabase
    .from("assessments")
    .select("id, type, score, passed, status, scope")
    .eq("id", assessmentId)
    .maybeSingle();
  if (!bai || bai.status !== "submitted") notFound();

  // `wrong_items_for_assessment` từ chối CẢ CHÍNH CHỦ khi bài còn in_progress
  // (0007_assessment_parent.sql) — chỉ gọi được TỪ ĐÂY, SAU khi đã chắc chắn
  // `status === 'submitted'` ở nhánh trên.
  const { data: sai } = await supabase
    .rpc("wrong_items_for_assessment", { p_assessment_id: assessmentId });
  const soSai = (sai as unknown[] | null)?.length ?? 0;

  const boTuc = batDauBoTuc.bind(null, assessmentId);
  // `noUncheckedIndexedAccess` suy chỉ số mảng ra `number | undefined` dù
  // scope là cột `int[] not null` luôn có đúng một phần tử cho bài
  // lesson/remedial (xem createVocabExam) — chặn tường minh thay vì âm thầm
  // dựng link "/vocab/learn/undefined" hoặc trỏ nhầm buổi nếu giả định đó có
  // ngày nào đó sai, cùng khuôn `batDauBoTuc`/`boBaiThi` đã dùng cho đúng vấn
  // đề này.
  const lessonId = (bai.scope as number[])[0];
  if (lessonId === undefined) {
    throw new Error(`bài ${assessmentId} có scope rỗng, không xác định được buổi`);
  }

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Kết quả</h1>
      <p data-testid="ket-qua-diem" className="text-lg">
        {bai.score}đ — {bai.passed ? "Đạt" : "Chưa đạt"}
      </p>

      {!bai.passed && soSai > 0 && (
        <form action={boTuc}>
          <button
            type="submit"
            data-testid="ket-qua-bo-tuc"
            className="rounded border border-slate-300 px-4 py-2 hover:bg-slate-50"
          >
            Bổ túc {soSai} từ sai
          </button>
        </form>
      )}

      <Link href={`/vocab/learn/${lessonId}`} className="underline">
        ← Quay lại buổi học
      </Link>
    </main>
  );
}
