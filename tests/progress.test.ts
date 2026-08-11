import { describe, expect, it } from "vitest";
import {
  groupStates, groupDone, nextActivity,
  toAssessmentRow, toCursorRow,
  type AssessmentRow, type CursorRow, type GroupState,
} from "@/lib/curriculum/progress";

function att(over: Partial<AssessmentRow> & Pick<AssessmentRow, "id" | "type" | "scope">): AssessmentRow {
  return { status: "submitted", passed: true, score: 90, parentId: null, ...over };
}

const NO_CURSOR: CursorRow[] = [];

function group1(assessments: AssessmentRow[], cursors: CursorRow[] = NO_CURSOR): GroupState {
  return groupStates(assessments, cursors)[0]!;
}

describe("groupStates — hình dạng", () => {
  it("luôn trả đúng 10 nhóm, mỗi nhóm 3 hoạt động", () => {
    const states = groupStates([], []);
    expect(states).toHaveLength(10);
    for (const s of states) expect(s.activities).toHaveLength(3);
  });

  it("nhóm 1 gồm buổi 1 và 2", () => {
    expect(groupStates([], [])[0]!.lessons).toEqual([1, 2]);
  });

  it("chưa có gì thì cả ba ô đều chưa làm", () => {
    const s = group1([]);
    expect(s.activities.map((a) => a.kind)).toEqual(["chua-lam", "chua-lam", "chua-lam"]);
  });
});

describe("ô buổi học", () => {
  it("có con trỏ > 0 mà chưa thi thì là đang học", () => {
    const s = group1([], [{ lessonOrdinal: 1, wordIndex: 6 }]);
    expect(s.activities[0]).toEqual({ kind: "dang-hoc", wordIndex: 6 });
  });

  it("con trỏ bằng 0 vẫn là chưa làm", () => {
    const s = group1([], [{ lessonOrdinal: 1, wordIndex: 0 }]);
    expect(s.activities[0]!.kind).toBe("chua-lam");
  });

  it("bài đang làm dở thắng con trỏ", () => {
    const s = group1(
      [att({ id: 5, type: "lesson", scope: [1], status: "in_progress", passed: null, score: null })],
      [{ lessonOrdinal: 1, wordIndex: 12 }],
    );
    expect(s.activities[0]).toEqual({ kind: "dang-thi", assessmentId: 5 });
  });

  it("đạt thì mang theo điểm", () => {
    const s = group1([att({ id: 5, type: "lesson", scope: [1], score: 93 })]);
    expect(s.activities[0]).toEqual({ kind: "dat", score: 93, assessmentId: 5 });
  });

  it("lần thử mới nhất quyết định, không phải lần đầu", () => {
    const s = group1([
      att({ id: 5, type: "lesson", scope: [1], passed: false, score: 60 }),
      att({ id: 9, type: "lesson", scope: [1], passed: true, score: 87 }),
    ]);
    expect(s.activities[0]!.kind).toBe("dat");
  });

  it("passed = null trên bài đã nộp tính là chưa đạt — fail closed", () => {
    const s = group1([att({ id: 5, type: "lesson", scope: [1], passed: null, score: 88 })]);
    expect(s.activities[0]!.kind).toBe("chua-dat");
  });

  it("buổi 2 đọc đúng scope của nó, không lẫn với buổi 1", () => {
    const s = group1([att({ id: 5, type: "lesson", scope: [1], score: 91 })]);
    expect(s.activities[0]!.kind).toBe("dat");
    expect(s.activities[1]!.kind).toBe("chua-lam");
  });
});

describe("ô ôn tập", () => {
  it("không bao giờ là đang học — nó không có pha học nào", () => {
    // Con trỏ của CẢ HAI buổi trong nhóm đều > 0 mà ô ôn tập vẫn phải chưa làm.
    const s = group1([], [
      { lessonOrdinal: 1, wordIndex: 20 },
      { lessonOrdinal: 2, wordIndex: 20 },
    ]);
    expect(s.activities[2]!.kind).toBe("chua-lam");
  });

  it("đọc scope hai buổi của nhóm", () => {
    const s = group1([att({ id: 7, type: "review", scope: [1, 2], score: 84 })]);
    expect(s.activities[2]).toEqual({ kind: "dat", score: 84, assessmentId: 7 });
  });

  it("scope lệch thứ tự không tính là cùng phạm vi", () => {
    const s = group1([att({ id: 7, type: "review", scope: [2, 1], score: 84 })]);
    expect(s.activities[2]!.kind).toBe("chua-lam");
  });
});

