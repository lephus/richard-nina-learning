import { describe, expect, it } from "vitest";
import { parseQuestionDoc } from "@content/question-parser";

const SAMPLE = `BÀI TẬP DANH TỪ TOEIC
PART 1: Multiple Choice (1–50)
1.  The company is seeking a qualified ______ for the position.
    A. apply
    B. applicant
    C. application
    D. applicable
2.  Customer ______ is our top priority.
    A. satisfy
    B. satisfaction
    C. satisfying
    D. satisfied
`;

describe("parseQuestionDoc", () => {
  it("tách được 2 câu hỏi", () => {
    expect(parseQuestionDoc(SAMPLE, "danh-tu.docx")).toHaveLength(2);
  });

  it("lấy đúng đề bài kèm chỗ trống", () => {
    const [q] = parseQuestionDoc(SAMPLE, "danh-tu.docx");
    expect(q!.stem).toBe("The company is seeking a qualified ______ for the position.");
  });

  it("lấy đủ 4 lựa chọn, đã bỏ tiền tố A./B./C./D.", () => {
    const [q] = parseQuestionDoc(SAMPLE, "danh-tu.docx");
    expect(q!.options).toEqual(["apply", "applicant", "application", "applicable"]);
  });

  it("bỏ qua dòng tiêu đề không phải câu hỏi", () => {
    const qs = parseQuestionDoc(SAMPLE, "danh-tu.docx");
    expect(qs.every((q) => q.options.length === 4)).toBe(true);
  });

  it("tách được lựa chọn A nằm cùng dòng với đề bài", () => {
    const src = `50. The bank is _______ to offer low-interest loans. A. eager
  B. eagerly
  C. eagerness
  D. more eagerly
`;
    const [q] = parseQuestionDoc(src, "adj.docx");
    expect(q!.stem).toBe("The bank is _______ to offer low-interest loans.");
    expect(q!.options).toEqual(["eager", "eagerly", "eagerness", "more eagerly"]);
  });
});
