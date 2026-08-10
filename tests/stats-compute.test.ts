import { describe, expect, it } from "vitest";
import {
  rhythm,
  scoreSeries,
  topWrongWords,
  vocabProgress,
  WEEKLY_TARGET,
  TOP_WRONG_LIMIT,
} from "@/lib/stats/compute";
import type { AssessmentLite, MasteryLite, WordLite } from "@/lib/stats/compute";

// Bước 2 (brief): hai test ranh giới tuần này là LÝ DO cả module compute.ts
// tồn tại thay vì vài .filter() rải rác — nếu ai đó gộp tuần theo UTC thay vì
// giờ Việt Nam, chính hai test này sẽ đỏ trước tiên.
describe("rhythm — ranh giới tuần giờ Việt Nam", () => {
  it("23h Chủ nhật giờ VN và 00h30 thứ Hai giờ VN là HAI tuần khác nhau", () => {
    // 2026-08-09 là Chủ nhật. 23:00 VN = 16:00Z cùng ngày.
    // 2026-08-10 00:30 VN = 2026-08-09 17:30Z — vẫn Chủ nhật theo UTC.
    const now = new Date("2026-08-10T01:00:00Z");
    const r = rhythm(["2026-08-09T16:00:00Z", "2026-08-09T17:30:00Z"], now);
    expect(r.thisWeekSessions).toBe(1); // chỉ sự kiện 00h30 thứ Hai thuộc tuần này
  });

  it("hai buổi cùng một tuần VN đếm là hai", () => {
    const now = new Date("2026-08-12T03:00:00Z");
    const r = rhythm(["2026-08-10T01:00:00Z", "2026-08-12T02:00:00Z"], now);
    expect(r.thisWeekSessions).toBe(2);
  });
});

describe("rhythm — chuỗi tuần liên tiếp", () => {
  it("chuỗi bị đứt một tuần ở giữa thì chỉ đếm đoạn liền kề gần nhất", () => {
    // Tuần hiện tại: chứa 2026-08-10 (thứ Hai). Có học tuần này + tuần trước
    // (03-08) nhưng tuần trước-trước (27-07) THIẾU, và còn một tuần xa hơn
    // (20-07) có học — đoạn đó không được cộng vào vì đã đứt quãng.
    const now = new Date("2026-08-10T03:00:00Z");
    const eventTimes = [
      "2026-08-10T03:00:00Z", // tuần hiện tại
      "2026-08-04T03:00:00Z", // tuần trước — liền kề
      "2026-07-21T03:00:00Z", // hai tuần trước tuần trước — bị đứt quãng, không tính
    ];
    const r = rhythm(eventTimes, now);
    expect(r.streakWeeks).toBe(2);
  });

  it("tuần này rỗng nhưng tuần trước có thì chuỗi vẫn tính, neo ở tuần trước", () => {
    // now rơi vào tuần chưa có sự kiện nào; tuần liền trước có 1 sự kiện.
    const now = new Date("2026-08-10T03:00:00Z"); // thứ Hai, tuần chưa học
    const eventTimes = ["2026-08-04T03:00:00Z"]; // thứ Ba tuần trước
    const r = rhythm(eventTimes, now);
    expect(r.streakWeeks).toBe(1);
    expect(r.thisWeekSessions).toBe(0);
  });

  it("cả tuần này lẫn tuần trước đều rỗng thì chuỗi là 0", () => {
    const now = new Date("2026-08-10T03:00:00Z");
    const eventTimes = ["2026-07-01T03:00:00Z"]; // rất xa, không liền kề
    const r = rhythm(eventTimes, now);
    expect(r.streakWeeks).toBe(0);
    expect(r.thisWeekSessions).toBe(0);
  });

  it("danh sách sự kiện rỗng — người vừa đăng ký, chưa học buổi nào", () => {
    const now = new Date("2026-08-10T03:00:00Z");
    const r = rhythm([], now);
    expect(r).toEqual({ streakWeeks: 0, thisWeekSessions: 0, target: WEEKLY_TARGET });
  });
});

describe("vocabProgress", () => {
  it("đếm mastered trực tiếp từ cột mastered, không suy lại từ correct - wrong", () => {
    const rows: MasteryLite[] = [
      { wordId: 1, correctCount: 5, wrongCount: 1, mastered: true },
      { wordId: 2, correctCount: 1, wrongCount: 0, mastered: false },
      // correctCount - wrongCount = 3 nhưng mastered = false: nếu hàm suy lại
      // từ hiệu số thay vì đọc cột, test này sẽ phát hiện ra ngay.
      { wordId: 3, correctCount: 4, wrongCount: 1, mastered: false },
    ];
    expect(vocabProgress(rows, 605)).toEqual({ mastered: 1, seen: 3, total: 605 });
  });

  it("danh sách rỗng — người vừa đăng ký, chưa gặp từ nào", () => {
    expect(vocabProgress([], 605)).toEqual({ mastered: 0, seen: 0, total: 605 });
  });
});

