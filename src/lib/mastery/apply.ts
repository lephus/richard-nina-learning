export interface MasteryRow {
  correctCount: number;
  wrongCount: number;
  mastered: boolean;
}

/**
 * Một từ coi là "đã thuộc" khi số lần đúng vượt số lần sai đúng bằng ngưỡng này.
 *
 * Ngưỡng là 2 chứ không phải 3 vì cấu trúc sau lát 2a chạm mỗi từ **tối đa hai
 * lần trong cả đời**: đúng một câu trong bài buổi (30 câu/30 từ) và đúng một
 * câu trong bài ôn tập nhóm (60 câu/60 từ). Bài bổ túc chỉ chứa từ đã sai. Với
 * ngưỡng 3, trần đạt được là 2 — nghĩa là KHÔNG từ nào có thể "đã thuộc", bao
 * giờ, và thẻ "đã thuộc /605" trên dashboard đứng ở 0 vĩnh viễn.
 *
 * Ngưỡng 2 nghĩa là "đúng ở cả hai lần kiểm riêng biệt, cách nhau nhiều ngày" —
 * mức cao nhất mà cấu trúc mới còn cho phép, và vẫn mang nghĩa thật. Ngưỡng 1
 * thì "đã thuộc" chỉ còn nghĩa "đã đoán trúng một lần": câu 4 phương án có 25%
 * đoán trúng.
 *
 * Ngưỡng nằm ở đây, một chỗ duy nhất, để `/stats` đếm cột `mastered` bằng cùng
 * một luật thay vì tự tính lại.
 */
export const MASTERY_THRESHOLD = 2;

export function masteryDelta(
  current: MasteryRow | null,
  correct: boolean,
): MasteryRow {
  const correctCount = (current?.correctCount ?? 0) + (correct ? 1 : 0);
  const wrongCount = (current?.wrongCount ?? 0) + (correct ? 0 : 1);
  return {
    correctCount,
    wrongCount,
    mastered: correctCount - wrongCount >= MASTERY_THRESHOLD,
  };
}
