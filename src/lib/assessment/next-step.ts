import { slotAt, TOTAL_SLOTS, type Slot } from "./slots";

export type AssessmentType = "review" | "test" | "remedial";
export type AssessmentStatus = "in_progress" | "submitted" | "expired";

export interface AssessmentRow {
  id: number;
  type: AssessmentType;
  scope: number[];
  status: AssessmentStatus;
  passed: boolean | null;
  /** ISO 8601. Nguồn sự thật duy nhất về thời hạn — xem spec mục 6.2. */
  expiresAt: string;
  parentId: number | null;
}

export interface LessonDone {
  ordinal: number;
  completed: boolean;
}

export type Action =
  | { kind: "lesson"; lesson: number }
  | { kind: "start"; type: AssessmentType; scope: number[]; parentId: number | null }
  | { kind: "resume"; assessmentId: number }
  | { kind: "close-expired"; assessmentId: number }
  | { kind: "done" };

// Xuất công khai (Task 7 review): dashboard/page.tsx cần đúng phép so khớp
// scope và đúng luật "lần thử mới nhất thắng" để dòng hiển thị và nút "Học
// tiếp" đọc CÙNG một kết quả — một bản sao thứ hai ở page.tsx từng khiến hai
// nơi tính ra hai trạng thái khác nhau cho cùng một slot. `nextStep` có bộ
// test bảng đầy đủ; import thẳng từ đây thay vì viết lại để bản đó vẫn là
// bản DUY NHẤT chịu kiểm thử.
export const sameScope = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Lần thử gần nhất khớp điều kiện (id lớn nhất) — không phụ thuộc thứ tự mảng vào. */
export function latest(
  rows: readonly AssessmentRow[],
  match: (r: AssessmentRow) => boolean,
): AssessmentRow | null {
  let found: AssessmentRow | null = null;
  for (const r of rows) if (match(r) && (found === null || r.id > found.id)) found = r;
  return found;
}

/**
 * Bước kế tiếp của người học trên chuỗi 35 hoạt động.
 *
 * `now` là tham số chứ không đọc Date.now() bên trong — để test kiểm được nhánh
 * quá hạn mà không phải chờ, và để mọi so sánh thời gian có một nguồn duy nhất.
 *
 * Bổ túc và bài làm lại KHÔNG chiếm slot riêng: chúng là nhánh chèn động vào
 * slot đang đứng. Chuỗi 35 slot không đổi; chỉ đường đi qua nó dài ra khi trượt.
 */
export function nextStep(
  lessons: readonly LessonDone[],
  assessments: readonly AssessmentRow[],
  now: Date,
): { slotIndex: number; action: Action } {
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const slot: Slot = slotAt(i);

    if (slot.kind === "lesson") {
      const ordinal = slot.lessons[0]!;
      const done = lessons.find((l) => l.ordinal === ordinal)?.completed ?? false;
      if (!done) return { slotIndex: i, action: { kind: "lesson", lesson: ordinal } };
      continue;
    }

    const attempt = latest(
      assessments,
      (r) => r.type === slot.kind && sameScope(r.scope, slot.lessons),
    );

    if (attempt === null) {
      return {
        slotIndex: i,
        action: { kind: "start", type: slot.kind, scope: slot.lessons, parentId: null },
      };
    }

    if (attempt.status === "in_progress") {
      const expired = new Date(attempt.expiresAt).getTime() <= now.getTime();
      return {
        slotIndex: i,
        action: expired
          ? { kind: "close-expired", assessmentId: attempt.id }
          : { kind: "resume", assessmentId: attempt.id },
      };
    }

    if (attempt.passed === true) continue;

    // Trượt. Xét bài bổ túc gần nhất trỏ về chính lần thử này.
    const rem = latest(
      assessments,
      (r) => r.type === "remedial" && r.parentId === attempt.id,
    );

    if (rem !== null && rem.status === "in_progress") {
      const expired = new Date(rem.expiresAt).getTime() <= now.getTime();
      return {
        slotIndex: i,
        action: expired
          ? { kind: "close-expired", assessmentId: rem.id }
          : { kind: "resume", assessmentId: rem.id },
      };
    }

    if (rem === null || rem.passed !== true) {
      // Chưa bổ túc, hoặc bổ túc chưa đạt — kể cả bị đóng do quá hạn mà chưa
      // từng nộp (status "expired", passed null: coi như chưa đạt, fail-closed
      // giống hệt nhánh lần thử gốc ở trên) → làm (lại) bổ túc. Nhánh PHẲNG:
      // parentId vẫn trỏ lần thử gốc, không sinh bổ túc-của-bổ túc.
      return {
        slotIndex: i,
        action: { kind: "start", type: "remedial", scope: slot.lessons, parentId: attempt.id },
      };
    }

    // Bổ túc đã nộp và đạt → làm lại chính bài đã trượt, đề mới.
    return {
      slotIndex: i,
      action: { kind: "start", type: slot.kind, scope: slot.lessons, parentId: null },
    };
  }

  return { slotIndex: TOTAL_SLOTS - 1, action: { kind: "done" } };
}
