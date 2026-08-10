import Link from "next/link";
import { PASS_MARK } from "@/lib/assessment/run";
// `AssessmentType` là kiểu công khai của next-step.ts; run.ts chỉ IMPORT nó
// (không re-export) nên phải lấy đúng từ nguồn — xem src/lib/assessment/run.ts:4.
import type { AssessmentType } from "@/lib/assessment/next-step";

export function AssessmentDone({
  type,
  score,
  passed,
}: {
  type: AssessmentType;
  score: number;
  passed: boolean;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-semibold">Kết quả</h2>
      <p data-testid="assessment-score" className="mt-2 text-3xl font-semibold">
        {score}%
      </p>
      <p className="mt-1 text-sm text-slate-500">Ngưỡng đạt: {PASS_MARK[type]}%</p>
      <p
        data-testid="assessment-verdict"
        data-passed={String(passed)}
        className={passed ? "mt-4 font-medium text-green-700" : "mt-4 font-medium text-red-700"}
      >
        {passed ? "Đạt yêu cầu" : "Chưa đạt — bạn sẽ làm bài bổ túc phần sai"}
      </p>
      <Link href="/dashboard" className="mt-4 inline-block underline">
        Về lộ trình
      </Link>
    </div>
  );
}
