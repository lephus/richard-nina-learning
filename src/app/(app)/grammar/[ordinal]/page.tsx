import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { danhTinhNguoiDung } from "@/lib/supabase/danh-tinh";
import { themRelNoopenerChoLienKetNgoai } from "@/lib/content/external-links";
import { suaDuongDanAnh } from "@/lib/content/fix-image-src";
import { batDauBaiNguPhap } from "./actions";

/**
 * Tổng số bài ngữ pháp — 20, cố định (khẳng định ở `tests/grammar-lessons.test.ts`,
 * `tests/db-integrity.test.ts`). KHÔNG dùng lại `TOTAL_LESSONS`
 * (`src/lib/curriculum/groups.ts`) dù hai số hôm nay trùng nhau — đó là tổng
 * số BUỔI TỪ VỰNG, một hệ số hoàn toàn khác của lộ trình vocab (đúng bẫy
 * "trùng số không phải bất biến" mà `tests/db-integrity.test.ts` đã tự ghi
 * lại cho `lessons.id`/`ordinal`, không lặp lại ở đây bằng cách mượn hằng số
 * của một domain khác).
 */
const TONG_SO_BAI = 20;

/**
 * Trang lý thuyết một bài ngữ pháp — nội dung + nút "LÀM BÀI".
 *
 * Render `content_html` bằng `dangerouslySetInnerHTML` — CHẤP NHẬN ĐƯỢC ở
 * đây vì chuỗi cung ứng khép kín: HTML do CHÍNH pipeline của dự án này sinh
 * offline từ file `.docx` trong repo (`scripts/phase0/add-grammar-html.ts`,
 * xem thiết kế lát 2d mục 2), rồi seed bằng service key — không có đường nào
 * cho dữ liệu người dùng lọt vào chuỗi này. Lời hứa đó được giữ bằng một bất
 * biến kiểm được, không phải lời nói suông: `tests/grammar-html.test.ts`
 * khẳng định `content_html` của cả 20 bài không chứa `<script`, `<iframe`,
 * hay thuộc tính `on…=` — hễ pipeline sinh sai, test đó đỏ trước khi bất kỳ
 * ai render trang này.
 */
