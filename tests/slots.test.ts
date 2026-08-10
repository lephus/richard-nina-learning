import { describe, expect, it } from "vitest";
import { assessmentLabel, slotAt, TOTAL_SLOTS } from "@/lib/assessment/slots";

describe("slotAt", () => {
  it("chương trình có đúng 35 hoạt động", () => {
    expect(TOTAL_SLOTS).toBe(35);
  });

  it("chu kỳ 1 đúng thứ tự spec mục 5.1", () => {
    expect(slotAt(0)).toEqual({ kind: "lesson", lessons: [1] });
    expect(slotAt(1)).toEqual({ kind: "lesson", lessons: [2] });
    expect(slotAt(2)).toEqual({ kind: "review", lessons: [1, 2] });
    expect(slotAt(3)).toEqual({ kind: "lesson", lessons: [3] });
    expect(slotAt(4)).toEqual({ kind: "lesson", lessons: [4] });
    expect(slotAt(5)).toEqual({ kind: "review", lessons: [3, 4] });
    expect(slotAt(6)).toEqual({ kind: "test", lessons: [1, 2, 3, 4] });
  });

  it("chu kỳ 2 bắt đầu ở slot 7 với buổi 5", () => {
    expect(slotAt(7)).toEqual({ kind: "lesson", lessons: [5] });
    expect(slotAt(9)).toEqual({ kind: "review", lessons: [5, 6] });
    expect(slotAt(13)).toEqual({ kind: "test", lessons: [5, 6, 7, 8] });
  });

  it("chu kỳ cuối kết thúc ở slot 34 với bài kiểm tra buổi 17-20", () => {
    expect(slotAt(28)).toEqual({ kind: "lesson", lessons: [17] });
    expect(slotAt(34)).toEqual({ kind: "test", lessons: [17, 18, 19, 20] });
  });

  it("mọi slot buổi học phủ đúng 20 buổi, mỗi buổi một lần", () => {
    const seen: number[] = [];
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const s = slotAt(i);
      if (s.kind === "lesson") seen.push(s.lessons[0]!);
    }
    expect(seen).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("có đúng 10 bài ôn tập và 5 bài kiểm tra", () => {
    const kinds = Array.from({ length: TOTAL_SLOTS }, (_, i) => slotAt(i).kind);
    expect(kinds.filter((k) => k === "review")).toHaveLength(10);
    expect(kinds.filter((k) => k === "test")).toHaveLength(5);
  });

  it("ném lỗi khi ngoài biên", () => {
    expect(() => slotAt(-1)).toThrow(RangeError);
    expect(() => slotAt(35)).toThrow(RangeError);
  });
});

describe("assessmentLabel", () => {
  // MỘT nguồn cho nhãn "Ôn tập buổi 1–2" / "Kiểm tra buổi 1–4" — trước lát
  // này, stats/compute.ts, dashboard/page.tsx và lesson-done.tsx tự dựng ba
  // lần, đọc chỉ số khác nhau ([0]/[1], [0]/[3], [0]/[length-1]). Test này
  // khoá cả ba loại (review/test/remedial) và trường hợp mảng một phần tử —
  // đúng khuôn `lessons[0]`/`lessons[length-1]` phải cho ra kết quả đúng dù
  // độ dài mảng không phải 2 hay 4 như dữ liệu hôm nay tình cờ luôn có.
  it("ôn tập hai buổi: Ôn tập buổi 1–2", () => {
    expect(assessmentLabel("review", [1, 2])).toBe("Ôn tập buổi 1–2");
  });

  it("kiểm tra bốn buổi: Kiểm tra buổi 1–4", () => {
    expect(assessmentLabel("test", [1, 2, 3, 4])).toBe("Kiểm tra buổi 1–4");
  });

  it("bổ túc: Bổ túc buổi 5–6", () => {
    expect(assessmentLabel("remedial", [5, 6])).toBe("Bổ túc buổi 5–6");
  });

  it("mảng một phần tử: không có dấu gạch ngang, dù loại nào", () => {
    expect(assessmentLabel("review", [3])).toBe("Ôn tập buổi 3");
    expect(assessmentLabel("test", [7])).toBe("Kiểm tra buổi 7");
    expect(assessmentLabel("remedial", [12])).toBe("Bổ túc buổi 12");
  });

  it("dấu gạch ngang là EN DASH U+2013, không phải dấu gạch nối thường", () => {
    const label = assessmentLabel("test", [1, 2, 3, 4]);
    // codePointAt ngay sau số đầu tiên phải đúng byte U+2013 — so sánh chuỗi
    // "–" suông trong file .ts vẫn ăn may đúng nếu ai đó gõ nhầm dấu gạch nối
    // thường (chỉ khác 1 byte, mắt thường không phân biệt được), nên khoá
    // thẳng bằng codePointAt số học mới chắc chắn phát hiện được sai lệch.
    expect(label.codePointAt(label.indexOf("1") + 1)).toBe(0x2013);
  });
});
