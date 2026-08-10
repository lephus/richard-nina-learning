import type { VocabProgress as VocabProgressData } from "@/lib/stats/compute";

/**
 * Tiến độ từ vựng: đã thuộc / tổng số từ trong kho, cộng thanh tiến độ và số
 * từ đã gặp. Component thường, không `"use client"` — chỉ hiển thị, không có
 * tương tác nào.
 */
export function VocabProgress({ progress }: { progress: VocabProgressData }) {
  // total === 0 chỉ xảy ra nếu bảng vocab_words rỗng (chưa từng có, sự cố dữ
  // liệu) — chặn chia cho 0 để không hiện NaN%.
  const pct = progress.total > 0 ? Math.round((progress.mastered / progress.total) * 100) : 0;

  return (
    <section className="rounded border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Từ vựng</h2>
      <p data-testid="stats-mastered" className="mt-2 text-3xl font-semibold">
        {progress.mastered} / {progress.total}
      </p>
      <div className="mt-3 h-2 w-full rounded-full bg-slate-200">
        <div className="h-2 rounded-full bg-slate-900" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm text-slate-500">đã gặp {progress.seen} từ</p>
    </section>
  );
}