export default async function GrammarLessonPage({
  params,
}: {
  params: Promise<{ ordinal: string }>;
}) {
  const { ordinal: raw } = await params;
  const ordinal = Number(raw);
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > TONG_SO_BAI) notFound();

  const supabase = await createClient();
  const user = await danhTinhNguoiDung(supabase);
  if (!user) redirect("/login");

  const { data: bai, error } = await supabase
    .from("grammar_lessons")
    .select("title, content_html")
    .eq("ordinal", ordinal)
    .maybeSingle();
  if (error) throw error;
  if (!bai) notFound();

  // SỬA Ở VÒNG SOÁT CUỐI (mục minor): trước bản vá này, `content_html` rỗng
  // (dòng seed dở dang, hay migration 0012 để mặc định `''` — xem
  // `supabase/migrations/0012_grammar_content_html.sql`) render ra một `<div>`
  // trống trơn, không dấu hiệu nào cho học viên biết trang đang HỎNG khác với
  // trang đang tải chậm — im lặng sai còn tệ hơn một lỗi ồn ào, đúng nguyên
  // tắc mà lát này đã áp dụng khắp nơi khác (`ExamRunner`, `boBaiThi`…). Ném
  // lỗi thật NGAY tại đây, trước khi render, để rơi xuống `error.tsx` chung
  // thay vì một trang trắng không giải thích được gì.
  const contentHtml = bai.content_html as string;
  if (contentHtml.trim().length === 0) {
    throw new Error(`bài ${ordinal}: content_html rỗng — dữ liệu chưa seed đủ hoặc đã hỏng`);
  }

  const batDau = batDauBaiNguPhap.bind(null, ordinal);

  return (
    <main className="flex flex-col gap-5">
      {/* KHÔNG lặp tiêu đề bài bằng một <h1> riêng ở đây — `content_html` (xem
          `<pre>` kiểm ở dưới) LUÔN tự mang một `<h1>` chứa chính tên bài (xác
          nhận bằng cách đọc thẳng `data/clean/grammar.json`, không suy đoán:
          pandoc giữ nguyên tiêu đề Markdown gốc thành `<h1>` khi trích sang
          HTML). Thêm một `<h1>` "Bài N · {title}" ở tầng trang sẽ tạo ra HAI
          thẻ h1 lặp gần như y hệt nhau trên cùng một trang — vừa sai ngữ nghĩa
          HTML (nhiều h1), vừa hiện tên bài hai lần liền nhau. Chỉ giữ một nhãn
          điều hướng nhỏ (số thứ tự/20) — `content_html` tự lo phần tiêu đề
          thật. */}
      <p className="text-sm font-medium text-slate-500">
        Bài {ordinal}/{TONG_SO_BAI}
      </p>

      {/* `dangerouslySetInnerHTML` — xem JSDoc đầu file vì sao chấp nhận được ở
          đây và `tests/grammar-html.test.ts` là thứ giữ cho lời hứa đó đúng.
          Các lớp `[&_...]` bên dưới tự tay tạo kiểu cho `content_html` (h1,
          bảng, danh sách, chữ đậm…) — dự án KHÔNG cài `@tailwindcss/typography`
          (đã kiểm `package.json`/`globals.css`), nên một class `prose` không
          có plugin đứng sau sẽ không làm gì cả và để nguyên bảng/danh sách
          hiện ra thô, đi ngược đúng mục tiêu "bài lý thuyết ĐỌC ĐƯỢC" của lát
          này — không thêm phụ thuộc mới (ngoài phạm vi Task 4) để giữ việc
          này tự thân trong một file. */}
      <div
        data-testid="grammar-content"
        className={[
          "flex flex-col gap-2 leading-relaxed",
          "[&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-semibold",
          // SỬA Ở VÒNG SOÁT CUỐI (mục minor): danh sách gốc chỉ phủ 6 thẻ,
          // nhưng corpus (đọc trực tiếp `data/clean/grammar.json`, không suy
          // đoán) còn 131 `<blockquote>`, 2 `<h2>`, 400 `<em>`, 216 `<u>` —
          // với preflight của Tailwind (`@import "tailwindcss"` trong
          // `globals.css`) xoá margin/kiểu mặc định của trình duyệt cho các
          // thẻ này, chúng render ra KHÔNG khác gì văn bản thường, mất hết ý
          // nghĩa nhấn mạnh/trích dẫn mà tác giả gốc đặt vào.
          "[&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold",
          "[&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-slate-700",
          "[&_em]:italic",
          "[&_u]:underline",
          "[&_p]:my-2",
          "[&_strong]:font-semibold",
          "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6",
          "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
          "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:border [&_table]:border-slate-300",
          "[&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:p-2 [&_th]:text-left [&_th]:align-top",
          "[&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_td]:align-top",
          "[&_mark]:bg-yellow-200",
        ].join(" ")}
        // SỬA Ở VÒNG SOÁT CUỐI (mục 4, IMPORTANT + mục minor): hai vá TẦNG
        // RENDER, cả hai đều cố tình không đụng `content_html` gốc (xem JSDoc
        // từng hàm vì sao) — (1) `suaDuongDanAnh`: 3/20 bài mang
        // `<img src="media/imageN.ext">` trỏ tới file KHÔNG tồn tại, viết lại
        // thành đường dẫn `public/` thật; (2) `themRelNoopenerChoLienKetNgoai`:
        // 4 liên kết ngoài thật thiếu `rel="noopener noreferrer"`.
        dangerouslySetInnerHTML={{
          __html: themRelNoopenerChoLienKetNgoai(suaDuongDanAnh(contentHtml, ordinal)),
        }}
      />

      <form action={batDau}>
        <button
          type="submit"
          data-testid="exam-button"
          className="w-fit rounded bg-slate-900 px-4 py-2 text-center text-white hover:bg-slate-800"
        >
          LÀM BÀI
        </button>
      </form>
    </main>
  );
}
