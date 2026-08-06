import type { LessonPlan } from "./types";

export const LESSON_COUNT = 20;
export const WORDS_PER_LESSON = 30;
const NEEDED = LESSON_COUNT * WORDS_PER_LESSON; // 600

/**
 * Xếp từ vào buổi theo đúng thứ tự sách gốc — người học đi tuần tự
 * theo mạch tác giả biên soạn. Từ dôi ra (605 - 600) bị bỏ lại và
 * chỉ dùng làm phương án nhiễu trong câu hỏi, không phải nội dung học.
 */
export function buildLessonPlan(wordOrdinals: number[], grammarSlugs: string[]): LessonPlan[] {
  if (wordOrdinals.length < NEEDED) {
    throw new Error(`Cần ${NEEDED} từ để xếp ${LESSON_COUNT} buổi, chỉ có ${wordOrdinals.length}`);
  }
  if (grammarSlugs.length < LESSON_COUNT) {
    throw new Error(`Cần ${LESSON_COUNT} bài ngữ pháp, chỉ có ${grammarSlugs.length}`);
  }

  const sorted = [...wordOrdinals].sort((a, b) => a - b);
  return [...Array(LESSON_COUNT)].map((_, i) => ({
    ordinal: i + 1,
    grammarSlug: grammarSlugs[i]!,
    wordOrdinals: sorted.slice(i * WORDS_PER_LESSON, (i + 1) * WORDS_PER_LESSON),
  }));
}
