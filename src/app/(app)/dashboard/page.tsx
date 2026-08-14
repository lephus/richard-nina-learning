import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { danhTinhNguoiDung } from "@/lib/supabase/danh-tinh";
import { TOTAL_GROUPS } from "@/lib/curriculum/groups";
import { groupStates, groupDone, nextActivity, toAssessmentRow } from "@/lib/curriculum/progress";

export default async function DashboardPage() {
  const supabase = await createClient();
  const user = await danhTinhNguoiDung(supabase);
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
  // THÊM cột `grammar_lesson_id` ở lát 2d — CÙNG một truy vấn `assessments`
  // này giờ phục vụ CẢ HAI thẻ (không phải hai lượt đọc riêng): `toAssessmentRow`
  // bên dưới không đọc cột này (nó chỉ lo nhánh vocab), nên tính đếm "đạt bao
  // nhiêu bài ngữ pháp" phải làm TRƯỚC khi map qua nó, đọc thẳng từ dữ liệu
  // thô — xem `grammarDoneCount` ngay dưới.
  const assessmentsRes = await supabase
    .from("assessments")
    .select("id, type, scope, status, passed, score, parent_id, grammar_lesson_id")
    .eq("user_id", user.id)
    .order("id");
  if (assessmentsRes.error) throw assessmentsRes.error;

  const rawAssessments = assessmentsRes.data ?? [];
  const assessments = rawAssessments.map(toAssessmentRow);

  // Số bài ngữ pháp đã ĐẠT — đếm theo BÀI (grammar_lesson_id), không theo số
  // dòng `assessments`: làm lại một bài đã đạt (tự do, không khoá) không được
  // đếm hai lần. `Set` khử trùng lặp cho đúng ý đó.
  const grammarDoneCount = new Set(
    rawAssessments
      .filter((a) => a.type === "grammar" && a.passed === true)
      .map((a) => a.grammar_lesson_id as number),
  ).size;
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
  // chưa.
  //
  // SỬA Ở VÒNG SOÁT CUỐI lát 2d (mục 3, IMPORTANT): thêm `a.type !== "grammar"`
  // — bản trước lát 2d tính đúng vì `assessments` khi đó chỉ có `lesson`/
  // `review`/`remedial`, những loại `next`/`groupStates` (đọc từ `progress.ts`)
  // THỰC SỰ hiểu. Từ lát 2d, truy vấn NÀY (đã mở rộng ở trên để phục vụ luôn
  // thẻ NGỮ PHÁP) trả về CẢ bài `grammar`, và cùng đúng bẫy đã ghi ở trên lặp
  // lại một lần nữa: một học viên chỉ vừa nộp một bài ngữ pháp (chưa từng đụng
  // tới `/vocab`) khiến `hasSubmitted` thành `true` trong khi `next` vẫn là
  // "Nhóm 1 · Buổi 1" mặc định (`groupStates`/`nextActivity` không đọc bài
  // `grammar` — nó thuộc lộ trình khác hẳn) — dòng "Tiếp tục" hiện ra CHỈ VÌ
  // có MỘT bài đã nộp, dù bài đó không nói được gì về lộ trình từ vựng, đúng
  // hệt cái bẫy "SAI ĐƯỜNG" mà đoạn chú thích trên đã ghi lại, chỉ đổi nguồn
  // gây ra. `grammarDoneCount` hai dòng trên đã lọc theo đúng `type` này —
  // dùng lại cùng điều kiện thay vì để hai bộ lọc trôi dạt khỏi nhau.
  const hasSubmitted = assessments.some((a) => a.status === "submitted" && a.type !== "grammar");

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

        <Link
          href="/grammar"
          data-testid="track-grammar"
          className="flex flex-col items-center gap-1 rounded border border-slate-200 bg-white p-8 text-center hover:border-slate-400"
        >
          <span className="text-3xl" aria-hidden>📗</span>
          <span className="font-semibold tracking-wide">NGỮ PHÁP</span>
          <span className="text-sm text-slate-600">{grammarDoneCount}/20 bài</span>
        </Link>
      </div>
    </main>
  );
}
