/**
 * Chuỗi 35 hoạt động của chương trình, TẤT ĐỊNH — suy ra từ chỉ số bằng phép
 * chia, không lưu xuống database. Cùng khuôn `itemAt` ở lát 1b.
 *
 * 20 buổi chia 5 chu kỳ, mỗi chu kỳ 7 hoạt động:
 *   Buổi b, Buổi b+1, ÔN(b,b+1), Buổi b+2, Buổi b+3, ÔN(b+2,b+3), KIỂM TRA(b..b+3)
 */

export type SlotKind = "lesson" | "review" | "test";

export interface Slot {
  kind: SlotKind;
  /** Số thứ tự buổi, 1..20. Một phần tử với `lesson`, hai với `review`, bốn với `test`. */
  lessons: number[];
}

const SLOTS_PER_CYCLE = 7;
const LESSONS_PER_CYCLE = 4;
const CYCLES = 5;
export const TOTAL_SLOTS = CYCLES * SLOTS_PER_CYCLE; // 35

/** Vị trí trong chu kỳ → hoạt động, tính theo buổi cơ sở `b`. */
const PATTERN: ReadonlyArray<(b: number) => Slot> = [
  (b) => ({ kind: "lesson", lessons: [b] }),
  (b) => ({ kind: "lesson", lessons: [b + 1] }),
  (b) => ({ kind: "review", lessons: [b, b + 1] }),
  (b) => ({ kind: "lesson", lessons: [b + 2] }),
  (b) => ({ kind: "lesson", lessons: [b + 3] }),
  (b) => ({ kind: "review", lessons: [b + 2, b + 3] }),
  (b) => ({ kind: "test", lessons: [b, b + 1, b + 2, b + 3] }),
];

export function slotAt(index: number): Slot {
  if (!Number.isInteger(index) || index < 0 || index >= TOTAL_SLOTS) {
    throw new RangeError(`slot ${index} ngoài biên 0..${TOTAL_SLOTS - 1}`);
  }
  const cycle = Math.floor(index / SLOTS_PER_CYCLE);
  const within = index % SLOTS_PER_CYCLE;
  const baseLesson = cycle * LESSONS_PER_CYCLE + 1;
  return PATTERN[within]!(baseLesson);
}

/** Loại bài đánh giá — rộng hơn `SlotKind` một chút: `remedial` (bổ túc)
 * không chiếm slot riêng trong chuỗi 35 hoạt động (xem comment ở
 * dashboard/page.tsx), nhưng vẫn cần một nhãn hiển thị giống hệt khuôn
 * review/test. */
export type AssessmentKind = "review" | "test" | "remedial";

const KIND_LABEL: Record<AssessmentKind, string> = {
  review: "Ôn tập",
  test: "Kiểm tra",
  remedial: "Bổ túc",
};

/**
 * Nhãn hiển thị MỘT NGUỒN cho một bài ôn tập/kiểm tra/bổ túc — ví dụ
 * "Ôn tập buổi 1–2" hay "Kiểm tra buổi 1–4". Trước lát này, ba nơi
 * (stats/compute.ts, dashboard/page.tsx, lesson-done.tsx) tự dựng chuỗi này
 * bằng tay, và cả ba đọc chỉ số khác nhau: `[0]`/`[1]`, `[0]`/`[3]`,
 * `[0]`/`[length-1]`. Chúng chưa từng mâu thuẫn chỉ vì `slots.ts` luôn cho
 * ôn tập đúng 2 buổi và kiểm tra đúng 4 — một sự trùng hợp của DỮ LIỆU, không
 * phải một bảo đảm của KIỂU. Dùng `lessons[0]` và `lessons[length-1]` (không
 * phải chỉ số cố định) để hàm này đúng với mọi độ dài mảng, kể cả một phần
 * tử (bổ túc thường chỉ có một buổi trong `scope`).
 *
 * Dấu gạch ngang giữa hai số là EN DASH — U+2013 (–), KHÔNG phải dấu gạch nối
 * thường (-, U+002D). Playwright so khớp nguyên văn chuỗi này; đổi sang dấu
 * gạch nối sẽ làm kịch bản e2e trượt một cách âm thầm (không lỗi biên dịch,
 * không lỗi kiểu — chỉ so chuỗi sai).
 */
export function assessmentLabel(kind: AssessmentKind, lessons: readonly number[]): string {
  const range =
    lessons.length > 1 ? `${lessons[0]}–${lessons[lessons.length - 1]}` : `${lessons[0]}`;
  return `${KIND_LABEL[kind]} buổi ${range}`;
}
