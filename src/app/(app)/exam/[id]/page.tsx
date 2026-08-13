import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
  const { data: bai } = await supabase
    .from("assessments").select("id, status, type, scope").eq("id", assessmentId).maybeSingle();
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
  // tới đây mang theo (xem `batDauBaiThi`/`batDauBoTuc`). `scope[0]` là
  // `lessons.id` — trùng với ordinal HÔM NAY chỉ vì cách seed hiện tại
  // (xem test khẳng định ở tests/db-integrity.test.ts, finding 2) — hiển thị
  // trực tiếp thay vì join `lessons` để lấy ordinal "cho đúng": cùng khuôn
  // `src/lib/stats/compute.ts` đã dùng, một trong hai nửa đang dựa vào chính
  // sự trùng hợp đó (finding 2 chỉ ghi lại nợ này, không refactor).
  const sp = await searchParams;
  const loaiVuaBam = motGiaTri(sp.tuLoai);
  const buoiVuaBamRaw = motGiaTri(sp.tuBuoi);
  const buoiVuaBam = buoiVuaBamRaw !== undefined ? Number(buoiVuaBamRaw) : null;
  const buoiHienTai = (bai.scope as number[])[0] ?? null;
  const lechBuoi =
    loaiVuaBam !== undefined &&
    buoiVuaBam !== null &&
    (loaiVuaBam !== bai.type || buoiVuaBam !== buoiHienTai);

  return (
    <ExamRunner
      assessmentId={assessmentId}
      cauHoi={cau}
      loaiBai={bai.type as "lesson" | "remedial" | "review"}
      buoi={buoiHienTai}
      canhBaoLechBuoi={lechBuoi}
    />
  );
}
