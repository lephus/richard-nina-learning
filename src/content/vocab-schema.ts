import { z } from "zod";
import type { VocabWord } from "./types";

/** Dấu tiếng Việt. Nghĩa tiếng Việt không chứa ký tự nào trong tập này
 *  gần như chắc chắn là OCR chưa sửa (vd "quy dinh" thay vì "quy định"). */
const VN_DIACRITIC =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

export const vocabWordSchema = z.object({
  ordinal: z.number().int().positive(),
  word: z.string().min(1).regex(/^[a-z][a-z\- ]*$/, "từ phải là chữ thường"),
  pos: z.enum(["n", "v", "adj", "adv", "prep", "conj"]),
  ipa: z.string().regex(/^\/.+\/$/, "IPA phải bọc trong dấu /.../"),
  // meaningVi thường chỉ là cụm ngắn 2-3 chữ (vd "tham gia", "kinh doanh",
  // "an ninh") — nhiều cụm đúng chính tả vốn dĩ không có dấu nào. Áp
  // VN_DIACRITIC ở đây tạo dương tính giả, ép nội dung học phải độn thêm
  // chữ chỉ để qua validator. Không regex ở trường này; definitionVi và
  // exampleVi là câu đầy đủ nên vẫn giữ ràng buộc để chặn OCR chưa sửa dấu.
  meaningVi: z.string().min(2),
  definitionEn: z.string().min(10),
  definitionVi: z.string().min(5).regex(VN_DIACRITIC, "định nghĩa tiếng Việt thiếu dấu"),
  synonyms: z.array(z.string().min(1)).min(1, "cần ít nhất 1 từ đồng nghĩa"),
  exampleEn: z.string().includes("___", { message: "câu ví dụ phải có chỗ trống ___" }),
  exampleVi: z.string().min(5).regex(VN_DIACRITIC, "dịch ví dụ thiếu dấu"),
  blankAnswer: z.string().min(1),
});

export interface InvalidEntry { ordinal: number; problems: string[] }

export function validateVocab(items: unknown[]): { valid: VocabWord[]; invalid: InvalidEntry[] } {
  const valid: VocabWord[] = [];
  const invalid: InvalidEntry[] = [];
  for (const item of items) {
    const r = vocabWordSchema.safeParse(item);
    if (r.success) valid.push(r.data);
    else invalid.push({
      ordinal: (item as { ordinal?: number })?.ordinal ?? -1,
      problems: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  return { valid, invalid };
}
