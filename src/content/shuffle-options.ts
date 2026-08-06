import type { GrammarQuestion } from "./types";

const LETTERS = ["A", "B", "C", "D"] as const;

/**
 * Băm chuỗi thành số nguyên 32-bit không âm (FNV-1a). Hàm thuần, tất định:
 * cùng một chuỗi luôn cho cùng một số.
 */
export function hashString(s: string): number {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  return h >>> 0;
}

/** PRNG tất định (mulberry32): cùng seed luôn sinh cùng dãy số trong [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Xáo trộn Fisher-Yates tất định theo seed. Không sửa mảng gốc, trả về mảng mới. */
function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  const out = [...arr];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/**
 * Xáo trộn tất định thứ tự 4 lựa chọn của một câu hỏi, cập nhật `answer`
 * theo vị trí mới của lựa chọn đúng. Hạt giống được sinh từ chính nội dung
 * `stem` (băm FNV-1a) nên cùng một câu hỏi luôn cho ra cùng một thứ tự dù
 * chạy lại bao nhiêu lần, ở máy nào — không dùng Math.random().
 *
 * Hàm thuần: không sửa đối tượng đầu vào, trả về bản ghi mới.
 */
export function shuffleQuestionOptions(q: GrammarQuestion): GrammarQuestion {
  const correctIndex = LETTERS.indexOf(q.answer);
  const correctOption = q.options[correctIndex];
  if (correctOption === undefined) {
    throw new Error(`đáp án '${q.answer}' không khớp với options của câu: ${q.stem}`);
  }

  const seed = hashString(q.stem);
  const shuffled = seededShuffle(q.options, seed);
  const newIndex = shuffled.indexOf(correctOption);
  const newAnswer = LETTERS[newIndex];
  if (newAnswer === undefined) {
    throw new Error(`không tìm thấy lại đáp án đúng sau khi xáo trộn: ${q.stem}`);
  }

  return { ...q, options: shuffled, answer: newAnswer };
}
