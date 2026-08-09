import Link from "next/link";
import { assessmentLabel, slotAt, TOTAL_SLOTS, type Slot } from "@/lib/assessment/slots";

/**
 * Slot index của buổi `ordinal` trong chuỗi 35 hoạt động — quét tuyến tính
 * qua slotAt (35 phần tử, quét hết vẫn rẻ; slots.ts không xuất một hàm
 * nghịch đảo riêng, và tự viết một công thức tay ở ĐÂY lại đúng là thứ
 * finding 4 vừa cấm).
 */
function lessonSlotIndex(ordinal: number): number {
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const slot = slotAt(i);
    if (slot.kind === "lesson" && slot.lessons[0] === ordinal) return i;
  }
  throw new Error(`không tìm thấy slot cho buổi ${ordinal}`);
}

function unlockedLabel(slot: Slot): string {
  if (slot.kind === "lesson") return `Buổi ${slot.lessons[0]} đã mở khoá.`;
  // Một nguồn duy nhất cho nhãn (xem comment tại slots.ts:assessmentLabel) —
  // không tự dựng chuỗi bằng chỉ số cố định ([0]/[1], [0]/[3]) ở đây nữa.
  return `${assessmentLabel(slot.kind, slot.lessons)} đã mở khoá.`;
}

/**
 * Slot kế tiếp sau MỘT buổi học, đọc THẲNG từ `slotAt` — MỘT định nghĩa duy
 * nhất cho mẫu 35-slot (Task 7 review vòng 4, finding 4). Bản trước tự suy
 * lại quy luật "ordinal chẵn/lẻ" bằng tay — đúng số học cho hiện tại, nhưng
 * là NGUỒN SỰ THẬT THỨ HAI cho đúng thứ slots.ts đã định nghĩa; đổi PATTERN
 * ở đó một ngày nào đó thì dashboard theo đúng ngay còn màn hình này nói dối
 * trong im lặng — đúng dạng lỗi mà finding B (vòng 3) vừa vá, ở đúng chỗ đó.
 *
 * KHÔNG buổi học nào (1..20) là slot CUỐI của chuỗi 35 — slot cuối (index
 * 34) luôn là một bài kiểm tra, không phải buổi học — nên `index + 1` luôn
 * hợp lệ, kể cả ở buổi 20: câu "Ôn tập buổi 19–20 đã mở khoá." hữu ích hơn
 * hẳn một câu chung chung như "đã xong buổi cuối" mà không nói người học
 * nên làm gì tiếp — vì vậy không còn nhánh `isLast` riêng nữa.
 */
function nextUnlockedLabel(ordinal: number): string {
  const index = lessonSlotIndex(ordinal);
  return unlockedLabel(slotAt(index + 1));
}

export function LessonDone({
  score,
  ordinal,
}: {
  score: number;
  /** Số thứ tự buổi (1..20) VỪA hoàn thành — dùng để suy đúng slot kế tiếp. */
  ordinal: number;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-semibold">Hoàn thành buổi học</h2>
      <p data-testid="lesson-score" className="mt-2 text-3xl font-semibold">
        {score}%
      </p>
      <p className="mt-2 text-slate-600">{nextUnlockedLabel(ordinal)}</p>
      <Link href="/dashboard" className="mt-4 inline-block underline">
        Về lộ trình
      </Link>
    </div>
  );
}
