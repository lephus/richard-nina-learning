"use client";

import { useState } from "react";

/**
 * Client component chỉ vì một lý do: `onError`. Script nén và đẩy ảnh
 * (`npm run phase0:book`) chạy TÁCH RỜI với deploy, nên hoàn toàn có thể app
 * đã live trong khi bucket còn thiếu trang. Lúc đó người đọc cần thấy một lời
 * giải thích và vẫn đi tiếp được, thay vì nhìn biểu tượng ảnh vỡ.
 */
export function BookImage({ src, page }: { src: string; page: number }) {
  const [hong, setHong] = useState(false);

  if (hong) {
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
    <img
      data-testid="book-image"
      src={src}
      alt={`Trang ${page} của sách từ vựng`}
      className="w-full rounded border border-slate-200"
      onError={() => setHong(true)}
    />
  );
}
