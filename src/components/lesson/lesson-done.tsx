import Link from "next/link";

export function LessonDone({ score }: { score: number }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-semibold">Hoàn thành buổi học</h2>
      <p data-testid="lesson-score" className="mt-2 text-3xl font-semibold">
        {score}%
      </p>
      <p className="mt-2 text-slate-600">Buổi kế tiếp đã mở khoá.</p>
      <Link href="/dashboard" className="mt-4 inline-block underline">
        Về lộ trình
      </Link>
    </div>
  );
}
