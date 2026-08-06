import { describe, expect, it } from "vitest";
import { hashString, shuffleQuestionOptions } from "@content/shuffle-options";
import type { GrammarQuestion } from "@content/types";

const Q: GrammarQuestion = {
  lessonSlug: "danh-tu-tinh-tu-va-trang-tu",
  stem: "The company is seeking a qualified ______ for the position.",
  options: ["apply", "applicant", "application", "applicable"],
  answer: "B",
  explanation: "Sau mạo từ 'a' và tính từ 'qualified' cần một danh từ chỉ người, nên chọn 'applicant'.",
};

describe("hashString", () => {
  it("tất định — cùng chuỗi luôn cho cùng số", () => {
    expect(hashString(Q.stem)).toBe(hashString(Q.stem));
  });

  it("chuỗi khác nhau cho số khác nhau (ít nhất trong trường hợp thường gặp)", () => {
    expect(hashString("abc")).not.toBe(hashString("abd"));
  });
});

describe("shuffleQuestionOptions", () => {
  it("tất định — chạy lại nhiều lần ra kết quả y hệt", () => {
    const r1 = shuffleQuestionOptions(Q);
    const r2 = shuffleQuestionOptions(Q);
    expect(r2).toEqual(r1);
  });

  it("tập lựa chọn sau khi xáo trộn vẫn đúng bằng tập ban đầu", () => {
    const r = shuffleQuestionOptions(Q);
    expect(new Set(r.options)).toEqual(new Set(Q.options));
    expect(r.options).toHaveLength(4);
  });

  it("answer mới trỏ đúng về lựa chọn từng đúng trước khi xáo trộn", () => {
    const originalCorrect = Q.options[["A", "B", "C", "D"].indexOf(Q.answer)];
    const r = shuffleQuestionOptions(Q);
    const newCorrect = r.options[["A", "B", "C", "D"].indexOf(r.answer)];
    expect(newCorrect).toBe(originalCorrect);
  });

  it("không sửa đối tượng câu hỏi gốc (hàm thuần)", () => {
    const before = JSON.stringify(Q);
    shuffleQuestionOptions(Q);
    expect(JSON.stringify(Q)).toBe(before);
  });

  it("giữ nguyên các trường khác (stem, lessonSlug, explanation)", () => {
    const r = shuffleQuestionOptions(Q);
    expect(r.stem).toBe(Q.stem);
    expect(r.lessonSlug).toBe(Q.lessonSlug);
    expect(r.explanation).toBe(Q.explanation);
  });

  it("báo lỗi nếu answer không khớp options", () => {
    const bad: GrammarQuestion = { ...Q, answer: "D" as const, options: ["x", "y", "z"] };
    expect(() => shuffleQuestionOptions(bad)).toThrow();
  });
});
