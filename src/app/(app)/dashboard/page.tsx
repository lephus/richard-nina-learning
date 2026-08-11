import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Bản tạm của lát 2a. Hai thẻ đúng hình dạng cuối cùng, nhưng chưa có số liệu
 * và chưa có dòng "Tiếp tục" — cả hai cần `progress.ts` (Task 5) và trang
 * `/vocab` (Task 6) có thật trước đã. Task 14 thay tệp này.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // AppLayout đã chặn ở tầng trên, nhưng vẫn tường minh ở đây — cùng cách các
  // trang khác trong nhóm (app) đang làm.
  if (!user) redirect("/login");

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Hôm nay học gì?</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <TrackCard
          testId="track-vocab"
          icon="📘"
          title="TỪ VỰNG"
          subtitle="605 từ · 10 nhóm"
          href={null}
        />
        <TrackCard
          testId="track-grammar"
          icon="📗"
          title="NGỮ PHÁP"
          subtitle="20 bài"
          href={null}
        />
      </div>
    </main>
  );
}

function TrackCard({
  testId, icon, title, subtitle, href,
}: {
  testId: string;
  icon: string;
  title: string;
  subtitle: string;
  href: string | null;
}) {
  const shell = "flex flex-col items-center gap-1 rounded border border-slate-200 p-8 text-center";
  const inner = (
    <>
      <span className="text-3xl" aria-hidden>{icon}</span>
      <span className="font-semibold tracking-wide">{title}</span>
      <span className="text-sm text-slate-600">{subtitle}</span>
      {href === null && <span className="mt-2 text-xs text-slate-400">Sắp có</span>}
    </>
  );
  return href ? (
    <Link href={href} data-testid={testId} className={`${shell} bg-white hover:border-slate-400`}>
      {inner}
    </Link>
  ) : (
    <div data-testid={testId} className={`${shell} bg-slate-100 text-slate-400`}>{inner}</div>
  );
}
