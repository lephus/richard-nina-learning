"use client";

import { useEffect, useRef, useState } from "react";
import { saveNote } from "@/app/(app)/vocab/actions";
import { NOTE_MAX } from "@/lib/vocab/note";

const DEBOUNCE_MS = 600;

/**
 * Ô ghi chú nhiều dòng, tự lưu.
 *
 * Ba luật, theo đúng ngân sách tốc độ của lát này:
 *  1. Gõ KHÔNG BAO GIỜ chờ mạng — `onChange` chạy ngay, việc lưu đi sau.
 *  2. Lưu sau 600ms ngừng gõ, VÀ lúc component tháo. Không có vế thứ hai thì
 *     gõ xong bấm "Từ sau →" ngay sẽ mất chữ vừa gõ — hẹn giờ bị huỷ cùng
 *     component.
 *  3. Lỗi lưu hiện ra, không nuốt. Ghi chú là thứ người học tự tay viết; mất
 *     im lặng là mất niềm tin vào cả app.
 */
export function NoteBox({
  wordId,
  body,
  onChange,
}: {
  wordId: number;
  body: string;
  onChange: (next: string) => void;
}) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Ref chứ không state: hàm dọn của `useEffect` đóng băng biến của lần render
  // nó được tạo ra, mà lúc tháo thì cần giá trị MỚI NHẤT.
  const bodyRef = useRef(body);
  const savedRef = useRef(body);

  useEffect(() => {
    bodyRef.current = body;
  }, [body]);

  async function flush() {
    if (bodyRef.current === savedRef.current) return;
    const sending = bodyRef.current;
    setStatus("saving");
    try {
      await saveNote(wordId, sending);
      savedRef.current = sending;
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    if (body === savedRef.current) return;
    const t = setTimeout(() => void flush(), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // `flush` cố tình không nằm trong danh sách phụ thuộc: nó đọc mọi thứ qua
    // ref nên không cần dựng lại hẹn giờ mỗi lần render.
  }, [body, wordId]);

  // Lưu nốt khi rời thẻ. `wordId` không bao giờ đổi trong một lần sống của
  // component (đổi từ là remount vì `key={card.id}`), nên `flush` của lần
  // render đầu vẫn gọi đúng `saveNote` cho đúng từ. `setStatus` sau khi tháo
  // là no-op ở React 19, không cảnh báo.
  useEffect(() => {
    return () => {
      void flush();
    };
  }, []);

  return (
    <div className="mt-5">
      <label htmlFor={`note-${wordId}`} className="block text-sm font-medium text-slate-700">
        Ghi chú của bạn
      </label>
      <textarea
        id={`note-${wordId}`}
        data-testid="note-box"
        value={body}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        maxLength={NOTE_MAX}
        // Người học gõ cả tiếng Việt lẫn tiếng Anh ở đây, nên KHÔNG tắt
        // autocorrect như ô "gõ lại từ" cũ — đây là chỗ viết tự do.
        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
      />
      <p
        data-testid="note-status"
        aria-live="polite"
        className={`mt-1 text-right text-xs ${status === "error" ? "text-red-600" : "text-slate-400"}`}
      >
        {status === "saving" && "đang lưu…"}
        {status === "saved" && "đã lưu"}
        {status === "error" && "không lưu được — thử gõ lại"}
      </p>
    </div>
  );
}
