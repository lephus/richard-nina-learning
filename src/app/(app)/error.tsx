"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex flex-col items-start gap-4">
      <h1 className="text-xl font-semibold">Không tải được dữ liệu</h1>
      <p className="text-slate-600">
        Có thể do mất mạng, hoặc máy chủ đang khởi động lại. Thử lại sau giây lát.
      </p>
      <button onClick={reset} className="rounded bg-slate-900 px-4 py-2 text-white">
        Thử lại
      </button>
    </main>
  );
}
