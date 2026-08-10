import { describe, expect, it } from "vitest";
import { itemAt, TOTAL_ITEMS } from "@/lib/lesson/item-plan";

describe("itemAt", () => {
  it("buổi có đúng 135 item", () => {
    expect(TOTAL_ITEMS).toBe(135);
  });

  it("cụm 1 mở đầu bằng 10 thẻ gặp từ, từ 0 tới 9", () => {
    expect(itemAt(0)).toEqual({ kind: "flashcard", index: 0 });
    expect(itemAt(9)).toEqual({ kind: "flashcard", index: 9 });
  });

  it("sau 10 thẻ là 20 câu luyện, mỗi từ một câu nghĩa rồi một câu đồng nghĩa", () => {
    expect(itemAt(10)).toEqual({ kind: "meaning", index: 0 });
    expect(itemAt(11)).toEqual({ kind: "synonym", index: 0 });
    expect(itemAt(12)).toEqual({ kind: "meaning", index: 1 });
    expect(itemAt(29)).toEqual({ kind: "synonym", index: 9 });
  });

  it("10 item cuối cụm là câu điền", () => {
    expect(itemAt(30)).toEqual({ kind: "fill", index: 0 });
    expect(itemAt(39)).toEqual({ kind: "fill", index: 9 });
  });

  it("cụm 2 bắt đầu ở item 40 và dùng từ 10..19", () => {
    expect(itemAt(40)).toEqual({ kind: "flashcard", index: 10 });
    expect(itemAt(50)).toEqual({ kind: "meaning", index: 10 });
    expect(itemAt(79)).toEqual({ kind: "fill", index: 19 });
  });

  it("cụm 3 bắt đầu ở item 80 và dùng từ 20..29", () => {
    expect(itemAt(80)).toEqual({ kind: "flashcard", index: 20 });
    expect(itemAt(119)).toEqual({ kind: "fill", index: 29 });
  });

  it("chốt buổi: 10 câu nghĩa rồi 5 câu ngữ pháp", () => {
    expect(itemAt(120)).toEqual({ kind: "final-meaning", index: 0 });
    expect(itemAt(129)).toEqual({ kind: "final-meaning", index: 9 });
    expect(itemAt(130)).toEqual({ kind: "grammar", index: 0 });
    expect(itemAt(134)).toEqual({ kind: "grammar", index: 4 });
  });

  it("ném lỗi khi vị trí ngoài biên", () => {
    expect(() => itemAt(-1)).toThrow(RangeError);
    expect(() => itemAt(135)).toThrow(RangeError);
  });

  it("mọi vị trí hợp lệ đều trả về chỉ số từ trong biên", () => {
    for (let p = 0; p < TOTAL_ITEMS; p++) {
      const spec = itemAt(p);
      if (spec.kind === "grammar") expect(spec.index).toBeLessThan(5);
      else if (spec.kind === "final-meaning") expect(spec.index).toBeLessThan(10);
      else expect(spec.index).toBeLessThan(30);
      expect(spec.index).toBeGreaterThanOrEqual(0);
    }
  });
});
