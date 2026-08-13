import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ExamRunner } from "@/components/exam/ExamRunner";

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  if (!/^[1-9][0-9]*$/.test(raw)) notFound();
  const assessmentId = Number(raw);

  const supabase = await createClient();
  const { data: bai } = await supabase
    .from("assessments").select("id, status").eq("id", assessmentId).maybeSingle();
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

  const { data: items, error } = await supabase
    .from("assessment_items")
    .select("position, payload")
    .eq("assessment_id", assessmentId)
    .order("position");
  if (error) throw error;

  const cau = (items ?? []).map((r) => ({
    position: r.position as number,
    ...(r.payload as { prompt: string; options: string[]; kind: string }),
  }));

  return <ExamRunner assessmentId={assessmentId} cauHoi={cau} />;
}