describe("scoreSeries", () => {
  const row = (over: Partial<AssessmentLite> = {}): AssessmentLite => ({
    id: 1,
    type: "review",
    scope: [1, 2],
    score: 80,
    passed: true,
    submittedAt: "2026-08-01T00:00:00Z",
    ...over,
  });

  it("sắp đúng thứ tự thời gian kể cả khi mảng vào đảo lộn", () => {
    const rows: AssessmentLite[] = [
      row({ id: 3, submittedAt: "2026-08-03T00:00:00Z" }),
      row({ id: 1, submittedAt: "2026-08-01T00:00:00Z" }),
      row({ id: 2, submittedAt: "2026-08-02T00:00:00Z" }),
    ];
    expect(scoreSeries(rows).map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it("nhãn ghép loại bài + phạm vi buổi, phạm vi một buổi không có dấu gạch", () => {
    const rows: AssessmentLite[] = [row({ type: "test", scope: [1, 2, 3, 4] })];
    expect(scoreSeries(rows)[0]?.label).toBe("Kiểm tra buổi 1–4");
  });

  it("phạm vi một buổi duy nhất (bổ túc) không có dấu gạch nối", () => {
    const rows: AssessmentLite[] = [row({ type: "remedial", scope: [5] })];
    expect(scoreSeries(rows)[0]?.label).toBe("Bổ túc buổi 5");
  });

  it("danh sách rỗng — người vừa đăng ký, chưa làm bài đánh giá nào", () => {
    expect(scoreSeries([])).toEqual([]);
  });
});

describe("topWrongWords", () => {
  const words: WordLite[] = [
    { id: 1, word: "apple", meaningVi: "quả táo" },
    { id: 2, word: "banana", meaningVi: "quả chuối" },
    { id: 3, word: "cherry", meaningVi: "quả anh đào" },
  ];

  it("bỏ qua từ không có trong words (đã bị xoá khỏi kho)", () => {
    const mastery: MasteryLite[] = [
      { wordId: 1, correctCount: 0, wrongCount: 2, mastered: false },
      { wordId: 99, correctCount: 0, wrongCount: 5, mastered: false }, // không có trong words
    ];
    const result = topWrongWords(mastery, words);
    expect(result).toEqual([{ wordId: 1, word: "apple", meaningVi: "quả táo", wrongCount: 2 }]);
  });

  it("hai từ bằng wrongCount thì thứ tự tất định theo wordId tăng dần", () => {
    const mastery: MasteryLite[] = [
      { wordId: 3, correctCount: 0, wrongCount: 4, mastered: false },
      { wordId: 1, correctCount: 0, wrongCount: 4, mastered: false },
      { wordId: 2, correctCount: 0, wrongCount: 4, mastered: false },
    ];
    expect(topWrongWords(mastery, words).map((w) => w.wordId)).toEqual([1, 2, 3]);
  });

  it("bỏ qua từ chưa từng sai (wrongCount = 0)", () => {
    const mastery: MasteryLite[] = [{ wordId: 1, correctCount: 5, wrongCount: 0, mastered: true }];
    expect(topWrongWords(mastery, words)).toEqual([]);
  });

  it("giới hạn số dòng theo limit truyền vào", () => {
    const mastery: MasteryLite[] = [
      { wordId: 1, correctCount: 0, wrongCount: 3, mastered: false },
      { wordId: 2, correctCount: 0, wrongCount: 2, mastered: false },
      { wordId: 3, correctCount: 0, wrongCount: 1, mastered: false },
    ];
    expect(topWrongWords(mastery, words, 2).map((w) => w.wordId)).toEqual([1, 2]);
  });

  it("limit mặc định là TOP_WRONG_LIMIT khi không truyền", () => {
    const mastery: MasteryLite[] = Array.from({ length: 15 }, (_, i) => ({
      wordId: i + 1,
      correctCount: 0,
      wrongCount: 15 - i,
      mastered: false,
    }));
    const manyWords: WordLite[] = Array.from({ length: 15 }, (_, i) => ({
      id: i + 1,
      word: `w${i + 1}`,
      meaningVi: `nghĩa ${i + 1}`,
    }));
    expect(topWrongWords(mastery, manyWords)).toHaveLength(TOP_WRONG_LIMIT);
  });

  it("danh sách rỗng — người vừa đăng ký, chưa sai từ nào", () => {
    expect(topWrongWords([], words)).toEqual([]);
  });
});
