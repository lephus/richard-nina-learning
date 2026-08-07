import { describe, expect, it } from "vitest";
import { masteryDelta, MASTERY_THRESHOLD } from "@/lib/mastery/apply";

describe("masteryDelta", () => {
  it("lần đầu gặp từ và trả lời đúng", () => {
    expect(masteryDelta(null, true)).toEqual({
      correctCount: 1,
      wrongCount: 0,
      mastered: false,
    });
  });

  it("lần đầu gặp từ và trả lời sai", () => {
    expect(masteryDelta(null, false)).toEqual({
      correctCount: 0,
      wrongCount: 1,
      mastered: false,
    });
  });

  it("đúng đủ ngưỡng thì bật mastered", () => {
    const before = { correctCount: 2, wrongCount: 0, mastered: false };
    expect(masteryDelta(before, true)).toEqual({
      correctCount: 3,
      wrongCount: 0,
      mastered: true,
    });
    expect(MASTERY_THRESHOLD).toBe(3);
  });

  it("sai nhiều thì chưa thuộc dù đúng cũng nhiều", () => {
    const before = { correctCount: 4, wrongCount: 3, mastered: false };
    expect(masteryDelta(before, true).mastered).toBe(false); // 5 - 3 = 2 < 3
  });

  it("đã thuộc rồi mà sai thì tắt lại", () => {
    const before = { correctCount: 3, wrongCount: 0, mastered: true };
    expect(masteryDelta(before, false)).toEqual({
      correctCount: 3,
      wrongCount: 1,
      mastered: false, // 3 - 1 = 2 < 3
    });
  });
});
