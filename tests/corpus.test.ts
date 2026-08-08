/**
 * Dựng TOÀN BỘ 2700 item của chương trình (20 buổi × 135 vị trí) từ chính
 * `data/clean/*.json` — kho nội dung THẬT đã seed lên database — rồi soi mọi
 * thứ người học sẽ nhìn thấy.
 *
 * VÌ SAO PHẢI CÓ TỆP NÀY. Trong lát 1b đã có một lỗi khiến MỌI câu điền từ
 * hiển thị vỡ vụn ("___I___t___ ___i___s___…") mà không một lớp kiểm thử nào
 * bắt được: fixture của test đơn vị mô phỏng một kho dữ liệu KHÔNG TỒN TẠI,
 * còn test tích hợp thì không bao giờ chạm tới nội dung hiển thị. Lỗi chỉ lộ
 * ra khi có người mở trình duyệt.
 *
 * Tệp này lấp đúng khoảng trống đó: không mô phỏng gì cả, không cần database,
 * chạy trong vài trăm mili giây, và khẳng định những tính chất mà một buổi
 * học ĐÚNG phải có trên từng item một.
 *
 * Thứ tự từ trong buổi dựng y hệt cách scripts/phase0/05-seed.ts:78-85 ghi
 * bảng `lesson_words` (position = chỉ số trong `wordOrdinals`, tính từ 1), và
 * `loadContext` đọc lại bằng `.order("position")` — nên test nhìn thấy đúng
 * thứ tự mà sản xuất nhìn thấy.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hashString } from "@content/shuffle-options";
import { itemAt, TOTAL_ITEMS } from "@/lib/lesson/item-plan";
import { buildItem } from "@/lib/lesson/build-item";
import type { BuildContext, BuiltItem, GrammarLite, VocabLite } from "@/lib/lesson/build-item";
import type { GrammarQuestion, LessonPlan, VocabWord } from "@content/types";

const read = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

const vocab = read<VocabWord[]>("data/clean/vocab.json");
const questions = read<GrammarQuestion[]>("data/clean/questions.json");
const plan = read<LessonPlan[]>("data/clean/lesson-plan.json");

/**
 * `id` ở đây dùng `ordinal` làm đại diện cho khoá chính thật: 05-seed.ts chèn
 * vocab.json theo đúng thứ tự tệp vào một cột bigserial, nên id thật tăng
 * cùng chiều với ordinal. Mọi thứ trong buildItem chỉ dùng id để SO SÁNH
 * BẰNG, không dùng giá trị tuyệt đối — nên đại diện này là đủ.
 *
 * `blankAnswer: ""` khớp đúng đường đi công khai: `toVocabLite` trong
 * session.ts luôn để trống cột này vì nó không được phép rời khỏi server.
 */
const toLite = (w: VocabWord): VocabLite => ({
  id: w.ordinal,
  word: w.word,
  pos: w.pos,
  ipa: w.ipa,
  meaningVi: w.meaningVi,
  definitionEn: w.definitionEn,
  synonyms: w.synonyms,
  exampleEn: w.exampleEn,
  exampleVi: w.exampleVi,
  blankAnswer: "",
});

const byOrdinal = new Map(vocab.map((w) => [w.ordinal, w]));

/** Câu hỏi ngữ pháp của một bài, giữ nguyên thứ tự tệp = thứ tự id sau khi seed. */
const grammarFor = (slug: string): GrammarLite[] =>
  questions
    .map((q, i) => ({ q, id: i + 1 }))
    .filter(({ q }) => q.lessonSlug === slug)
    .map(({ q, id }) => ({ id, stem: q.stem, options: q.options }));

function contextFor(p: LessonPlan, userId: string): BuildContext {
  const lessonWords = p.wordOrdinals.map((ord) => {
    const w = byOrdinal.get(ord);
    if (!w) throw new Error(`lesson-plan.json trỏ tới ordinal ${ord} không có trong vocab.json`);
    return toLite(w);
  });
  return {
    lessonWords,
    grammar: grammarFor(p.grammarSlug),
    // `lessonId` thật không biết được ngoài database; dùng ordinal — hạt giống
    // chỉ cần TẤT ĐỊNH và khác nhau giữa các buổi, không cần trùng giá trị
    // sản xuất.
    seed: hashString(`${userId}:${p.ordinal}`),
    grammarLessonId: p.ordinal,
  };
}

interface Built {
  lesson: number;
  position: number;
  spec: ReturnType<typeof itemAt>;
  item: BuiltItem;
  /** Từ đích của item, khi item gắn với một từ. */
  target: VocabLite | null;
}

/** Dựng cả 20 × 135 item cho một người học. Ném lỗi thì test đỏ ngay tại đây. */
function sweep(userId: string): Built[] {
  const out: Built[] = [];
  for (const p of plan) {
    const ctx = contextFor(p, userId);
    for (let position = 0; position < TOTAL_ITEMS; position++) {
      const spec = itemAt(position);
      const item = buildItem(spec, ctx);
      const wordId =
        item.kind === "flashcard"
          ? item.word.id
          : item.kind === "grammar"
            ? null
            : item.wordId;
      const target = wordId === null ? null : ctx.lessonWords.find((w) => w.id === wordId) ?? null;
      out.push({ lesson: p.ordinal, position, spec, item, target });
    }
  }
  return out;
}

const USER = "00000000-0000-4000-8000-000000000001";
const built = sweep(USER);

