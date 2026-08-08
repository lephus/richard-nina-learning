import Link from "next/link";

/**
 * Slot kế tiếp sau MỘT buổi học, suy THẲNG từ số thứ tự buổi — không cần đọc
 * database. Mẫu 7-slot mỗi chu kỳ 4 buổi (buổi b, buổi b+1, ôn tập(b,b+1),
 * buổi b+2, buổi b+3, ôn tập(b+2,b+3), kiểm tra — xem slots.ts) luôn đặt một
 * ÔN TẬP ngay sau buổi THỨ HAI của mỗi cặp (b+1 hoặc b+3 — ordinal chẵn) và
 * một BUỔI HỌC khác ngay sau buổi ĐẦU của mỗi cặp (b hoặc b+2 — ordinal lẻ).
 * Kiểm tra không bao giờ đứng ngay sau một buổi học (nó luôn đứng sau một ôn
 * tập), nên chỉ cần phân hai nhánh chẵn/lẻ (Task 7 review, finding B: bản cũ
 * luôn nói "buổi kế tiếp đã mở khoá", sai với đúng một nửa số buổi).
 */
function nextUnlockedLabel(ordinal: number): string {
  return ordinal % 2 === 0
    ? `Ôn tập buổi ${ordinal - 1}–${ordinal} đã mở khoá.`
    : `Buổi ${ordinal + 1} đã mở khoá.`;
}

export function LessonDone({
  score,
  ordinal,
  isLast,
}: {
  score: number;
  /** Số thứ tự buổi (1..20) VỪA hoàn thành — dùng để suy đúng slot kế tiếp. */
  ordinal: number;
  isLast: boolean;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-semibold">Hoàn thành buổi học</h2>
      <p data-testid="lesson-score" className="mt-2 text-3xl font-semibold">
        {score}%
      </p>
      {/* Sau buổi cuối thì KHÔNG có gì để mở khoá — nói vậy là nói sai với
          người vừa đi hết cả lộ trình. */}
      <p className="mt-2 text-slate-600">
        {isLast ? "Bạn đã hoàn thành buổi cuối cùng của lộ trình." : nextUnlockedLabel(ordinal)}
      </p>
      <Link href="/dashboard" className="mt-4 inline-block underline">
        Về lộ trình
      </Link>
    </div>
  );
}
