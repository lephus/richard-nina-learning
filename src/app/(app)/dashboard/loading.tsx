/**
 * Khung chờ. Không có tệp này thì chuyển trang là một màn trắng cho tới khi
 * Supabase trả lời — trên gói Free ở xa, đó là 150–400ms không có gì trên
 * màn hình.
 */
export default function Loading() {
  return (
    <main className="flex flex-col gap-6">
      <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-40 animate-pulse rounded bg-slate-100" />
        <div className="h-40 animate-pulse rounded bg-slate-100" />
      </div>
    </main>
  );
}
