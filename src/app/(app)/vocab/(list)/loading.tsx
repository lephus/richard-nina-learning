/**
 * Sống trong route group `(list)` — không phải ngẫu nhiên. `loading.tsx` ở
 * Next.js App Router bọc Suspense quanh `page.tsx` CỘNG VỚI mọi route con bên
 * dưới cùng thư mục. Nếu tệp này nằm thẳng ở `vocab/loading.tsx`, nó bọc luôn
 * `vocab/browse/[groupId]` và `vocab/learn/[lessonId]` — hai route đó rớt vào
 * response STREAM thay vì chờ xong mới trả, làm hỏng đúng hai thứ đã có test
 * canh: `notFound()` ở trang xem lại nhóm ngoài biên không còn set được mã
 * 404 (khoá cứng ở 200 ngay khi khung rỗng được đẩy đi trước), và phím mũi
 * tên ở trang học có khoảng hở trước khi listener của Deck kịp gắn. Cả hai đã
 * tái hiện thật (đỏ có kiểm chứng, xanh trở lại khi bỏ tệp này ra khỏi
 * `vocab/`, đỏ lại khi đặt về chỗ cũ). Route group không đổi URL (`/vocab`
 * vẫn vậy) nhưng CÔ LẬP biên Suspense vào đúng một mình trang danh sách,
 * không lan sang hai route con là anh em cùng cấp, đứng ngoài `(list)/`.
 */
export default function Loading() {
  return (
    <main className="flex flex-col gap-5">
      <div className="h-8 w-40 animate-pulse rounded bg-slate-200" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded bg-slate-100" />
        ))}
      </div>
    </main>
  );
}
