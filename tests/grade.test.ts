import { describe, expect, it } from "vitest";
import { gradeItem } from "@/lib/lesson/grade";
import type { BuiltItem } from "@/lib/lesson/build-item";

const meaning: BuiltItem = {
  kind: "meaning",
  wordId: 1,
  word: "concern",
  options: ["sự quan tâm", "cái bàn", "chạy bộ", "màu xanh"],
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
