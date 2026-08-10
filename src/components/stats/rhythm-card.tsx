import type { Rhythm } from "@/lib/stats/compute";

/**
 * Nhịp học: chuỗi tuần liên tiếp có học, và số buổi tuần này so với mục
 * tiêu. Câu chữ khích lệ, không trách móc — không có nhánh nào nói người học
 * "đang tụt lại" hay "chưa đủ".
 */
export function RhythmCard({ rhythm }: { rhythm: Rhythm }) {
  const remaining = Math.max(rhythm.target - rhythm.thisWeekSessions, 0);
  const weekMessage =
    rhythm.thisWeekSessions >= rhythm.target
      ? "Đã đạt mục tiêu tuần này"
      : `Còn ${remaining} buổi nữa là đạt mục tiêu tuần này`;
  const streakMessage =
    rhythm.streakWeeks === 0
      ? "Bắt đầu chuỗi tuần học đều của bạn"
      : `${rhythm.streakWeeks} tuần liên tiếp có học`;

  return (
    <section className="rounded border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Nhịp học</h2>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <p data-testid="stats-streak" className="text-3xl font-semibold">
            {rhythm.streakWeeks}
          </p>
          <p className="mt-1 text-sm text-slate-500">{streakMessage}</p>
        </div>
        <div>
          <p data-testid="stats-week-progress" className="text-3xl font-semibold">
            {rhythm.thisWeekSessions} / {rhythm.target}
          </p>
          <p className="mt-1 text-sm text-slate-500">{weekMessage}</p>
        </div>
      </div>
    </section>
  );
}
