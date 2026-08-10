export interface MasteryRow {
  correctCount: number;
  wrongCount: number;
  mastered: boolean;
}

/**
 * Một từ coi là "đã thuộc" khi số lần đúng vượt số lần sai đúng bằng ngưỡng
 * này. Tha thứ cho vài lần sai lúc đầu nhưng đòi đúng nhiều hơn sai rõ rệt.
 *
 * Ngưỡng nằm ở đây, một chỗ duy nhất, để `/stats` ở lát 1d đếm "đã thuộc bao
 * nhiêu trên 605" bằng cùng một luật.
 */
export const MASTERY_THRESHOLD = 3;

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
