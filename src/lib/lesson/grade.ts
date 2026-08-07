import type { BuiltItem } from "./build-item";

export interface GradeResult {
  correct: boolean;
  /** Đáp án đúng, để hiển thị ngay khi người học trả lời sai. */
  correctAnswer: string;
}

export interface Secrets {
  /**
   * Đáp án đúng dạng chuỗi. Với câu nghĩa là `meaningVi`, với câu đồng nghĩa
   * là `synonyms[0]`, với câu điền là `blankAnswer`, với câu ngữ pháp là nội
   * dung phương án đúng. Giá trị này CHỈ tồn tại ở server.
   */
  correctOption: string;
}

/** Chuẩn hoá câu trả lời tự gõ: cắt hai đầu, hạ chữ thường. Không so khớp mờ. */
function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function gradeItem(
  item: BuiltItem,
  answer: string,
  secrets: Secrets,
): GradeResult {
  if (item.kind === "flashcard") {
    throw new Error("thẻ gặp từ không chấm — gọi nhầm gradeItem");
  }

  const correct =
    item.kind === "fill"
      ? normalize(answer) === normalize(secrets.correctOption) &&
        normalize(answer).length > 0
      : answer === secrets.correctOption;

  return { correct, correctAnswer: secrets.correctOption };
}
