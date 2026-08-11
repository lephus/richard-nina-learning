/**
 * Trạng thái của 30 hoạt động (10 nhóm × 3) suy TỪ `assessments`, không lưu
 * song song ở đâu cả.
 *
 * Trước lát 2a, trạng thái buổi nằm ở cột `user_lesson_progress.status` —
 * một bản sao thứ hai của cùng một sự thật, với default `'locked'` khiến một
 * INSERT thiếu tường minh khoá nhầm buổi đang mở. Bảng đó đã bị xoá; đây là
 * nguồn duy nhất.
 *
 * Hàm thuần: không I/O, không React, không database. Trang chỉ hiển thị những
 * gì hàm này trả ra.
 */

import { lessonsOf, TOTAL_GROUPS } from "./groups";

export type AssessmentType = "lesson" | "review" | "remedial" | "grammar";
export type AssessmentStatus = "in_progress" | "submitted";

export interface AssessmentRow {
  id: number;
  type: AssessmentType;
  scope: number[];
  status: AssessmentStatus;
  passed: boolean | null;
  score: number | null;
  parentId: number | null;
}

export interface CursorRow {
  lessonOrdinal: number;
  wordIndex: number;
}

/** Việc phải làm tiếp cho một lần thử đã trượt. */
export type RemedialState =
  | { kind: "can-lam" }
  | { kind: "dang-lam"; assessmentId: number }
  | { kind: "da-dat"; assessmentId: number };

export type ActivityState =
  | { kind: "chua-lam" }
  | { kind: "dang-hoc"; wordIndex: number }
  | { kind: "dang-thi"; assessmentId: number }
  | { kind: "dat"; score: number; assessmentId: number }
  | { kind: "chua-dat"; score: number; assessmentId: number; remedial: RemedialState };

export interface GroupState {
  group: number;
  lessons: [number, number];
  /** [buổi A, buổi B, ôn tập] — thứ tự này cố định và trang `/vocab` dựa vào nó. */
  activities: [ActivityState, ActivityState, ActivityState];
}

export interface NextActivity {
  group: number;
  index: 0 | 1 | 2;
  /** `null` với ô ôn tập — nó không thuộc buổi nào. */
  lessonOrdinal: number | null;
}

