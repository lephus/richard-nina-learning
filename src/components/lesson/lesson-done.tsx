import Link from "next/link";

export function LessonDone({ score, isLast }: { score: number; isLast: boolean }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-semibold">Hoàn thành buổi học</h2>
      <p data-testid="lesson-score" className="mt-2 text-3xl font-semibold">
        {score}%
      </p>
      {/* Sau buổi cuối thì KHÔNG có buổi kế tiếp nào để mở khoá — nói vậy là
          nói sai với người vừa đi hết cả lộ trình. */}
      <p className="mt-2 text-slate-600">
        {isLast ? "Bạn đã hoàn thành buổi cuối cùng của lộ trình." : "Buổi kế tiếp đã mở khoá."}
      </p>
      <Link href="/dashboard" className="mt-4 inline-block underline">
        Về lộ trình
      </Link>
    </div>
  );
}