describe("chuỗi bổ túc", () => {
  const truot = att({ id: 10, type: "lesson", scope: [1], passed: false, score: 55 });

  it("trượt mà chưa có bổ túc → cần làm bổ túc", () => {
    const s = group1([truot]);
    expect(s.activities[0]).toMatchObject({ kind: "chua-dat", remedial: { kind: "can-lam" } });
  });

  it("bổ túc đang làm dở", () => {
    const s = group1([
      truot,
      att({ id: 11, type: "remedial", scope: [1], status: "in_progress", passed: null, score: null, parentId: 10 }),
    ]);
    expect(s.activities[0]).toMatchObject({ remedial: { kind: "dang-lam", assessmentId: 11 } });
  });

  it("bổ túc đã đạt → được làm lại bài chính", () => {
    const s = group1([truot, att({ id: 11, type: "remedial", scope: [1], parentId: 10 })]);
    expect(s.activities[0]).toMatchObject({ remedial: { kind: "da-dat", assessmentId: 11 } });
  });

  it("trượt bổ túc → lại cần bổ túc tiếp", () => {
    const s = group1([
      truot,
      att({ id: 11, type: "remedial", scope: [1], passed: false, score: 40, parentId: 10 }),
    ]);
    expect(s.activities[0]).toMatchObject({ remedial: { kind: "can-lam" } });
  });

  it("đi hết chuỗi bổ túc lồng nhau, lấy mắt xích cuối", () => {
    const s = group1([
      truot,
      att({ id: 11, type: "remedial", scope: [1], passed: false, score: 40, parentId: 10 }),
      att({ id: 12, type: "remedial", scope: [1], passed: true, score: 100, parentId: 11 }),
    ]);
    expect(s.activities[0]).toMatchObject({ remedial: { kind: "da-dat", assessmentId: 12 } });
  });

  it("bổ túc của lần trượt CŨ không dính vào lần trượt mới", () => {
    const s = group1([
      truot,
      att({ id: 11, type: "remedial", scope: [1], parentId: 10 }),
      att({ id: 20, type: "lesson", scope: [1], passed: false, score: 50 }),
    ]);
    expect(s.activities[0]).toMatchObject({
      assessmentId: 20,
      remedial: { kind: "can-lam" },
    });
  });
});

describe("groupDone và nextActivity", () => {
  const xong = (lessons: [number, number]): AssessmentRow[] => [
    att({ id: lessons[0] * 100, type: "lesson", scope: [lessons[0]] }),
    att({ id: lessons[1] * 100, type: "lesson", scope: [lessons[1]] }),
    att({ id: lessons[0] * 100 + 1, type: "review", scope: lessons }),
  ];

  it("groupDone chỉ đúng khi cả ba ô đều đạt", () => {
    expect(groupDone(group1(xong([1, 2])))).toBe(true);
    expect(groupDone(group1([att({ id: 1, type: "lesson", scope: [1] })]))).toBe(false);
  });

  it("nextActivity trỏ vào ô chưa đạt đầu tiên", () => {
    const states = groupStates([att({ id: 1, type: "lesson", scope: [1] })], []);
    expect(nextActivity(states)).toEqual({ group: 1, index: 1, lessonOrdinal: 2 });
  });

  it("nextActivity trỏ ô ôn tập khi hai buổi đã đạt", () => {
    const states = groupStates(
      [att({ id: 1, type: "lesson", scope: [1] }), att({ id: 2, type: "lesson", scope: [2] })],
      [],
    );
    expect(nextActivity(states)).toEqual({ group: 1, index: 2, lessonOrdinal: null });
  });

  it("nhảy sang nhóm sau khi nhóm trước đã xong hết", () => {
    const states = groupStates(xong([1, 2]), []);
    expect(nextActivity(states)).toEqual({ group: 2, index: 0, lessonOrdinal: 3 });
  });

  it("trả null khi xong toàn bộ chương trình", () => {
    const all: AssessmentRow[] = [];
    for (let g = 1; g <= 10; g++) all.push(...xong([g * 2 - 1, g * 2]));
    expect(nextActivity(groupStates(all, []))).toBeNull();
  });

  it("nextActivity chặn ô trượt, không nhảy qua", () => {
    // Buổi 1 trượt, Buổi 2 và Ôn tập đạt → ô trượt là nextActivity, không phải vì thiếu dữ liệu
    const assessments = [
      att({ id: 1, type: "lesson", scope: [1], passed: false, score: 50 }),
      att({ id: 2, type: "lesson", scope: [2], passed: true, score: 85 }),
      att({ id: 3, type: "review", scope: [1, 2], passed: true, score: 80 }),
    ];
    const states = groupStates(assessments, []);
    expect(nextActivity(states)).toEqual({ group: 1, index: 0, lessonOrdinal: 1 });
    expect(groupDone(group1(assessments))).toBe(false);
  });
});

