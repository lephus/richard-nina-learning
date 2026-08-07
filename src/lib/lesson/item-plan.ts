/**
 * Trình tự một buổi học là TẤT ĐỊNH: item thứ N luôn là cùng một từ và cùng
 * một dạng câu hỏi, suy ra bằng phép chia. Không lưu đề xuống database.
 *
 * Đây là chỗ dễ sai nhất của lát 1b — chia nhầm một bậc thì cả buổi lệch mà
 * không có gì báo. Vì vậy nó là hàm thuần, phủ test đủ mọi biên.
 */

export type ItemKind =
  | "flashcard"
  | "meaning"
  | "synonym"
  | "fill"
  | "final-meaning"
  | "grammar";

export interface ItemSpec {
  kind: ItemKind;
  /**
   * flashcard | meaning | synonym | fill → chỉ số từ trong buổi, 0..29
   * final-meaning                        → thứ tự trong 10 câu chốt, 0..9
   * grammar                              → thứ tự trong 5 câu ngữ pháp, 0..4
   */
  index: number;
}

const WORDS_PER_CLUSTER = 10;
const FLASHCARDS_PER_CLUSTER = 10;
const PRACTICE_PER_CLUSTER = 20; // 10 từ × 2 dạng câu
const FILLS_PER_CLUSTER = 10;
const ITEMS_PER_CLUSTER =
  FLASHCARDS_PER_CLUSTER + PRACTICE_PER_CLUSTER + FILLS_PER_CLUSTER; // 40
const CLUSTERS = 3;
const PRACTICE_ITEMS = CLUSTERS * ITEMS_PER_CLUSTER; // 120
const FINAL_MEANING_ITEMS = 10;
const FINAL_GRAMMAR_ITEMS = 5;

export const TOTAL_ITEMS =
  PRACTICE_ITEMS + FINAL_MEANING_ITEMS + FINAL_GRAMMAR_ITEMS; // 135

export function itemAt(position: number): ItemSpec {
  if (!Number.isInteger(position) || position < 0 || position >= TOTAL_ITEMS) {
    throw new RangeError(`vị trí ${position} ngoài biên 0..${TOTAL_ITEMS - 1}`);
  }

  if (position < PRACTICE_ITEMS) {
    const cluster = Math.floor(position / ITEMS_PER_CLUSTER); // 0, 1, 2
    const within = position % ITEMS_PER_CLUSTER; // 0..39
    const firstWord = cluster * WORDS_PER_CLUSTER; // 0, 10, 20

    if (within < FLASHCARDS_PER_CLUSTER) {
      return { kind: "flashcard", index: firstWord + within };
    }

    if (within < FLASHCARDS_PER_CLUSTER + PRACTICE_PER_CLUSTER) {
      const k = within - FLASHCARDS_PER_CLUSTER; // 0..19
      // Mỗi từ chiếm 2 item liên tiếp: nghĩa trước, đồng nghĩa sau.
      return {
        kind: k % 2 === 0 ? "meaning" : "synonym",
        index: firstWord + Math.floor(k / 2),
      };
    }

    const k = within - FLASHCARDS_PER_CLUSTER - PRACTICE_PER_CLUSTER; // 0..9
    return { kind: "fill", index: firstWord + k };
  }

  const final = position - PRACTICE_ITEMS; // 0..14
  return final < FINAL_MEANING_ITEMS
    ? { kind: "final-meaning", index: final }
    : { kind: "grammar", index: final - FINAL_MEANING_ITEMS };
}
