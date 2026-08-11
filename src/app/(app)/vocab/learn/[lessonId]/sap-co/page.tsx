import Link from "next/link";

/**
 * Chỗ đứng của bài thi 30 câu — lát 2b. Một trang thật thay vì nút chết, để
 * người dùng thử lát 2a biết mình đã đi hết phần học và phần thi chưa có.
 */
export default async function SapCoPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Bài thi sắp có</h1>
      <p className="text-slate-600">
        Phần thi 30 câu trắc nghiệm chọn từ đang được xây ở lát tiếp theo.
      </p>
      <Link href={`/vocab/learn/${lessonId}`} className="underline">
        ← Quay lại buổi học
      </Link>
    </main>
  );
}
