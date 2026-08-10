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

  it("Map trả về khoá theo lessons.id, KHÔNG phải ordinal, khi hai giá trị lệch nhau", () => {
    // bigserial của lessons.id không lùi lại sau re-seed (xem
    // scripts/phase0/05-seed.ts) nên id thật sự lệch ordinal trên production.
    // Mọi fixture khác trong file này có id === ordinal, nên chúng không thể
    // phát hiện việc lỡ đổi lessonStatuses() sang khoá theo ordinal.
    const lessons: LessonRow[] = [
      { id: 21, ordinal: 1 },
      { id: 22, ordinal: 2 },
      { id: 23, ordinal: 3 },
    ];
    const progress: ProgressRow[] = [{ lesson_id: 21, status: "completed" }];
    const s = lessonStatuses(lessons, progress);

    expect(s.get(21)).toBe("completed");
    expect(s.get(22)).toBe("available");
    expect(s.get(23)).toBe("locked");
    expect(s.has(1)).toBe(false);
    expect(s.size).toBe(3);
  });
});
