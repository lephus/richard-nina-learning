import { hashString, seededShuffle } from "@content/shuffle-options";
import { pickDistractors } from "@/lib/exam/distractors";
import type { VocabLite } from "@/lib/vocab/word";

export type ExamQuestionKind = "nghia" | "dien";

export interface ExamQuestion {
  wordId: number;
  kind: ExamQuestionKind;
  prompt: string;
  /** 4 phương án đã trộn. Đây là thứ DUY NHẤT cùng `prompt` được ghi xuống payload. */
  options: string[];
  /**
   * Đáp án đúng. CHỈ dùng trong tiến trình server lúc dựng đề để kiểm tra tính
   * nhất quán; KHÔNG BAO GIỜ được ghi vào `assessment_items.payload` — chấm
   * điểm về sau đọc lại đáp án từ `ref_id` qua RPC `answer_for_word`.
   */
  answer: string;
}

/**
 * Dựng đề cho một phạm vi từ.
 *
 * `blankAnswers` phải truyền từ ngoài vào vì cột `vocab_words.blank_answer` đã
 * bị revoke khỏi `authenticated` (0004_rls.sql) — chỉ server đọc được, qua
 * `blank_answers_for_lesson`. Hàm này vì thế là hàm thuần: không tự gọi mạng,
 * nên test được trên toàn bộ 605 từ mà không cần database.
 *
 * `distractorPool` mở rộng nguồn nhiễu ra ngoài `words`. Bài `remedial` có thể
 * chỉ có 2-3 từ sai — hẹp hơn 4 phương án cần thiết — nên nó truyền phạm vi
 * của bài cha vào đây. Bỏ trống thì nguồn nhiễu chính là `words`.
 */
export function buildVocabExam(
  words: readonly VocabLite[],
  blankAnswers: ReadonlyMap<number, string>,
  seed: number,
  distractorPool?: readonly VocabLite[],
): ExamQuestion[] {
  const pool = distractorPool ?? words;

  // Từ nào rơi vào dạng nào do seed quyết định, nên tải lại trang không đổi đề.
  // Nửa đầu sau khi trộn là câu nghĩa, nửa sau là câu điền — với 30 từ thành
  // đúng 15-15 như spec đòi.
  const thuTu = seededShuffle(words, seed);
  const soCauNghia = Math.ceil(thuTu.length / 2);

  return thuTu.map((tu, i) => {
    const kind: ExamQuestionKind = i < soCauNghia ? "nghia" : "dien";
    // Seed riêng cho từng câu: cùng một từ ở hai bài khác seed phải ra bộ nhiễu
    // khác, nếu không thì làm lại bài sau khi trượt sẽ gặp y hệt bốn phương án.
    const seedCau = hashString(`${seed}:${tu.id}:${kind}`);

    if (kind === "nghia") {
      const dapAn = tu.word;
      const nhieu = pickDistractors(tu, pool, seedCau, {
        textOf: (c) => c.word,
        // Đồng nghĩa của từ đích cũng là đáp án đúng về nghĩa — 185/605 từ có
        // một từ đồng nghĩa cũng nằm trong kho. `taken` chặn được CHIỀU TỪ
        // ĐÍCH: đồng nghĩa của target không được làm nhiễu. Nhưng quan hệ
        // đồng nghĩa trong kho phần lớn là MỘT CHIỀU — 136/202 cặp tham chiếu
        // chéo chỉ khai một chiều — nên target có thể không liệt kê một ứng
        // viên, trong khi chính ứng viên đó lại liệt kê target trong synonyms
        // của nó (vd. target `certain`, ứng viên `confident` có synonyms chứa
        // `certain`, dù `certain.synonyms` không hề nhắc tới `confident`).
        // `reject` bên dưới chặn CHIỀU NGƯỢC LẠI đó: loại mọi ứng viên tự nhận
        // đáp án đúng là đồng nghĩa của chính nó.
        taken: [dapAn, ...tu.synonyms],
        reject: (c) => c.synonyms.includes(dapAn),
      });
      if (nhieu.length < 3) {
        throw new Error(`không đủ phương án nhiễu cho từ ${tu.id} (${tu.word}) dạng nghĩa`);
      }
      return {
        wordId: tu.id,
        kind,
        prompt: tu.meaningVi,
        options: seededShuffle([dapAn, ...nhieu.map((n) => n.word)], seedCau),
        answer: dapAn,
      };
    }

    const dapAn = blankAnswers.get(tu.id);
    if (dapAn === undefined) {
      throw new Error(`thiếu blankAnswer cho từ ${tu.id} (${tu.word})`);
    }
    const nhieu = pickDistractors(tu, pool, seedCau, {
      // Cả 4 phương án phải ở dạng biến cách. Để nhiễu ở dạng gốc thì đáp án
      // đúng tự lộ: nó là phương án duy nhất khớp ngữ pháp với câu.
      textOf: (c) => blankAnswers.get(c.id) ?? c.word,
      taken: [dapAn],
      reject: (c) => blankAnswers.get(c.id) === undefined,
    });
    if (nhieu.length < 3) {
      throw new Error(`không đủ phương án nhiễu cho từ ${tu.id} (${tu.word}) dạng điền`);
    }
    return {
      wordId: tu.id,
      kind,
      prompt: tu.exampleEn,
      options: seededShuffle(
        [dapAn, ...nhieu.map((n) => blankAnswers.get(n.id)!)],
        seedCau,
      ),
      answer: dapAn,
    };
  });
}
