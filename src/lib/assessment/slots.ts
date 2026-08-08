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
