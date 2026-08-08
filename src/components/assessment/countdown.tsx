"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Đồng hồ CHỈ ĐỂ HIỂN THỊ — so `Date.now()` (đồng hồ trình duyệt) với
 * `expiresAt` (đồng hồ server) mỗi giây. Nó không gửi gì lên server và server
 * không hỏi nó: mọi quyết định "còn hạn hay không" nằm ở `run.ts`, đọc `now`
 * truyền vào so với `expires_at` trong database (spec mục 6.2). Hết giờ trên
 * màn hình mà chặn JavaScript thì `answerItem` phía server vẫn từ chối sau
 * `expires_at` — không có đường lách qua việc tắt/giả đồng hồ client.
 */
export function Countdown({
  expiresAt,
  onExpire,
}: {
  expiresAt: string;
  /**
   * Gọi ĐÚNG MỘT LẦN khi đồng hồ chạm 0 — chỉ truyền hàm này cho bài kiểm
   * tra (`hardLocked === true`); bài ôn tập/bổ túc có đồng hồ chỉ mang tính
   * gợi ý và không được tự nộp khi hết giờ.
   */
  onExpire?: () => void;
}) {
  const target = new Date(expiresAt).getTime();
  const [left, setLeft] = useState(() => Math.max(0, target - Date.now()));
  // Chặn gọi `onExpire` quá một lần bằng REF, không chỉ bằng state: React 19
  // StrictMode ở dev tự chạy lại effect (mount → cleanup → mount), và
  // `setLeft(0)` có thể bị gọi thêm vài tick sau khi đã chạm 0.
  const firedRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, target - Date.now())), 1000);
    return () => clearInterval(t);
  }, [target]);

  useEffect(() => {
    if (left === 0 && !firedRef.current) {
      firedRef.current = true;
      onExpire?.();
    }
  }, [left, onExpire]);

  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);

  return (
    <span
      data-testid="countdown"
      className={left < 5 * 60 * 1000 ? "font-mono text-red-600" : "font-mono"}
    >
      {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}
