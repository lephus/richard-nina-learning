import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { phamViThuocNhom } from "@/lib/curriculum/groups";
import { ExamRunner } from "@/components/exam/ExamRunner";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/** Một tham số query có thể tới dưới dạng mảng (`?k=a&k=a`) — luôn lấy giá trị ĐẦU. */
function motGiaTri(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ExamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id: raw } = await params;
  if (!/^[1-9][0-9]*$/.test(raw)) notFound();
  const assessmentId = Number(raw);

  const supabase = await createClient();
  // THÊM `grammar_lessons(ordinal)` ở lát 2d (ngoài phạm vi liệt kê tường
  // minh của brief Task 4, nhưng bắt buộc — xem báo cáo Task 4): trang này
  // dùng CHUNG cho MỌI loại bài, kể cả `grammar` (`batDauBaiNguPhap` redirect
  // thẳng vào đây, giống hệt `batDauBaiThi`). `scope` LUÔN rỗng cho bài
  // grammar (xem chú thích tại `createGrammarExam`, `src/lib/exam/run.ts`),
  // nên `scope[0]` không mang được số thứ tự bài để hiện tiêu đề — join sẵn
  // qua FK `grammar_lesson_id` để lấy `ordinal` thật, đọc ở `buoiHienTai`
  // dưới đây.
  const { data: bai } = await supabase
    .from("assessments")
    .select("id, status, type, scope, grammar_lessons(ordinal)")
    .eq("id", assessmentId)
    .maybeSingle();
  if (!bai) notFound();

  // Bài đã nộp: đưa thẳng sang trang kết quả, KHÔNG render lại ExamRunner —
  // SỬA SAU VÒNG SOÁT 1 (finding 3). Trước bản vá này, vào lại một bài đã
  // `submitted` (ví dụ bấm "quay lại" của trình duyệt ngay sau khi vừa nộp —
  // một thao tác hoàn toàn bình thường, không phải tấn công) vẫn hiện đủ 30
  // câu VÀ nút "Bỏ bài" (`exam-bo-bai`, mới thêm ở yêu cầu C). Bấm nút đó ném
  // lỗi thật (bài đã nộp không xoá được — `boBaiDangLam` khớp 0 dòng), rơi
  // xuống tấm chắn lỗi chung `error.tsx` với đúng thông điệp sai "mất mạng"
  // mà yêu cầu C được giao để loại bỏ — tái tạo lại chính cái bẫy nó vừa
  // đóng, qua một cửa MỚI (nút Bỏ bài) dù cửa CŨ (thiếu rẽ nhánh status) đã
  // được Task 5 ghi nhận là món nợ chưa trả. Chặn Ở ĐÂY, sớm nhất có thể —
  // trước khi đọc `assessment_items` hay dựng `ExamRunner` — đóng luôn cả
  // đường replay tương tác vô nghĩa (trả lời lại một bài đã chấm điểm) mà
  // vòng soát trước đã ghi là "khoảng UX chưa xử lý, có thể thuộc Task 6".
  if (bai.status === "submitted") redirect(`/exam/${assessmentId}/ket-qua`);

  // SỬA SAU VÒNG SOÁT CUỐI (finding 3): đọc thêm `user_answer` — cột này CÓ
  // trong danh sách grant cho `authenticated` (0008_assessment_items_grants.sql),
  // chỉ `is_correct` mới bị thu hồi. Trước bản vá này trang chỉ đọc
  // `position, payload`, nên `ExamRunner` không có cách nào biết câu nào đã
  // trả lời rồi — luôn khởi động lại từ câu 1 dù đang mở lại một bài làm dở
  // (crash, tải lại trang, đóng nhầm tab), đúng cái spec §3.2 hứa là AN TOÀN.
  const { data: items, error } = await supabase
    .from("assessment_items")
    .select("position, payload, user_answer")
    .eq("assessment_id", assessmentId)
    .order("position");
  if (error) throw error;

  const cau = (items ?? []).map((r) => ({
    position: r.position as number,
    daTraLoi: r.user_answer !== null,
    ...(r.payload as { prompt: string; options: string[]; kind: string }),
  }));

  // Finding 5 (vòng soát cuối): buổi/loại bài NGƯỜI HỌC VỪA BẤM, nếu redirect
  // tới đây mang theo (xem `batDauBaiThi`/`batDauBoTuc`). SỬA Ở VÒNG SOÁT CUỐI
  // lát 2c (mục 2): `scope[0]` là ORDINAL buổi, không còn là `lessons.id` như
  // chú thích cũ ở đây khẳng định — khẳng định đó vốn đã SAI cho bài `review`
  // (scope của nó luôn là ordinal, xem `batDauOnTap`) từ trước lát này, và
  // `batDauBaiThi` giờ cũng tra ngược `id -> ordinal` một lần rồi ghi ordinal
  // xuống `scope` cho bài `lesson` (xem chú thích tại đó) — nên phát biểu
  // đúng giờ là ĐỒNG NHẤT cho cả ba loại bài: `scope` chỉ còn MỘT nghĩa
  // (ordinal) ở khắp nơi. Hiển thị trực tiếp ở đây (không join `lessons` để
  // tra lại ordinal) giờ đúng theo CẤU TRÚC, không còn là một sự trùng hợp
  // như trước — dù `src/lib/stats/compute.ts` vẫn còn đọc scope của những
  // dòng CŨ (ghi trước lát này) theo cùng cách, và những dòng đó vẫn đúng chỉ
  // nhờ `lessons.id === ordinal` (`tests/db-integrity.test.ts`).
  const sp = await searchParams;
  const loaiVuaBam = motGiaTri(sp.tuLoai);
  const buoiVuaBamRaw = motGiaTri(sp.tuBuoi);
  const buoiVuaBam = buoiVuaBamRaw !== undefined ? Number(buoiVuaBamRaw) : null;
  const scope = bai.scope as number[];
  // THÊM Ở LÁT 2d: bài `grammar` không mang `scope` (luôn RỖNG — xem chú
  // thích tại `createGrammarExam`, `src/lib/exam/run.ts`), nên `scope[0]` ở
  // đây luôn `undefined` và không phân biệt được bài ngữ pháp NÀO trong 20
  // bài. Tra `ordinal` qua quan hệ nhúng `grammar_lessons(ordinal)` vừa thêm ở
  // SELECT bên trên thay vào đó. postgrest-js đôi khi trả quan hệ 1-1 thành
  // MẢNG (cùng cái bẫy đã ghi ở `recordAnswer`/`run.ts` cho `assessments(...)`
  // và ở `exam/[id]/actions.ts` cho `lesson_words -> vocab_words`) — chuẩn hoá
  // cả hai hình dạng thay vì giả định một trong hai.
  const glEmbed = bai.grammar_lessons as { ordinal: number } | { ordinal: number }[] | null;
  const gl = Array.isArray(glEmbed) ? glEmbed[0] : glEmbed;
  const buoiHienTai = bai.type === "grammar" ? (gl?.ordinal ?? null) : (scope[0] ?? null);
  const lechBuoi =
    loaiVuaBam !== undefined &&
    buoiVuaBam !== null &&
    (loaiVuaBam !== bai.type || buoiVuaBam !== buoiHienTai);

  return (
    <ExamRunner
      assessmentId={assessmentId}
      cauHoi={cau}
      loaiBai={bai.type as "lesson" | "remedial" | "review" | "grammar"}
      buoi={buoiHienTai}
      // THÊM Ở VÒNG SOÁT CUỐI (mục 1): `ExamRunner` chỉ nhận `buoi` (một
      // ordinal), không có cách nào tự biết `scope` gốc có hai phần tử hay
      // không (một bài `remedial` sinh từ `review` và một bài `remedial` sinh
      // từ `lesson` đều chỉ lộ ra MỘT ordinal qua `buoi`). Tính sẵn ở đây
      // (nơi có `scope` đầy đủ) bằng đúng predicate dùng chung với
      // `boBaiThi`/trang kết quả, rồi truyền xuống làm dữ liệu — client
      // component không tự suy ra được điều nó không có.
      phamViNhieuBuoi={phamViThuocNhom(scope)}
      canhBaoLechBuoi={lechBuoi}
    />
  );
}