describe("toàn bộ chương trình dựng từ data/clean/", () => {
  it("dựng đủ 20 buổi × 135 vị trí = 2700 item, không item nào ném lỗi", () => {
    expect(plan).toHaveLength(20);
    expect(built).toHaveLength(20 * TOTAL_ITEMS);
    expect(built).toHaveLength(2700);
  });

  it("mọi câu trắc nghiệm có đúng 4 phương án, đôi một KHÁC NHAU theo chữ hiển thị", () => {
    // Hai nút cùng chữ vừa là lỗi hiển thị (người học không phân biệt được
    // mình bấm cái nào) vừa là lỗi React (trùng key trong choice-question.tsx).
    const bad: string[] = [];
    for (const b of built) {
      if (!("options" in b.item)) continue;
      const { options } = b.item;
      if (options.length !== 4 || new Set(options).size !== options.length) {
        bad.push(`buổi ${b.lesson} vị trí ${b.position} (${b.spec.kind}): ${JSON.stringify(options)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("câu đồng nghĩa: KHÔNG phương án nhiễu nào cũng là từ đồng nghĩa đúng", () => {
    // Đây là lỗi tệ nhất một app học có thể mắc: học viên chọn một đáp án
    // THẬT SỰ ĐÚNG và bị báo "Chưa đúng", cộng thêm một lần sai vào mastery.
    const bad: string[] = [];
    for (const b of built) {
      if (b.item.kind !== "synonym" || b.target === null) continue;
      const correct = b.target.synonyms[0]!;
      const alsoCorrect = b.item.options.filter(
        (o) => o !== correct && b.target!.synonyms.includes(o),
      );
      if (alsoCorrect.length > 0) {
        bad.push(
          `buổi ${b.lesson} vị trí ${b.position} "${b.target.word}" ` +
            `đồng nghĩa ${JSON.stringify(b.target.synonyms)} ` +
            `phương án ${JSON.stringify(b.item.options)}`,
        );
      }
    }
    expect(bad).toEqual([]);
  });

  it("câu nghĩa: đúng một phương án là nghĩa của từ đích", () => {
    const bad: string[] = [];
    for (const b of built) {
      if (b.item.kind !== "meaning" || b.target === null) continue;
      const hits = b.item.options.filter((o) => o === b.target!.meaningVi);
      if (hits.length !== 1) {
        bad.push(`buổi ${b.lesson} vị trí ${b.position} "${b.target.word}": ${hits.length} phương án đúng`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("câu điền từ: đúng MỘT chỗ trống trong câu", () => {
    // Lỗi từng lọt qua mọi lớp: câu hiện thành "___I___t___ ___i___s___…".
    const bad: string[] = [];
    for (const b of built) {
      if (b.item.kind !== "fill") continue;
      const blanks = b.item.sentence.match(/___/g) ?? [];
      if (blanks.length !== 1) {
        bad.push(`buổi ${b.lesson} vị trí ${b.position}: ${blanks.length} chỗ trống — ${b.item.sentence}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("thẻ gặp từ: câu ví dụ ĐẦY ĐỦ, không còn chỗ trống nào", () => {
    // Thẻ gặp từ là nơi DẠY, không phải nơi hỏi — hiện câu ví dụ bị khoét
    // rỗng thì học viên không học được gì từ nó.
    const bad: string[] = [];
    for (const b of built) {
      if (b.item.kind !== "flashcard") continue;
      const s = b.item.word.exampleEn;
      if (s.includes("___") || s.trim().length === 0) {
        bad.push(`buổi ${b.lesson} vị trí ${b.position} "${b.item.word.word}": ${JSON.stringify(s)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("thẻ gặp từ: có bản dịch tiếng Việt của câu ví dụ", () => {
    const bad = built
      .filter((b) => b.item.kind === "flashcard")
      .filter((b) => {
        const vi = (b.item as Extract<BuiltItem, { kind: "flashcard" }>).word.exampleVi;
        return typeof vi !== "string" || vi.trim().length === 0 || vi.includes("___");
      })
      .map((b) => `buổi ${b.lesson} vị trí ${b.position}`);
    expect(bad).toEqual([]);
  });

  it("thẻ gặp từ KHÔNG mang blankAnswer xuống trình duyệt", () => {
    for (const b of built) {
      if (b.item.kind !== "flashcard") continue;
      expect(b.item.word).not.toHaveProperty("blankAnswer");
    }
  });

  it("hai tính chất quan trọng nhất đứng vững với nhiều người học khác nhau", () => {
    // Hạt giống phụ thuộc userId, nên một người học khác nhìn thấy bộ phương
    // án khác. Một buổi sạch với một hạt giống không chứng minh được gì cho
    // hạt giống khác — quét thêm vài người nữa.
    for (const uid of ["seed-b", "seed-c", "seed-d", "seed-e"]) {
      for (const b of sweep(uid)) {
        if ("options" in b.item) {
          expect(new Set(b.item.options).size, `buổi ${b.lesson} vị trí ${b.position} (${uid})`).toBe(
            b.item.options.length,
          );
        }
        if (b.item.kind === "synonym" && b.target) {
          const correct = b.target.synonyms[0]!;
          const alsoCorrect = b.item.options.filter(
            (o) => o !== correct && b.target!.synonyms.includes(o),
          );
          expect(alsoCorrect, `buổi ${b.lesson} vị trí ${b.position} (${uid}) "${b.target.word}"`).toEqual([]);
        }
      }
    }
  });
});
