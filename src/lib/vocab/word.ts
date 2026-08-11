/**
 * Hình dạng chuẩn của một từ vựng đọc lên từ `vocab_words`, đúng những cột
 * `authenticated` được phép đọc (0004_rls.sql:41-44).
 *
 * Ở một tệp riêng chứ không nằm trong module đọc dữ liệu nào, vì cả pha học
 * (lib/vocab/load-cards.ts) lẫn việc dựng đề (lib/exam/) đều đọc chính bảng đó
 * và phải quy về cùng một hình dạng.
 */
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
   * trống trước khi hiện — xem `renderCard` trong `lib/vocab/load-cards.ts`.
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
 * lên. Đường hợp lệ để lấy giá trị thật cho CẢ một buổi: RPC
 * `blank_answers_for_lesson` (0007), gọi từ `loadCards`
 * (`lib/vocab/load-cards.ts`) — nó đọc RPC vào một map cục bộ rồi truyền qua
 * tham số cho `renderCard`, KHÔNG ghi đè lên `VocabLite` gốc (khác thiết kế cũ
 * ở lát 1b). RPC `answer_for_word` cho MỘT từ (0006) vẫn còn ở database —
 * spec restructure liệt nó vào nhóm RPC chặn đáp án cần giữ nguyên (xem
 * docs/superpowers/specs/2026-08-11-phase2-vocab-first-restructure-design.md:89)
 * — nhưng lát 1c từng gọi nó đã bị Task 3 xoá sạch cùng luồng làm bài cũ, nên
 * hiện KHÔNG có nơi gọi nào trong `src/`.
 *
 * Ở cạnh `VocabLite` chứ không nằm trong một module đọc dữ liệu cụ thể — cùng
 * lý do đã nêu ở chú thích đầu tệp trên `VocabLite`: nhiều nơi khác nhau đọc
 * chính bảng đó và phải quy về cùng một hình dạng.
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
