import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { phamViThuocNhom } from "@/lib/curriculum/groups";
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

  // THÊM Ở LÁT 2d (ngoài phạm vi liệt kê tường minh của brief Task 4, nhưng
  // bắt buộc — xem báo cáo Task 4): trang này dùng CHUNG cho MỌI loại bài,
  // và `nopBai` (exam/[id]/actions.ts) redirect thẳng vào đây sau khi nộp bất
  // kỳ bài nào, kể cả `grammar`. Toàn bộ khối "từ sai"/"bổ túc"/"buổi" bên
  // dưới được viết CHỈ cho vocab, và KHÔNG áp dụng được cho grammar theo hai
  // cách khác nhau, cả hai đã kiểm chứng bằng cách đọc thẳng code/schema,
  // không suy đoán:
  //   1. `scope` LUÔN rỗng cho bài `grammar` (xem `createGrammarExam`) — đọc
  //      thẳng `scope[0]` như bản cũ sẽ THROW ngay lập tức, 100% các lần, cho
  //      MỌI bài ngữ pháp vừa nộp (đã dò bằng cách đọc chính điều kiện `if
  //      (lessonId === undefined) throw` ở bản cũ — không phải một trường hợp
  //      biên hiếm mà là đường đi DUY NHẤT của mọi bài grammar).
  //   2. `wrong_items_for_assessment` trả `ref_id` là id của
  //      `assessment_items` — với bài grammar đó là `grammar_questions.id`,
  //      KHÔNG phải `vocab_words.id`. Cả hai bảng đều là `bigserial` bắt đầu
  //      từ 1 (`grammar_questions` có 537 dòng, `vocab_words` có 605 dòng) nên
  //      hai dải id CHỒNG LẤN nhau thật — tra thẳng `vocab_words` bằng những
  //      id đó (bản cũ) không lỗi, không rỗng, mà trả về NHỮNG TỪ VỰNG KHÁC
  //      HẲN, không liên quan gì tới câu ngữ pháp đã sai, rồi hiện ra như thể
  //      đó là "từ sai" thật — hỏng ÂM THẦM, đúng loại lỗi mà toàn bộ lát này
  //      đã nhiều lần chặn (xem các chú thích "hỏng ÂM THẦM" rải khắp
  //      `run.ts`/`load-scope.ts`), chỉ khác chỗ lộ ra.
  // Mục 3.3 (thiết kế phase 2) và §6 (thiết kế lát 2d) đều nói RÕ bài ngữ
  // pháp không có bổ túc — `isGrammar` gate cả nút bổ túc lẫn khối "từ sai"
  // (không hiện gì thay vì hiện sai), và dẫn về `/grammar` thay vì suy một
  // "buổi" không tồn tại cho loại bài này. Đây KHÔNG phải dựng một tính năng
  // "câu sai" mới cho ngữ pháp (ngoài phạm vi Task 4) — chỉ là làm cho trang
  // AN TOÀN khi một bài grammar đi qua nó, đúng như nó BẮT BUỘC phải đi qua.
  const isGrammar = bai.type === "grammar";

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
  if (!isGrammar && soSai > 0) {
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
  // scope là cột `int[] not null`. SỬA Ở VÒNG SOÁT CUỐI (mục 1): khẳng định
  // cũ ở đây — "luôn có đúng một phần tử cho bài lesson/remedial" — SAI cho
  // một bài `remedial` sinh ra từ một bài `review` (ôn tập nhóm): nó giữ
  // nguyên `scope` HAI phần tử của cha (xem `batDauBoTuc`), `type` vẫn là
  // "remedial" nên không đủ để phân biệt. `phamViThuocNhom` (đếm phần tử
  // `scope`, không đọc `type`) là predicate DÙNG CHUNG cho đúng câu hỏi này ở
  // cả `boBaiThi` và `ExamRunner` — sửa một chỗ, không để ba bản trôi dạt.
  // Chặn `scope` rỗng vẫn tường minh như cũ thay vì âm thầm dựng link
  // "/vocab/learn/undefined", cùng khuôn `batDauBoTuc`/`boBaiThi` — TRỪ bài
  // `grammar`, luôn `scope` rỗng một cách BÌNH THƯỜNG (không phải lỗi dữ
  // liệu), nên tách nhánh sớm thay vì rơi vào `throw` dành cho vocab.
  const scope = bai.scope as number[];
  const nhieuBuoi = !isGrammar && phamViThuocNhom(scope);
  const lessonId = isGrammar ? undefined : scope[0];
  if (!isGrammar && lessonId === undefined) {
    throw new Error(`bài ${assessmentId} có scope rỗng, không xác định được buổi`);
  }

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Kết quả</h1>
      <p data-testid="ket-qua-diem" className="text-lg">
        {bai.score}đ — {bai.passed ? "Đạt" : "Chưa đạt"}
      </p>

      {/* `!isGrammar` — mục 3.3 (thiết kế phase 2) và §6 (thiết kế lát 2d) đều
          nói bài ngữ pháp KHÔNG có bổ túc. Không chỉ là ẩn đúng ý spec: bấm
          nút này trên một bài grammar sẽ gọi `batDauBoTuc`, đọc
          `cha.scope` (luôn rỗng) rồi THROW ngay ("không xác định được buổi")
          — gate ở đây còn tránh một crash thật, không riêng một lựa chọn UX. */}
      {!isGrammar && !bai.passed && soSai > 0 && (
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

      {/* SỬA Ở VÒNG SOÁT CUỐI (mục 1): mọi bài mang phạm vi NHIỀU buổi — bài
          `review` chính nó, hoặc một bài `remedial`/`làm lại` sinh ra từ nó —
          không thuộc riêng một buổi nào để "quay lại". Trước bản vá này, MỌI
          bài (kể cả những bài này) đều nhận link `/vocab/learn/${scope[0]}`,
          đưa người vừa ôn tập xong 60 từ hai buổi về một buổi họ không hề
          học riêng — đúng lối mòn mà `boBaiThi` đã sửa ở lát 2c, chỉ khác nơi
          chạm trán (đây là trang MỌI người học đều ghé qua, không phải một
          nút "Bỏ bài" ít ai bấm). */}
      {/* THÊM Ở LÁT 2d: bài `grammar` không thuộc buổi/nhóm từ vựng nào —
          `lessonId` cố tình để `undefined` ở trên cho loại bài này (xem chú
          thích tại khai báo `isGrammar`), nên nhánh nhieuBuoi/lessonId cũ chỉ
          còn đúng cho vocab. Dẫn về `/grammar` (danh sách 20 bài), khớp đúng
          nơi `batDauBaiNguPhap` xuất phát. */}
      {isGrammar ? (
        <Link href="/grammar" className="underline">
          ← Quay lại Ngữ pháp
        </Link>
      ) : nhieuBuoi ? (
        <Link href="/vocab" className="underline">
          ← Quay lại Từ vựng
        </Link>
      ) : (
        <Link href={`/vocab/learn/${lessonId}`} className="underline">
          ← Quay lại buổi học
        </Link>
      )}
    </main>
  );
}
