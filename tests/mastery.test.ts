import { describe, expect, it } from "vitest";
import { masteryDelta, MASTERY_THRESHOLD } from "@/lib/mastery/apply";

describe("masteryDelta", () => {
  it("đúng 1 lần chưa đủ thuộc — cấu trúc mới chạm mỗi từ 2 lần", () => {
    expect(masteryDelta(null, true)).toEqual({
      correctCount: 1, wrongCount: 0, mastered: false,
    });
  });

  it("lần đầu gặp từ và trả lời sai", () => {
    expect(masteryDelta(null, false)).toEqual({
      correctCount: 0,
      wrongCount: 1,
      mastered: false,
    });
  });

  it("đúng 2 lần liên tiếp thì thuộc — bài buổi và bài ôn tập nhóm", () => {
    const sau1 = masteryDelta(null, true);
    expect(masteryDelta(sau1, true).mastered).toBe(true);
  });

  it("đúng 2 sai 1 thì chưa thuộc — hiệu số mới là thứ được đếm", () => {
    let m = masteryDelta(null, true);
    m = masteryDelta(m, false);
    m = masteryDelta(m, true);
    expect(m).toEqual({ correctCount: 2, wrongCount: 1, mastered: false });
  });

  it("ngưỡng đúng bằng 2", () => {
    expect(MASTERY_THRESHOLD).toBe(2);
  });
});