describe("sắp xếp .sort() trong attempts và remedial chain", () => {
  it("lần thử mới nhất với assessments không sắp xếp theo id", () => {
    // Cấp riêng lẻ nhiều lần thử, TỨC TỰ NGƯỢC: đầu tiên id=9 (pass), rồi id=5 (fail)
    // Nếu mã không sort, sẽ lấy id=5 là "mới nhất" và trả chua-dat
    const s = group1([
      att({ id: 9, type: "lesson", scope: [1], passed: true, score: 87 }),
      att({ id: 5, type: "lesson", scope: [1], passed: false, score: 60 }),
    ]);
    expect(s.activities[0]!.kind).toBe("dat");
  });

  it("chuỗi bổ túc với assessments không sắp xếp theo id", () => {
    // Bổ túc id=12 trước, rồi bổ túc id=11, bài chính id=10
    // Nếu mã không sort, sẽ lấy id=12 là cuối cùng nhưng nó không ở trong chain
    // (chain chỉ có {10} → {11} → {12}, không có 12 nếu không đi qua 11)
    // Thực ra với cách xây chain, nó vẫn tìm được, nhưng thứ tự không sort sẽ cho kết quả sai
    const s = group1([
      att({ id: 10, type: "lesson", scope: [1], passed: false, score: 55 }),
      att({ id: 12, type: "remedial", scope: [1], passed: true, score: 100, parentId: 11 }),
      att({ id: 11, type: "remedial", scope: [1], passed: false, score: 40, parentId: 10 }),
    ]);
    // Đúng là: chain = {10} → {11} (id=11 có parentId=10) → {12} (id=12 có parentId=11)
    // Với sort: đi qua id=11 trước, add vào chain → chain = {10, 11}
    // Rồi id=12, parentId=11 ∈ chain → add → chain = {10, 11, 12}
    // latest = id=12, passed=true → "da-dat"
    // Không sort: đi qua id=12 trước, parentId=11 ∉ chain (chain = {10}) → skip
    // Rồi id=11, parentId=10 ∈ chain → add → chain = {10, 11}
    // latest = id=11, passed=false → "can-lam"
    expect(s.activities[0]).toMatchObject({ remedial: { kind: "da-dat", assessmentId: 12 } });
  });
});

describe("toAssessmentRow và toCursorRow", () => {
  it("toAssessmentRow chuyển snake_case sang camelCase đúng", () => {
    const row = {
      id: 42,
      type: "lesson",
      scope: [1, 2],
      status: "submitted",
      passed: true,
      score: 88,
      parent_id: null,
    };
    const result = toAssessmentRow(row);
    expect(result).toEqual({
      id: 42,
      type: "lesson",
      scope: [1, 2],
      status: "submitted",
      passed: true,
      score: 88,
      parentId: null,
    });
  });

  it("toAssessmentRow với parent_id khác null", () => {
    const row = {
      id: 11,
      type: "remedial",
      scope: [1],
      status: "in_progress",
      passed: null,
      score: null,
      parent_id: 10,
    };
    expect(toAssessmentRow(row).parentId).toBe(10);
  });

  it("toCursorRow tra được lesson_id trong bảng", () => {
    const ordinalById = new Map([[5, 1], [6, 2]]);
    const row = { lesson_id: 5, word_index: 12 };
    const result = toCursorRow(row, ordinalById);
    expect(result).toEqual({ lessonOrdinal: 1, wordIndex: 12 });
  });

  it("toCursorRow trả null khi lesson_id không trong bảng", () => {
    const ordinalById = new Map([[5, 1], [6, 2]]);
    const row = { lesson_id: 999, word_index: 12 };
    const result = toCursorRow(row, ordinalById);
    expect(result).toBeNull();
  });
});
