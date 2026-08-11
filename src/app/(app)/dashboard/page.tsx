import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TOTAL_GROUPS } from "@/lib/curriculum/groups";
import { groupStates, groupDone, nextActivity, toAssessmentRow } from "@/lib/curriculum/progress";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // MỘT truy vấn, không phải hai. Bản trước có đọc thêm `lesson_cursor` kèm
  // quan hệ nhúng `lessons(ordinal)` để phân biệt "đang học" với "chưa làm" —
  // nhưng groupDone/nextActivity bên dưới chỉ rẽ nhánh theo `kind === "dat"`,
  // không đọc "đang học" khác "chưa làm" ở BẤT KỲ đâu (progress.ts: cả hai
  // đều "chưa dat" như nhau với cả hai hàm này). Soát vòng 1 chỉ ra điều này,
  // đã tự kiểm lại bằng cách đọc hết groupStates/groupDone/nextActivity: với
  // `cursors=[]`, hai hàm cho ra CÙNG MỘT kết quả hiển thị (doneCount,
  // next.group, next.lessonOrdinal) như khi truyền cursor thật — không có
  // đường nào con trỏ ảnh hưởng tới thứ dashboard vẽ ra màn hình. Bỏ truy vấn
  // này xoá theo luôn phép ép kiểu `as unknown as` không cần thiết nữa.
  // Trang `/vocab` (khác file, không đụng ở đây) vẫn đọc `lesson_cursor` thật
  // vì NÓ hiển thị "đang học" trên từng ô buổi — dashboard thì không.
  const assessmentsRes = await supabase
    .from("assessments")
    .select("id, type, scope, status, passed, score, parent_id")
    .eq("user_id", user.id)
    .order("id");
  if (assessmentsRes.error) throw assessmentsRes.error;

  const assessments = (assessmentsRes.data ?? []).map(toAssessmentRow);
  const states = groupStates(assessments, []);
  const doneCount = states.filter(groupDone).length;
  const next = nextActivity(states);
  // Vòng soát cuối 2a: `nextActivity` chỉ nhảy qua ô có kind === "dat", mà
  // "dat" đòi một dòng assessments đã nộp passed = true — không mã nào trong
  // src/ ghi bảng đó ở lát này (bài thi là lát 2b). Hệ quả nếu không chặn ở
  // đây: MỌI tài khoản, kể cả một đã học xong 5 nhóm bằng cách đọc hết thẻ
  // (lesson_cursor, không phải assessments), đều bị dòng "Tiếp tục" chỉ về
  // "Nhóm 1 · Buổi 1" — không phải trống, mà chỉ SAI ĐƯỜNG. `assessments` đã
  // đọc sẵn ở trên nên không tốn truy vấn thêm để biết có bài nào đã nộp
  // chưa. Khi lát 2b viết xong luồng nộp bài, bảng có dữ liệu thật và dòng
  // này tự sống lại đúng nghĩa, không cần sửa gì ở đây nữa.
  const hasSubmitted = assessments.some((a) => a.status === "submitted");

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Hôm nay học gì?</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/vocab"
          data-testid="track-vocab"
          className="flex flex-col items-center gap-1 rounded border border-slate-200 bg-white p-8 text-center hover:border-slate-400"
        >
          <span className="text-3xl" aria-hidden>📘</span>
          <span className="font-semibold tracking-wide">TỪ VỰNG</span>
          <span className="text-sm text-slate-600">
            {doneCount}/{TOTAL_GROUPS} nhóm · 605 từ
          </span>
          {/* Gợi ý, KHÔNG phải luật: 10 nhóm vẫn mở hết, bấm thẳng nhóm 7 lúc
              nào cũng được. Dòng này chỉ đỡ cho người học không phải nhớ mình
              đang dở ở đâu.
              `hasSubmitted &&`: thà không nói gì còn hơn chỉ sai — xem chú
              thích tại khai báo `hasSubmitted` ở trên. */}
          {hasSubmitted && next && (
            <span data-testid="continue-hint" className="mt-2 text-xs text-slate-500">
              Tiếp tục: Nhóm {next.group} ·{" "}
              {/* `lessonOrdinal` là số thứ tự TOÀN CỤC — cùng nhãn với trang
                  /vocab và tiêu đề trang học. `null` nghĩa là ô ôn tập. */}
              {next.lessonOrdinal === null ? "Ôn tập" : `Buổi ${next.lessonOrdinal}`}
            </span>
          )}
        </Link>

        <div
          data-testid="track-grammar"
          className="flex flex-col items-center gap-1 rounded border border-slate-200 bg-slate-100 p-8 text-center text-slate-400"
        >
          <span className="text-3xl" aria-hidden>📗</span>
          <span className="font-semibold tracking-wide">NGỮ PHÁP</span>
          <span className="text-sm">20 bài</span>
          {/* Lộ trình ngữ pháp là lát 2c. Thẻ vẫn hiện để hình dạng dashboard
              đúng ngay từ bây giờ, nhưng chưa dẫn đi đâu. */}
          <span className="mt-2 text-xs">Sắp có</span>
        </div>
      </div>
    </main>
  );
}
