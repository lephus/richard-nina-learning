import { hashString, seededShuffle } from "@content/shuffle-options";

/**
 * Dữ liệu tối giản của một câu hỏi ngữ pháp cần cho việc dựng đề — không kéo
 * theo cả bản ghi `grammar_questions` (không cần `explanation`, `lessonSlug`…).
 */
export interface GrammarQuestionLite {
  id: number;
  stem: string;
  options: string[];
  answer: string;
}

/** Một câu trong đề đã dựng: đề bài + 4 phương án đã trộn + đáp án là CHỮ HIỂN THỊ. */
export interface GrammarExamQuestion {
  questionId: number;
  prompt: string;
  options: string[];
  answer: string;
}

const A = "A".charCodeAt(0);

/**
 * Dựng đề ngữ pháp cho MỘT bài, lấy TOÀN BỘ câu hỏi của bài — không cắt bớt,
 * không lấy mẫu. Khác lát vocab (đề luôn 30 từ), một bài ngữ pháp có 20-100
 * câu tuỳ bài, và người học phải làm hết số câu đó mới coi là thi xong bài.
 *
 * `grammar_questions` đã mang sẵn 4 `options` và một chữ cái `answer` (A-D)
 * do người soạn đề chọn — không có gì để SINH thêm ở đây. Vì vậy hàm này CỐ
 * TÌNH không dùng `pickDistractors`: ở lát vocab, đáp án đúng và các phương
 * án nhiễu đều được RÚT RA từ một kho từ chung nên cần một hàm chọn nhiễu; ở
 * đây bốn phương án đã đóng khung sẵn theo đúng ý người soạn đề — tự sinh
 * thêm nhiễu chỉ là thay đề của họ bằng một đề khác, không phải dựng đề.
 *
 * Hàm thuần: không đọc mạng, không gọi Supabase, nên test được trên toàn bộ
 * câu hỏi thật (537 câu, 20 bài) mà không cần database.
 */
export function buildGrammarExam(
  questions: readonly GrammarQuestionLite[],
  seed: number,
): GrammarExamQuestion[] {
  if (questions.length === 0) {
    throw new Error("không có câu hỏi nào để dựng đề ngữ pháp");
  }

  // Trộn thứ tự câu hỏi trong đề — cùng seed thì tải lại trang vẫn ra đúng
  // thứ tự đó, không xáo lại.
  const thuTu = seededShuffle(questions, seed);

  return thuTu.map((cau) => {
    const chiSo = cau.answer.charCodeAt(0) - A;
    const dapAnGoc = cau.options[chiSo];
    // Nổ ngay khi chữ cái đáp án không trỏ được vào options, thay vì lặng lẽ
    // bỏ qua câu đó — một đề thiếu câu là lỗi chỉ lộ ra khi có người thật thi.
    if (cau.answer.length !== 1 || chiSo < 0 || chiSo >= cau.options.length || dapAnGoc === undefined) {
      throw new Error(
        `chữ cái đáp án '${cau.answer}' của câu #${cau.id} nằm ngoài biên options`,
      );
    }

    // Seed riêng cho từng câu (băm từ seed đề ghép với id câu) để trộn phương
    // án — nếu dùng chung một seed cho mọi câu thì tất cả bị trộn theo đúng
    // một hoán vị, dễ đoán vị trí đáp án đúng sau vài câu.
    const seedCau = hashString(`${seed}:${cau.id}`);
    const options = seededShuffle(cau.options, seedCau);

    return {
      questionId: cau.id,
      prompt: cau.stem,
      options,
      answer: dapAnGoc,
    };
  });
}
