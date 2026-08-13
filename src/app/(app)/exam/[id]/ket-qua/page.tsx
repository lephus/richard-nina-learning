import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { batDauBoTuc, lamLaiBai } from "./actions";

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
  const saiRows = (sai ?? []) as { ref_id: number }[];
  const soSai = saiRows.length;

  // SỬA SAU VÒNG SOÁT CUỐI (finding 6): spec §4 đòi "danh sách từ sai kèm
  // nghĩa" — `wrong_items_for_assessment` chỉ trả `payload` (prompt/options,
  // không có nghĩa: một câu "điền" thậm chí không hề nhắc tới nghĩa tiếng
  // Việt trong payload của nó). Tra thẳng `vocab_words` theo `ref_id` (đúng
  // các cột public — `word`, `meaning_vi` không nằm trong danh sách bị revoke
  // ở 0004_rls.sql) thay vì cố suy nghĩa từ payload.
  let tuSai: { id: number; word: string; meaningVi: string }[] = [];
  if (soSai > 0) {
    const ids = saiRows.map((r) => r.ref_id);
    const { data: words, error: wordsErr } = await supabase
      .from("vocab_words").select("id, word, meaning_vi").in("id", ids);
    if (wordsErr) throw wordsErr;
    const byId = new Map((words ?? []).map((w) => [w.id as number, w]));
    // Giữ đúng thứ tự `ids` (đã theo `position` từ RPC) thay vì thứ tự trả về
    // của `.in(...)` (không đảm bảo) — và bỏ qua id không tra được thay vì
    // render một dòng rỗng (dữ liệu vocab đổi giữa chừng, cùng cách
    // `topWrongWords` ở stats/compute.ts xử lý tình huống này).
    tuSai = ids.flatMap((id) => {
      const w = byId.get(id);
      return w ? [{ id, word: w.word as string, meaningVi: w.meaning_vi as string }] : [];
    });
  }

  const boTuc = batDauBoTuc.bind(null, assessmentId);
  const lamLai = lamLaiBai.bind(null, assessmentId);
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

      {/* Finding 6 (vòng soát cuối): "Làm lại bài" chỉ hiện khi ĐÂY là một
          bài BỔ TÚC đã ĐẠT — đúng spec §4 ("Đạt bổ túc → nút Làm lại bài").
          Đạt bổ túc không tự đổi trạng thái lần thử CHÍNH (progress.ts chỉ
          xét lần thử mới nhất CÙNG LOẠI lesson/review), nên không có nút này
          thì không còn đường nào đưa lần thử chính về "đạt" — cả nhóm không
          bao giờ hoàn thành được (xem chú thích tại `lamLaiBai`). */}
      {bai.type === "remedial" && bai.passed === true && (
        <form action={lamLai}>
          <button
            type="submit"
            data-testid="ket-qua-lam-lai"
            className="rounded border border-slate-300 px-4 py-2 hover:bg-slate-50"
          >
            Làm lại bài
          </button>
        </form>
      )}

      {/* Finding 6: "danh sách từ sai kèm nghĩa" (spec §4) — trước bản vá
          này `sai` chỉ dùng để đếm (`.length`), không render ra gì cả. */}
      {tuSai.length > 0 && (
        <div data-testid="ket-qua-tu-sai" className="flex flex-col gap-2">
          <h2 className="font-medium">Từ sai</h2>
          <ul className="flex flex-col gap-1">
            {tuSai.map((w) => (
              <li key={w.id} className="text-sm">
                <span className="font-medium">{w.word}</span> — {w.meaningVi}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link href={`/vocab/learn/${lessonId}`} className="underline">
        ← Quay lại buổi học
      </Link>
    </main>
  );
}
