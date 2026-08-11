/**
 * Hình dạng chuẩn của một từ vựng đọc lên từ `vocab_words`, đúng những cột
 * `authenticated` được phép đọc (0004_rls.sql:41-44).
 *
 * Ở một tệp riêng chứ không nằm trong module đọc dữ liệu nào, vì cả pha học
 * (lib/vocab/load-cards.ts) lẫn việc dựng đề (lib/exam/) đều đọc chính bảng đó
 * và phải quy về cùng một hình dạng.
 */

/** Chỉ những cột `authenticated` được phép đọc — xem 0004_rls.sql:41-44. */
export interface VocabLite {
  id: number;
  word: string;
  pos: string;
  ipa: string;
  meaningVi: string;
  definitionEn: string;
  synonyms: string[];
  /**
   * Câu ví dụ ĐÃ BỊ KHOÉT: cả 605 dòng vocab_words đều chứa đúng một "___".
   * Câu điền từ dùng nguyên văn chuỗi này; thẻ gặp từ điền lại từ vào chỗ
   * trống trước khi hiện — xem nhánh flashcard trong buildItem.
   */
  exampleEn: string;
  /** Bản dịch tiếng Việt của câu ví dụ. Đầy đủ, không bị khoét (605/605 dòng). */
  exampleVi: string;
  /**
   * Từ bị khoét khỏi exampleEn. Cột này KHÔNG được cấp cho `authenticated`,
   * nên nó chỉ tồn tại ở phía server — không bao giờ gửi xuống trình duyệt.
   */
  blankAnswer: string;
}

/**
 * Một dòng `vocab_words` (snake_case, đúng những cột `authenticated` đọc được)
 * → `VocabLite`. `blankAnswer` luôn là chuỗi rỗng Ở ĐÂY: cột đó đã bị thu hồi
 * khỏi `authenticated` (0004_rls.sql:41-44) nên nó KHÔNG có trong dòng đọc
 * lên. Hai đường hợp lệ để lấy giá trị thật: RPC `answer_for_word` cho MỘT từ
 * (xem `secretFor`), hoặc RPC `blank_answers_for_lesson` cho CẢ một buổi (xem
 * `loadContext` — nó gọi hàm này rồi GHI ĐÈ `blankAnswer` lên kết quả).
 *
 * Ở cạnh `VocabLite` chứ không nằm trong một module đọc dữ liệu cụ thể, vì cả
 * buổi học (lib/lesson/session.ts) lẫn bài đánh giá (lib/assessment/run.ts)
 * đều đọc chính bảng đó và phải quy về cùng một hình dạng.
 */
export function toVocabLite(row: unknown): VocabLite {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as number,
    word: r.word as string,
    pos: r.pos as string,
    ipa: r.ipa as string,
    meaningVi: r.meaning_vi as string,
    definitionEn: r.definition_en as string,
    synonyms: r.synonyms as string[],
    exampleEn: r.example_en as string,
    exampleVi: r.example_vi as string,
    blankAnswer: "",
  };
}
