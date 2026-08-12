"use client";

import { useState } from "react";

/**
 * Client component chỉ vì một lý do: `onError`. Ảnh chưa upload lộ ra sớm
 * hơn thế này tưởng — ngay ở bước KÝ URL trên server (`createSignedUrl` báo
 * lỗi `code: "NoSuchKey"`), không phải ở đây. Route cha (`[page]/page.tsx`)
 * đọc lỗi đó và truyền thẳng `src={null}` xuống, nên component này render
 * đúng thông báo "chưa có ảnh" mà không cần chờ trình duyệt thử tải gì cả.
 *
 * `onError` ở dưới vẫn giữ lại làm lưới đỡ cho trường hợp còn sót: object
 * tồn tại lúc ký (không lỗi) nhưng việc tải ảnh thật ở trình duyệt hỏng giữa
 * chừng — ví dụ mạng đứt ngay sau khi ký. Hiếm, nhưng script nén và đẩy ảnh
 * (`npm run phase0:book`) chạy TÁCH RỜI với deploy nên vẫn cần một lưới đỡ:
 * người đọc cần thấy lời giải thích và vẫn đi tiếp được, thay vì nhìn biểu
 * tượng ảnh vỡ.
 */
export function BookImage({ src, page }: { src: string | null; page: number }) {
  const [hong, setHong] = useState(false);

  if (src === null || hong) {
    return (
      <div
        data-testid="book-image-error"
        className="flex min-h-96 items-center justify-center rounded border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500"
      >
        Chưa có ảnh cho trang {page}. Dùng nút Trước/Sau để đọc tiếp.
      </div>
    );
  }

  return (
    // Dùng <img> chứ không phải next/image: ảnh đã được nén đúng định dạng và
    // đúng bề rộng ngay trong pipeline, nên cho qua bộ tối ưu của Next chỉ
    // thêm độ trễ và chi phí hàm để nhận lại đúng thứ vừa đưa vào. Ngoài ra
    // `remotePatterns` của Next 16 chặn signed URL trừ khi mở wildcard cho
    // toàn bộ query string — xem mục 5 của spec.
    //
    // width/height khai đúng kích thước gốc của ảnh đã nén (1600×2071) để
    // trình duyệt giữ tỉ lệ khung ngay từ đầu — không có chúng thì khung ảnh
    // cao 0 cho tới khi tải xong, rồi bung ra đột ngột, đẩy mọi thứ bên dưới
    // nhảy theo mỗi lần lật trang.
    <img
      data-testid="book-image"
      src={src}
      width={1600}
      height={2071}
      alt={`Trang ${page} của sách từ vựng`}
      className="w-full rounded border border-slate-200"
      onError={() => setHong(true)}
    />
  );
}
