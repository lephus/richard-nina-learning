import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BookImage } from "@/components/book/BookImage";
import { BookNav } from "@/components/book/BookNav";
import {
  BOOK_BUCKET, TOTAL_BOOK_PAGES, parseBookPage, printedPageOf, storagePath,
} from "@/lib/book/pages";

const SIGNED_URL_TTL_SECONDS = 3600;

// KHÔNG thêm loading.tsx cho route này. Bọc Suspense sẽ đẩy khung rỗng đi
// trước khi notFound() (ở trên) kịp chạy, khoá cứng response ở HTTP 200 —
// đúng vấn đề mà src/app/(app)/vocab/(list)/loading.tsx đã ghi lại và tái
// hiện thật. Ở route này nó sẽ làm hỏng bài e2e "số trang ngoài dải trả 404".
export default async function BookReaderPage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page: raw } = await params;
  const page = parseBookPage(raw);
  if (page === null) notFound();

  const prev = page > 1 ? page - 1 : null;
  const next = page < TOTAL_BOOK_PAGES ? page + 1 : null;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BOOK_BUCKET)
    .createSignedUrl(storagePath(page), SIGNED_URL_TTL_SECONDS);

  const src = data?.signedUrl ?? null;
  // Object vắng mặt lộ ra NGAY Ở BƯỚC KÝ này, không phải lúc ảnh tải hỏng ở
  // trình duyệt: Supabase trả StorageApiError với `code: "NoSuchKey"` khi
  // object không tồn tại (kiểm chứng bằng cách ký thử một trang không tồn
  // tại trên bucket thật — xem tests/book-bucket.test.ts). Rẽ nhánh theo
  // `code` chứ không theo `message`: JSDoc của StorageApiError trong
  // storage-js nói rõ `code` là trường dành để rẽ nhánh, `message` không có
  // hợp đồng ổn định. Trường hợp này đi cùng đường với "ảnh chưa upload" ở
  // BookImage — `src === null` khiến nó tự render đúng thông báo đó.
  const thieuAnh = (error as { code?: string } | null)?.code === "NoSuchKey";

  return (
    <main className="flex flex-col gap-4">
      <nav className="flex items-center justify-between gap-4">
        <PagerLink href={prev === null ? null : `/doc-sach/${prev}`} testId="book-prev">
          ‹ Trước
        </PagerLink>

        <span data-testid="book-label" className="text-sm font-medium">
          Trang {page}/{TOTAL_BOOK_PAGES} · sách in: {printedPageOf(page)}
        </span>

        <PagerLink href={next === null ? null : `/doc-sach/${next}`} testId="book-next">
          Sau ›
        </PagerLink>
      </nav>

      <BookNav
        page={page}
        prevHref={prev === null ? null : `/doc-sach/${prev}`}
        nextHref={next === null ? null : `/doc-sach/${next}`}
      />

      {error && !thieuAnh ? (
        <div
          data-testid="book-error"
          className="flex flex-col items-center gap-3 rounded border border-amber-200 bg-amber-50 p-8 text-center text-sm text-amber-900"
        >
          <span>Không lấy được ảnh trang {page}. Có thể mạng vừa trục trặc.</span>
          <Link href={`/doc-sach/${page}`} className="underline">
            Thử lại
          </Link>
        </div>
      ) : (
        <BookImage src={src} page={page} />
      )}
    </main>
  );
}

/**
 * Nút lật trang. `href === null` nghĩa là đã ở biên: render <button disabled>
 * chứ không phải <a> bị bôi xám — thẻ <a> không có href vẫn nhận focus và
 * click được, nên "tắt" kiểu đó chỉ tắt trên hình ảnh.
 */
function PagerLink({
  href, testId, children,
}: {
  href: string | null;
  testId: string;
  children: React.ReactNode;
}) {
  if (href === null) {
    return (
      <button
        type="button"
        disabled
        data-testid={testId}
        className="rounded border border-slate-200 px-3 py-1 text-sm text-slate-300"
      >
        {children}
      </button>
    );
  }
  return (
    <Link
      href={href}
      data-testid={testId}
      className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
    >
      {children}
    </Link>
  );
}
