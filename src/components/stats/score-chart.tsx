import Link from "next/link";
import type { ScorePoint } from "@/lib/stats/compute";

// Chiều cao khung cột cố định (px) — không dùng thư viện biểu đồ nào (dự án
// không có phụ thuộc nào cho việc này, xem quyết định trong brief), chiều
// cao mỗi cột là `style.height` tính theo phần trăm của khung này.
const CHART_HEIGHT = 128;

/**
 * Biểu đồ cột điểm số các bài đã nộp, theo đúng thứ tự thời gian mà
 * `scoreSeries` đã sắp. Component thường, không `"use client"`.
 */
export function ScoreChart({ series }: { series: ScorePoint[] }) {
  if (series.length === 0) {
    return (
      <section className="rounded border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Điểm số qua các bài</h2>
        <p className="mt-3 text-sm text-slate-500">
          Chưa có bài đánh giá nào đã nộp.{" "}
          <Link href="/dashboard" className="underline">
            Làm bài ôn tập đầu tiên
          </Link>
          .
        </p>
      </section>
    );
  }

  return (
    <section className="rounded border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Điểm số qua các bài</h2>
      <div className="mt-4 flex items-end gap-3 overflow-x-auto">
        {series.map((point) => (
          <div key={point.id} className="flex flex-col items-center gap-1" style={{ minWidth: 56 }}>
            <div className="flex items-end" style={{ height: CHART_HEIGHT }}>
              <div
                data-testid="score-bar"
                data-passed={String(point.passed)}
                title={`${point.score}%`}
                // Tối thiểu 2% để một bài điểm 0 vẫn còn một vệt cột nhìn
                // thấy được, thay vì biến mất hoàn toàn khỏi biểu đồ.
                style={{ height: `${Math.max(point.score, 2)}%` }}
                className={`w-8 rounded-t ${point.passed ? "bg-green-600" : "bg-red-500"}`}
              />
            </div>
            <span className="max-w-[64px] text-center text-xs text-slate-500">{point.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
