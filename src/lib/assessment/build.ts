import { hashString, seededShuffle } from "@content/shuffle-options";
import { pickDistractors, type GrammarLite, type VocabLite } from "@/lib/lesson/build-item";

export interface AssessmentItemSpec {
  position: number;
  itemType: "vocab" | "grammar";
  /** id của `vocab_words` hoặc `grammar_questions`. */
  refId: number;
  /** Gửi xuống trình duyệt nguyên vẹn. KHÔNG chứa đáp án. */
  payload: { prompt: string; options: string[] };
}

/**
 * Tỷ lệ 80/20 giữa từ vựng và ngữ pháp phản ánh trọng số chương trình: mỗi buổi
 * có 30 từ nhưng chỉ 1 bài ngữ pháp. Xem spec mục 4.
 */
export const COUNTS = {
  review: { vocab: 20, grammar: 5 },
  test: { vocab: 48, grammar: 12 },
} as const;

export function buildAssessmentItems(
  type: "review" | "test",
  words: readonly VocabLite[],
  grammar: readonly GrammarLite[],
  seed: number,
): AssessmentItemSpec[] {
  const need = COUNTS[type];

  // Thiếu nguồn thì phải NỔ ngay, không được lặng lẽ trả về đề ngắn hơn: một
  // đề "review" 18 câu thay vì 25 câu trông vẫn hợp lệ với mọi test kiểm tra
  // độ dài dựa trên chính output, và học viên chỉ phát hiện ra khi đã mở đề.
  // pickDistractors từng có đúng loại lỗi âm thầm-thiếu này ở lát trước.
  if (words.length < need.vocab) {
    throw new Error(
      `buildAssessmentItems("${type}"): cần ${need.vocab} từ vựng, chỉ có ${words.length}`,
    );
  }
  if (grammar.length < need.grammar) {
    throw new Error(
      `buildAssessmentItems("${type}"): cần ${need.grammar} câu ngữ pháp, chỉ có ${grammar.length}`,
    );
  }

  const chosenWords = seededShuffle(words, seed).slice(0, need.vocab);
  const chosenGrammar = seededShuffle(grammar, seed + 1).slice(0, need.grammar);

  const vocabItems: AssessmentItemSpec[] = chosenWords.map((word, i) => {
    const itemSeed = hashString(`${seed}:vocab:${word.id}`);
    const distractors = pickDistractors(word, words, itemSeed, {
      textOf: (c) => c.meaningVi,
      taken: [word.meaningVi],
    });
    return {
      position: i,
      itemType: "vocab" as const,
      refId: word.id,
      payload: {
        prompt: `"${word.word}" nghĩa là gì?`,
        options: seededShuffle(
          [word.meaningVi, ...distractors.map((d) => d.meaningVi)],
          itemSeed,
        ),
      },
    };
  });

  const grammarItems: AssessmentItemSpec[] = chosenGrammar.map((q, i) => ({
    position: need.vocab + i,
    itemType: "grammar" as const,
    refId: q.id,
    payload: {
      prompt: q.stem,
      options: seededShuffle(q.options, hashString(`${seed}:grammar:${q.id}`)),
    },
  }));

  return [...vocabItems, ...grammarItems];
}

/**
 * Bài bổ túc lấy nguyên các câu đã sai — cùng đề, cùng phương án — và chỉ đánh
 * số lại `position`. Giữ nguyên nội dung là có chủ ý: người học phải đối mặt
 * đúng câu họ đã sai, không phải một câu khác về cùng từ.
 */
export function buildRemedialItems(
  wrong: readonly AssessmentItemSpec[],
): AssessmentItemSpec[] {
  return wrong.map((item, i) => ({ ...item, position: i }));
}