/** Hai phạm vi bằng nhau khi cùng độ dài VÀ cùng thứ tự. */
function sameScope(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Đi hết chuỗi bổ túc mọc ra từ MỘT lần thử đã trượt.
 *
 * Chuỗi có thể dài hơn một mắt: trượt bài chính → bổ túc → trượt bổ túc → bổ
 * túc tiếp. Duyệt theo `id` tăng dần là đủ và đúng, vì một bài bổ túc luôn
 * được tạo SAU bài cha nên `id` của nó luôn lớn hơn.
 *
 * Chỉ nhận bổ túc nối được vào đúng lần thử này qua `parentId` — không lọc
 * theo `scope`. Trượt cùng một bài hai lần sinh ra hai chuỗi riêng biệt cùng
 * `scope`; nếu lọc theo `scope` thì bổ túc của lần trượt CŨ sẽ hiện lên như
 * việc phải làm cho lần trượt MỚI.
 */
function remedialStateFor(
  attemptId: number,
  assessments: readonly AssessmentRow[],
): RemedialState {
  const chain = new Set<number>([attemptId]);
  let latest: AssessmentRow | null = null;

  for (const r of [...assessments].sort((a, b) => a.id - b.id)) {
    if (r.type !== "remedial" || r.parentId === null) continue;
    if (!chain.has(r.parentId)) continue;
    chain.add(r.id);
    latest = r;
  }

  if (latest === null) return { kind: "can-lam" };
  if (latest.status === "in_progress") return { kind: "dang-lam", assessmentId: latest.id };
  // `passed !== true` tính là chưa đạt — fail closed, cùng cách mọi nơi khác
  // trong tệp này đọc cột đó.
  return latest.passed === true
    ? { kind: "da-dat", assessmentId: latest.id }
    : { kind: "can-lam" };
}

function activityState(
  type: "lesson" | "review",
  scope: readonly number[],
  assessments: readonly AssessmentRow[],
  cursors: readonly CursorRow[],
): ActivityState {
  const attempts = assessments
    .filter((r) => r.type === type && sameScope(r.scope, scope))
    .sort((a, b) => a.id - b.id);
  const latest = attempts.at(-1) ?? null;

  if (latest === null) {
    // Chỉ ô BUỔI mới có pha học. Ô ôn tập đi thẳng từ "chưa làm" sang "đang
    // thi" — nó không có 30 thẻ nào để duyệt, nên không có `lesson_cursor`.
    if (type === "lesson") {
      const cursor = cursors.find((c) => c.lessonOrdinal === scope[0]);
      if (cursor !== undefined && cursor.wordIndex > 0) {
        return { kind: "dang-hoc", wordIndex: cursor.wordIndex };
      }
    }
    return { kind: "chua-lam" };
  }

  if (latest.status === "in_progress") return { kind: "dang-thi", assessmentId: latest.id };

  const score = latest.score ?? 0;
  if (latest.passed === true) return { kind: "dat", score, assessmentId: latest.id };
  return {
    kind: "chua-dat",
    score,
    assessmentId: latest.id,
    remedial: remedialStateFor(latest.id, assessments),
  };
}

export function groupStates(
  assessments: readonly AssessmentRow[],
  cursors: readonly CursorRow[],
): GroupState[] {
  const out: GroupState[] = [];
  for (let group = 1; group <= TOTAL_GROUPS; group++) {
    const lessons = lessonsOf(group);
    out.push({
      group,
      lessons,
      activities: [
        activityState("lesson", [lessons[0]], assessments, cursors),
        activityState("lesson", [lessons[1]], assessments, cursors),
        activityState("review", lessons, assessments, cursors),
      ],
    });
  }
  return out;
}

export function groupDone(state: GroupState): boolean {
  return state.activities.every((a) => a.kind === "dat");
}

/**
 * Hoạt động chưa đạt có `(nhóm, thứ tự trong nhóm)` nhỏ nhất — dòng tắt
 * "Tiếp tục" trên dashboard.
 *
 * Đây là GỢI Ý, không phải luật: 10 nhóm vẫn mở hết, người học bấm thẳng vào
 * nhóm 7 lúc nào cũng được.
 */
export function nextActivity(states: readonly GroupState[]): NextActivity | null {
  for (const s of states) {
    for (let index = 0; index < s.activities.length; index++) {
      if (s.activities[index]!.kind === "dat") continue;
      return {
        group: s.group,
        index: index as 0 | 1 | 2,
        lessonOrdinal: index === 2 ? null : s.lessons[index as 0 | 1],
      };
    }
  }
  return null;
}

/** Một dòng `assessments` (snake_case) → `AssessmentRow`. */
export function toAssessmentRow(row: {
  id: number;
  type: string;
  scope: number[];
  status: string;
  passed: boolean | null;
  score: number | null;
  parent_id: number | null;
}): AssessmentRow {
  return {
    id: row.id,
    type: row.type as AssessmentType,
    scope: row.scope,
    status: row.status as AssessmentStatus,
    passed: row.passed,
    score: row.score,
    parentId: row.parent_id,
  };
}

/**
 * Một dòng `lesson_cursor` → `CursorRow`.
 *
 * `lesson_cursor` khoá theo `lesson_id` (khoá chính của bảng `lessons`), còn
 * mọi thứ trong tệp này nói bằng `ordinal` (1..20). Người gọi truyền vào bảng
 * tra — trang đã đọc `lessons` rồi nên không tốn thêm truy vấn nào.
 */
export function toCursorRow(
  row: { lesson_id: number; word_index: number },
  ordinalById: ReadonlyMap<number, number>,
): CursorRow | null {
  const lessonOrdinal = ordinalById.get(row.lesson_id);
  // Một dòng con trỏ trỏ tới buổi không còn tồn tại thì bỏ qua, không dựng ra
  // một `CursorRow` với ordinal `undefined` rồi so sánh trượt ở mọi chỗ.
  return lessonOrdinal === undefined ? null : { lessonOrdinal, wordIndex: row.word_index };
}
