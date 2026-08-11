import { describe, expect, it } from "vitest";
import {
  groupOf, lessonsOf, wordRangeLabel, TOTAL_GROUPS, TOTAL_LESSONS,
} from "@/lib/curriculum/groups";

describe("groupOf", () => {
  it("buổi 1 và 2 cùng thuộc nhóm 1", () => {
    expect(groupOf(1)).toBe(1);
    expect(groupOf(2)).toBe(1);
  });

  it("buổi 3 sang nhóm 2 — đúng chỗ chuyển nhóm", () => {
    expect(groupOf(3)).toBe(2);
  });

  it("buổi 19 và 20 thuộc nhóm cuối", () => {
    expect(groupOf(19)).toBe(TOTAL_GROUPS);
    expect(groupOf(20)).toBe(TOTAL_GROUPS);
  });

  it("ném khi buổi ngoài biên 1..20", () => {
    expect(() => groupOf(0)).toThrow(RangeError);
    expect(() => groupOf(21)).toThrow(RangeError);
    expect(() => groupOf(1.5)).toThrow(RangeError);
  });
});

describe("lessonsOf", () => {
  it("nhóm 1 gồm buổi 1 và 2", () => {
    expect(lessonsOf(1)).toEqual([1, 2]);
  });

  it("nhóm 10 gồm buổi 19 và 20", () => {
    expect(lessonsOf(10)).toEqual([19, 20]);
  });

  it("ném khi nhóm ngoài biên 1..10", () => {
    expect(() => lessonsOf(0)).toThrow(RangeError);
    expect(() => lessonsOf(11)).toThrow(RangeError);
  });

  it("phủ đúng 20 buổi, không lặp không sót", () => {
    const all: number[] = [];
    for (let g = 1; g <= TOTAL_GROUPS; g++) all.push(...lessonsOf(g));
    expect(all).toEqual(Array.from({ length: TOTAL_LESSONS }, (_, i) => i + 1));
  });

  it("groupOf là nghịch đảo của lessonsOf", () => {
    for (let g = 1; g <= TOTAL_GROUPS; g++) {
      for (const ordinal of lessonsOf(g)) expect(groupOf(ordinal)).toBe(g);
    }
  });
});

describe("wordRangeLabel", () => {
  it("nhóm 1 phủ từ 1 tới 60", () => {
    expect(wordRangeLabel(1)).toBe("từ 1–60");
  });

  it("nhóm 10 phủ từ 541 tới 600", () => {
    expect(wordRangeLabel(10)).toBe("từ 541–600");
  });

  it("dùng EN DASH chứ không phải dấu gạch nối", () => {
    // Playwright so khớp nguyên văn chuỗi này; đổi ký tự sẽ làm e2e trượt âm thầm.
    expect(wordRangeLabel(1)).toContain("–");
    expect(wordRangeLabel(1)).not.toContain("-");
  });
});
