import { describe, expect, it } from "vitest";
import { gradeItem } from "@/lib/lesson/grade";
import type { BuiltItem } from "@/lib/lesson/build-item";

const meaning: BuiltItem = {
  kind: "meaning",
  wordId: 1,
  word: "concern",
  options: ["sự quan tâm", "cái bàn", "chạy bộ", "màu xanh"],
};

const synonym: BuiltItem = {
  kind: "synonym",
  wordId: 1,
  word: "confident",
  options: ["self-assured", "argumentative", "coming", "hollow"],
};

const fill: BuiltItem = { kind: "fill", wordId: 1, sentence: "It is a ___ of mine." };

const grammar: BuiltItem = {
  kind: "grammar",
  questionId: 5,
  stem: "She ___ to school every day.",
  options: ["go", "goes", "going", "gone"],
};

describe("gradeItem", () => {
  it("câu nghĩa: đúng khi chọn đúng chuỗi nghĩa", () => {
    const r = gradeItem(meaning, "sự quan tâm", { correctOption: "sự quan tâm" });
    expect(r).toEqual({ correct: true, correctAnswer: "sự quan tâm" });
  });

  it("câu nghĩa: sai thì trả về đáp án đúng để hiển thị", () => {
    const r = gradeItem(meaning, "cái bàn", { correctOption: "sự quan tâm" });
    expect(r).toEqual({ correct: false, correctAnswer: "sự quan tâm" });
  });

  it("câu đồng nghĩa: so nguyên văn phương án, KHÔNG chuẩn hoá như câu điền", () => {
    // Nhánh này là nhánh mang lỗi "chấm sai câu đúng" của lát 1b (phương án
    // nhiễu có thể chính là một từ đồng nghĩa thật). Nó vẫn chưa hề có test.
    expect(gradeItem(synonym, "self-assured", { correctOption: "self-assured" })).toEqual({
      correct: true,
      correctAnswer: "self-assured",
    });
    expect(gradeItem(synonym, "argumentative", { correctOption: "self-assured" })).toEqual({
      correct: false,
      correctAnswer: "self-assured",
    });
  });

  it("câu đồng nghĩa: người học bấm nút nên chuỗi phải khớp y hệt, không cắt/hạ chữ", () => {
    // Câu trắc nghiệm không tự gõ — mọi giá trị gửi lên đều là nội dung một
    // nút có thật. Một chuỗi lệch hoa thường ở đây nghĩa là client đã sửa
    // payload, và nó PHẢI bị coi là sai.
    expect(gradeItem(synonym, "Self-Assured", { correctOption: "self-assured" }).correct).toBe(false);
    expect(gradeItem(synonym, " self-assured ", { correctOption: "self-assured" }).correct).toBe(false);
  });

  it("câu điền: bỏ qua hoa thường và khoảng trắng thừa", () => {
    expect(gradeItem(fill, "  CONCERN ", { correctOption: "concern" }).correct).toBe(true);
    expect(gradeItem(fill, "concern", { correctOption: "concern" }).correct).toBe(true);
  });

  it("câu điền: gõ sai một chữ vẫn là sai, không so khớp mờ", () => {
    expect(gradeItem(fill, "concren", { correctOption: "concern" }).correct).toBe(false);
  });

  it("câu điền: bỏ trống là sai", () => {
    expect(gradeItem(fill, "   ", { correctOption: "concern" }).correct).toBe(false);
  });

  it("câu ngữ pháp: so theo nội dung phương án, không theo chữ cái", () => {
    expect(gradeItem(grammar, "goes", { correctOption: "goes" }).correct).toBe(true);
    expect(gradeItem(grammar, "go", { correctOption: "goes" }).correct).toBe(false);
  });

  it("thẻ gặp từ không chấm — ném lỗi nếu ai đó gọi nhầm", () => {
    const card = { kind: "flashcard" } as BuiltItem;
    expect(() => gradeItem(card, "", { correctOption: "" })).toThrow();
  });
});
