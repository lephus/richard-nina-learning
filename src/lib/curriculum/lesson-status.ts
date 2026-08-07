/** Khớp enum lesson_status trong supabase/migrations/0003_user_state.sql:7 */
export type LessonStatus = "locked" | "available" | "in_progress" | "completed";

export interface LessonRow {
  id: number;
  ordinal: number;
}

export interface ProgressRow {
  lesson_id: number;
  status: LessonStatus;
}

/**
 * Tính trạng thái hiển thị của từng buổi.
 *
 * Lúc mới đăng ký, user_lesson_progress RỖNG — không phải 20 dòng 'locked'.
 * Vì vậy trạng thái phải suy ra, không đọc thẳng từ bảng.
 *
 * Dòng có thật trong bảng luôn thắng luật suy diễn: nếu người học đang dở
 * buổi 5 mà buổi 4 chưa xong, buổi 5 vẫn 'in_progress'. Tự ý khoá lại một
 * buổi đang học dở tệ hơn nhiều so với việc để lộ một dòng dữ liệu bất thường.
 *
 * Buổi n suy từ trạng thái ĐÃ TÍNH của buổi n−1, không phải từ dòng thô, nên
 * chuỗi khoá lan đúng qua những buổi chưa có dòng nào.
 */
export function lessonStatuses(
  lessons: LessonRow[],
  progressRows: ProgressRow[],
): Map<number, LessonStatus> {
  const stored = new Map(progressRows.map((r) => [r.lesson_id, r.status]));
  const ordered = [...lessons].sort((a, b) => a.ordinal - b.ordinal);

  const out = new Map<number, LessonStatus>();
  let previous: LessonStatus | null = null;

  for (const lesson of ordered) {
    const status: LessonStatus =
      stored.get(lesson.id) ??
      (previous === null || previous === "completed" ? "available" : "locked");
    out.set(lesson.id, status);
    previous = status;
  }

  return out;
}
