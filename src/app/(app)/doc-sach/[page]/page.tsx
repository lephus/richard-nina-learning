import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BookImage } from "@/components/book/BookImage";
import { BookNav } from "@/components/book/BookNav";
import {
  BOOK_BUCKET, TOTAL_BOOK_PAGES, parseBookPage, printedPageOf, storagePath,
} from "@/lib/book/pages";

const SIGNED_URL_TTL_SECONDS = 3600;

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

  // Xin luôn URL trang kế trong CÙNG một lời gọi để prefetch mà không tốn
  // thêm một vòng mạng. Ở trang cuối thì chỉ xin một đường dẫn: `113.webp`
  // không tồn tại, và xin nó sẽ đẻ ra một lỗi giả đúng ở chỗ không có gì sai.
  const paths = next === null
    ? [storagePath(page)]
    : [storagePath(page), storagePath(next)];

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BOOK_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  const src = data?.find((d) => d.path === storagePath(page))?.signedUrl ?? null;
  // Hỏng URL trang KẾ chỉ làm mất phần tăng tốc, không được phép làm hỏng
  // phần đọc — nên nó không tham gia vào điều kiện báo lỗi bên dưới.
  const nextSrc = next === null
    ? null
    : data?.find((d) => d.path === storagePath(next))?.signedUrl ?? null;

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

      {error || src === null ? (
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

      {nextSrc && <link rel="prefetch" as="image" href={nextSrc} />}
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
