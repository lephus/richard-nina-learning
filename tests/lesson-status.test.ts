import { describe, expect, it } from "vitest";
import {
  lessonStatuses,
  type LessonRow,
  type ProgressRow,
} from "@/lib/curriculum/lesson-status";

const twentyLessons: LessonRow[] = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  ordinal: i + 1,
}));

describe("lessonStatuses", () => {
  it("bảng tiến độ rỗng: chỉ buổi 1 mở, phần còn lại khoá", () => {
    const s = lessonStatuses(twentyLessons, []);
    expect(s.get(1)).toBe("available");
    expect(s.get(2)).toBe("locked");
    expect(s.get(20)).toBe("locked");
    expect(s.size).toBe(20);
  });

  it("xong buổi 1 thì buổi 2 mở, buổi 3 vẫn khoá", () => {
    const progress: ProgressRow[] = [{ lesson_id: 1, status: "completed" }];
    const s = lessonStatuses(twentyLessons, progress);
    expect(s.get(2)).toBe("available");
    expect(s.get(3)).toBe("locked");
  });

  it("dòng trong bảng thắng luật suy diễn, không tự khoá lại buổi đang học dở", () => {
    const progress: ProgressRow[] = [{ lesson_id: 5, status: "in_progress" }];
    const s = lessonStatuses(twentyLessons, progress);
    expect(s.get(4)).toBe("locked");
    expect(s.get(5)).toBe("in_progress");
  });

  it("buổi sau một buổi đang học dở thì vẫn khoá", () => {
    const progress: ProgressRow[] = [
      { lesson_id: 1, status: "completed" },
      { lesson_id: 2, status: "in_progress" },
    ];
    const s = lessonStatuses(twentyLessons, progress);
    expect(s.get(3)).toBe("locked");
  });

  it("chuỗi mở khoá lan qua nhiều buổi liên tiếp", () => {
    const progress: ProgressRow[] = [
      { lesson_id: 1, status: "completed" },
      { lesson_id: 2, status: "completed" },
      { lesson_id: 3, status: "completed" },
    ];
    const s = lessonStatuses(twentyLessons, progress);
    expect(s.get(4)).toBe("available");
    expect(s.get(5)).toBe("locked");
  });

  it("lessons truyền vào lộn xộn vẫn tính đúng theo ordinal", () => {
    const shuffled: LessonRow[] = [
      { id: 3, ordinal: 3 },
      { id: 1, ordinal: 1 },
      { id: 2, ordinal: 2 },
    ];
    const s = lessonStatuses(shuffled, [{ lesson_id: 1, status: "completed" }]);
    expect(s.get(1)).toBe("completed");
    expect(s.get(2)).toBe("available");
    expect(s.get(3)).toBe("locked");
  });
});
