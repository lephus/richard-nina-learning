import { describe, expect, it } from "vitest";
import { nextStep } from "@/lib/assessment/next-step";
import type { AssessmentRow, LessonDone } from "@/lib/assessment/next-step";

const NOW = new Date("2026-08-08T10:00:00Z");
const LATER = new Date("2026-08-08T11:00:00Z").toISOString();
const EARLIER = new Date("2026-08-08T09:00:00Z").toISOString();

const lessons = (doneUpTo: number): LessonDone[] =>
  Array.from({ length: 20 }, (_, i) => ({ ordinal: i + 1, completed: i + 1 <= doneUpTo }));

const review = (over: Partial<AssessmentRow> = {}): AssessmentRow => ({
  id: 1, type: "review", scope: [1, 2], status: "submitted",
  passed: true, expiresAt: LATER, parentId: null, ...over,
});

describe("nextStep", () => {
  it("chưa học gì thì bước đầu là buổi 1", () => {
    expect(nextStep(lessons(0), [], NOW)).toEqual({
      slotIndex: 0, action: { kind: "lesson", lesson: 1 },
    });
  });

  it("xong buổi 1 thì sang buổi 2", () => {
    expect(nextStep(lessons(1), [], NOW).action).toEqual({ kind: "lesson", lesson: 2 });
  });

  it("xong buổi 1 và 2 thì tới bài ôn tập, chưa có lần thử nào", () => {
    expect(nextStep(lessons(2), [], NOW)).toEqual({
      slotIndex: 2,
      action: { kind: "start", type: "review", scope: [1, 2], parentId: null },
    });
  });

  it("bài ôn tập đang dở và còn hạn thì tiếp tục", () => {
    const a = review({ id: 7, status: "in_progress", passed: null, expiresAt: LATER });
    expect(nextStep(lessons(2), [a], NOW).action).toEqual({ kind: "resume", assessmentId: 7 });
  });

  it("bài ôn tập đang dở nhưng quá hạn thì đóng nó lại", () => {
    const a = review({ id: 8, status: "in_progress", passed: null, expiresAt: EARLIER });
    expect(nextStep(lessons(2), [a], NOW).action).toEqual({
      kind: "close-expired", assessmentId: 8,
    });
  });

  it("ôn tập đã qua thì sang buổi 3", () => {
    expect(nextStep(lessons(2), [review()], NOW).action).toEqual({ kind: "lesson", lesson: 3 });
  });

  it("ôn tập trượt và chưa có bổ túc thì làm bổ túc, trỏ về lần thử đó", () => {
    const a = review({ id: 9, passed: false });
    expect(nextStep(lessons(2), [a], NOW).action).toEqual({
      kind: "start", type: "remedial", scope: [1, 2], parentId: 9,
    });
  });

  it("bổ túc đã qua thì làm lại chính bài đã trượt, đề mới", () => {
    const failed = review({ id: 9, passed: false });
    const rem: AssessmentRow = {
      id: 10, type: "remedial", scope: [1, 2], status: "submitted",
      passed: true, expiresAt: LATER, parentId: 9,
    };
    expect(nextStep(lessons(2), [failed, rem], NOW).action).toEqual({
      kind: "start", type: "review", scope: [1, 2], parentId: null,
    });
  });

  it("bổ túc cũng trượt thì làm lại chính bài bổ túc, không sinh tầng mới", () => {
    const failed = review({ id: 9, passed: false });
    const rem: AssessmentRow = {
      id: 10, type: "remedial", scope: [1, 2], status: "submitted",
      passed: false, expiresAt: LATER, parentId: 9,
    };
    expect(nextStep(lessons(2), [failed, rem], NOW).action).toEqual({
      kind: "start", type: "remedial", scope: [1, 2], parentId: 9,
    });
  });

  it("làm lại rồi qua thì mới sang buổi 3", () => {
    const failed = review({ id: 9, passed: false });
    const rem: AssessmentRow = {
      id: 10, type: "remedial", scope: [1, 2], status: "submitted",
      passed: true, expiresAt: LATER, parentId: 9,
    };
    const retry = review({ id: 11, passed: true });
    expect(nextStep(lessons(2), [failed, rem, retry], NOW).action).toEqual({
      kind: "lesson", lesson: 3,
    });
  });

  it("cùng ba dòng trên nhưng thứ tự mảng đảo ngược vẫn ra kết quả như nhau (id lớn nhất, không phải phần tử cuối)", () => {
    const failed = review({ id: 9, passed: false });
    const rem: AssessmentRow = {
      id: 10, type: "remedial", scope: [1, 2], status: "submitted",
      passed: true, expiresAt: LATER, parentId: 9,
    };
    const retry = review({ id: 11, passed: true });
    expect(nextStep(lessons(2), [retry, rem, failed], NOW).action).toEqual({
      kind: "lesson", lesson: 3,
    });
  });

  it("bổ túc đang dở và còn hạn thì tiếp tục bổ túc đó", () => {
    const failed = review({ id: 9, passed: false });
    const rem: AssessmentRow = {
      id: 10, type: "remedial", scope: [1, 2], status: "in_progress",
      passed: null, expiresAt: LATER, parentId: 9,
    };
    expect(nextStep(lessons(2), [failed, rem], NOW).action).toEqual({
      kind: "resume", assessmentId: 10,
    });
  });

  it("bổ túc đang dở nhưng quá hạn thì đóng nó lại", () => {
    const failed = review({ id: 9, passed: false });
    const rem: AssessmentRow = {
      id: 10, type: "remedial", scope: [1, 2], status: "in_progress",
      passed: null, expiresAt: EARLIER, parentId: 9,
    };
    expect(nextStep(lessons(2), [failed, rem], NOW).action).toEqual({
      kind: "close-expired", assessmentId: 10,
    });
  });

  it("bổ túc đã bị đóng do quá hạn mà chưa từng nộp (passed null) thì vẫn phải làm lại bổ túc, không được nhảy thẳng về bài gốc", () => {
    const failed = review({ id: 9, passed: false });
    const rem: AssessmentRow = {
      id: 10, type: "remedial", scope: [1, 2], status: "expired",
      passed: null, expiresAt: EARLIER, parentId: 9,
    };
    expect(nextStep(lessons(2), [failed, rem], NOW).action).toEqual({
      kind: "start", type: "remedial", scope: [1, 2], parentId: 9,
    });
  });

  it("xong hết 20 buổi và mọi bài đánh giá thì trả về done", () => {
    const all: AssessmentRow[] = [];
    let id = 100;
    for (const scope of [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20]]) {
      all.push({ id: id++, type: "review", scope, status: "submitted", passed: true, expiresAt: LATER, parentId: null });
    }
    for (const scope of [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]) {
      all.push({ id: id++, type: "test", scope, status: "submitted", passed: true, expiresAt: LATER, parentId: null });
    }
    expect(nextStep(lessons(20), all, NOW)).toEqual({
      slotIndex: 34, action: { kind: "done" },
    });
  });

  it("lần thử gần nhất mới là lần được xét, không phải lần đầu", () => {
    const first = review({ id: 1, passed: false });
    const rem: AssessmentRow = {
      id: 2, type: "remedial", scope: [1, 2], status: "submitted",
      passed: true, expiresAt: LATER, parentId: 1,
    };
    const second = review({ id: 3, passed: true });
    expect(nextStep(lessons(2), [first, rem, second], NOW).action).toEqual({
      kind: "lesson", lesson: 3,
    });
  });
});
