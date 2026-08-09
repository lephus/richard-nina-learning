import { describe, expect, it } from "vitest";
import { pickDistractors, buildItem } from "@/lib/lesson/build-item";
import type { VocabLite, GrammarLite, BuildContext } from "@/lib/lesson/build-item";

// exampleEn mô phỏng dữ liệu thật: Phase 0 đã khoét sẵn đúng một "___" khi
// dựng nội dung, và blankAnswer — chỉ dùng để chấm điểm ở server — không
// xuất hiện trong exampleEn (đã kiểm chứng trên cả 605 dòng vocab_words).
const w = (id: number, pos: string): VocabLite => ({
  id,
  word: `word${id}`,
  pos,
  ipa: `/w${id}/`,
  meaningVi: `nghĩa ${id}`,
  definitionEn: `definition ${id}`,
  synonyms: [`syn${id}`],
  exampleEn: `A ___ sentence for item ${id}.`,
  exampleVi: `Một câu ví dụ cho mục ${id}.`,
  blankAnswer: `answer${id}`,
});

/** Bậc 3 nay LƯỜI — truyền vào dạng hàm, và chỉ được gọi khi bậc 1+2 thiếu. */
const bankOf = (words: readonly VocabLite[]) => () => words;
/** Cấu hình mặc định của câu nghĩa: phân biệt theo CHỮ HIỂN THỊ, không theo id. */
const byMeaning = (target: VocabLite, bank?: readonly VocabLite[]) => ({
  textOf: (c: VocabLite) => c.meaningVi,
  taken: [target.meaningVi],
  ...(bank ? { bank: bankOf(bank) } : {}),
});

// 30 từ: 20 danh từ (id 1..20), 9 động từ (21..29), 1 giới từ (30)
const lessonWords: VocabLite[] = [
  ...Array.from({ length: 20 }, (_, i) => w(i + 1, "n")),
  ...Array.from({ length: 9 }, (_, i) => w(i + 21, "v")),
  w(30, "prep"),
];
const bank: VocabLite[] = [...lessonWords, ...Array.from({ length: 50 }, (_, i) => w(i + 100, "adj"))];

describe("pickDistractors", () => {
  it("lấy đủ 3 phương án và không bao giờ lấy chính từ đích", () => {
    const target = lessonWords[0]!;
    const picked = pickDistractors(target, lessonWords, 42, byMeaning(target, bank));
    expect(picked).toHaveLength(3);
    expect(picked.some((p) => p.id === target.id)).toBe(false);
  });

  it("bậc 1: ưu tiên từ cùng buổi cùng loại từ", () => {
    const target = lessonWords[0]!; // danh từ, còn 19 danh từ khác cùng buổi
    const picked = pickDistractors(target, lessonWords, 42, byMeaning(target, bank));
    expect(picked.every((p) => p.pos === "n")).toBe(true);
  });

  it("bậc 2: hết từ cùng loại thì lấy từ khác loại trong cùng buổi", () => {
    // Giới từ chỉ có 1 từ trong buổi — toàn kho thật cũng chỉ có 2 giới từ.
    const target = lessonWords[29]!;
    expect(target.pos).toBe("prep");
    const picked = pickDistractors(target, lessonWords, 42, byMeaning(target, bank));
    expect(picked).toHaveLength(3);
    expect(picked.every((p) => lessonWords.some((l) => l.id === p.id))).toBe(true);
  });

  it("bậc 3: buổi quá nhỏ thì mở rộng ra toàn kho", () => {
    const tiny = [lessonWords[0]!, lessonWords[1]!];
    const got = pickDistractors(tiny[0]!, tiny, 42, byMeaning(tiny[0]!, bank));
    expect(got).toHaveLength(3);
    expect(got.some((p) => !tiny.some((t) => t.id === p.id))).toBe(true);
  });

  it("tất định: cùng seed luôn cho cùng kết quả", () => {
    const a = pickDistractors(lessonWords[0]!, lessonWords, 7, byMeaning(lessonWords[0]!, bank));
    const b = pickDistractors(lessonWords[0]!, lessonWords, 7, byMeaning(lessonWords[0]!, bank));
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });

  it("seed khác thì kết quả khác", () => {
    const a = pickDistractors(lessonWords[0]!, lessonWords, 1, byMeaning(lessonWords[0]!, bank));
    const b = pickDistractors(lessonWords[0]!, lessonWords, 999, byMeaning(lessonWords[0]!, bank));
    expect(a.map((x) => x.id)).not.toEqual(b.map((x) => x.id));
  });

  it("không lấy ứng viên trùng CHỮ HIỂN THỊ với đáp án đúng, dù khác id", () => {
    // 17 chuỗi meaningVi trong kho thật bị hai dòng khác nhau dùng chung. Lọc
    // theo id thì hai dòng đó vẫn hiện ra hai nút y hệt nhau, và một trong hai
    // nút "đúng" bị chấm sai.
    const target = w(1, "n");
    const clone = { ...w(2, "n"), meaningVi: target.meaningVi };
    const pool = [target, clone, w(3, "n"), w(4, "n"), w(5, "n")];
    const picked = pickDistractors(target, pool, 42, byMeaning(target));
    expect(picked).toHaveLength(3);
    expect(picked.some((p) => p.meaningVi === target.meaningVi)).toBe(false);
  });

  it("không lấy hai ứng viên trùng chữ hiển thị với nhau", () => {
    const target = w(1, "n");
    const twins = [w(2, "n"), w(3, "n")].map((x) => ({ ...x, meaningVi: "trùng nhau" }));
    const pool = [target, ...twins, w(4, "n"), w(5, "n")];
    const picked = pickDistractors(target, pool, 42, byMeaning(target));
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((p) => p.meaningVi)).size).toBe(3);
  });

  it("bậc 3 là LƯỜI: bậc 1+2 đủ thì không đụng tới kho", () => {
    // Đây là lý do bỏ được truy vấn tải 605 từ ở loadContext: mỗi buổi 30 từ
    // nên bậc 1+2 luôn có 29 ứng viên cho 3 chỗ.
    let calls = 0;
    const picked = pickDistractors(lessonWords[0]!, lessonWords, 42, {
      textOf: (c) => c.meaningVi,
      taken: [lessonWords[0]!.meaningVi],
      bank: () => {
        calls++;
        return bank;
      },
    });
    expect(picked).toHaveLength(3);
    expect(calls).toBe(0);
  });
});

const grammar: GrammarLite[] = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  stem: `Grammar question ${i + 1}?`,
  options: ["A1", "B1", "C1", "D1"],
}));

const ctx: BuildContext = { lessonWords, grammar, seed: 12345, grammarLessonId: 7, bank: bankOf(bank) };

describe("buildItem", () => {
  it("thẻ gặp từ mang đủ dữ liệu hiển thị và không có phương án", () => {
    const item = buildItem({ kind: "flashcard", index: 3 }, ctx);
    expect(item.kind).toBe("flashcard");
    if (item.kind !== "flashcard") throw new Error("sai nhánh");
    expect(item.word.id).toBe(lessonWords[3]!.id);
  });

  it("thẻ gặp từ không mang blankAnswer xuống client", () => {
    const item = buildItem({ kind: "flashcard", index: 3 }, ctx);
    if (item.kind !== "flashcard") throw new Error("sai nhánh");
    expect(item.word).not.toHaveProperty("blankAnswer");
  });

  it("câu nghĩa có 4 phương án, trong đó đúng một phương án là nghĩa đúng", () => {
    const item = buildItem({ kind: "meaning", index: 0 }, ctx);
    if (item.kind !== "meaning") throw new Error("sai nhánh");
    expect(item.options).toHaveLength(4);
    expect(item.options.filter((o) => o === lessonWords[0]!.meaningVi)).toHaveLength(1);
  });

  it("câu đồng nghĩa có 4 phương án và chứa từ đồng nghĩa của từ đích", () => {
    const item = buildItem({ kind: "synonym", index: 0 }, ctx);
    if (item.kind !== "synonym") throw new Error("sai nhánh");
    expect(item.options).toHaveLength(4);
    expect(item.options).toContain(lessonWords[0]!.synonyms[0]);
  });

  it("câu điền dùng nguyên văn exampleEn đã khoét sẵn từ Phase 0, không khoét lại", () => {
    // exampleEn trong dữ liệu thật đã chứa đúng một "___" — buildItem không
    // được tự khoét thêm (đó chính là lỗi từng khiến "___" chen vào giữa
    // mọi ký tự khi blankAnswer là chuỗi rỗng, xem RegExp("", "gi")).
    const item = buildItem({ kind: "fill", index: 0 }, ctx);
    if (item.kind !== "fill") throw new Error("sai nhánh");
    expect(item.sentence).toBe(lessonWords[0]!.exampleEn);
    expect(item.sentence.match(/___/g)).toHaveLength(1);
  });

  it("câu điền giữ nguyên exampleEn ngay cả khi blankAnswer rỗng — đường đi công khai qua toVocabLite", () => {
    // `toVocabLite` (build-item.ts, dùng ở cả session.ts lẫn freshSpecs của
    // assessment/run.ts) mặc định blankAnswer: "" — session.ts nay GHI ĐÈ
    // giá trị thật lên đó cho ctx.lessonWords của một buổi (qua RPC
    // blank_answers_for_lesson), nhưng freshSpecs của bài đánh giá thì không,
    // nên nhánh blankAnswer rỗng vẫn là một ca thật, không phải giả định lỗi
    // thời. Đây mới là ca thật gây lỗi: blankOut cũ dùng RegExp("", "gi")
    // khớp ở MỌI vị trí khi answer rỗng, chèn "___" xen giữa từng ký tự. Bài
    // test ở trên (blankAnswer không rỗng và không xuất hiện trong exampleEn)
    // KHÔNG phát hiện được lỗi này — với answer không rỗng và không khớp,
    // blankOut cũ chỉ là no-op, không splice.
    const word: VocabLite = {
      id: 999,
      word: "resume",
      pos: "n",
      ipa: "/ˈrezəmeɪ/",
      meaningVi: "bản sơ yếu lý lịch",
      definitionEn: "a written record of your education and the jobs you have done",
      synonyms: ["summary"],
      exampleEn: "Fax your ___ and cover letter to the above number.",
      exampleVi: "Hãy gửi sơ yếu lý lịch của bạn và thư xin việc đến số điện thoại trên.",
      blankAnswer: "", // đúng như toVocabLite gửi mặc định
    };
    const localCtx: BuildContext = {
      lessonWords: [word], grammar: [], seed: 1, grammarLessonId: 1,
    };
    const item = buildItem({ kind: "fill", index: 0 }, localCtx);
    if (item.kind !== "fill") throw new Error("sai nhánh");
    expect(item.sentence).toBe(word.exampleEn);
  });

  it("10 câu chốt buổi lấy từ cả 30 từ và không trùng nhau", () => {
    const ids = Array.from({ length: 10 }, (_, i) => {
      const item = buildItem({ kind: "final-meaning", index: i }, ctx);
      if (item.kind !== "meaning") throw new Error("chốt buổi phải là câu nghĩa");
      return item.wordId;
    });
    expect(new Set(ids).size).toBe(10);
  });

  it("5 câu ngữ pháp lấy từ kho câu hỏi của bài và không trùng nhau", () => {
    const ids = Array.from({ length: 5 }, (_, i) => {
      const item = buildItem({ kind: "grammar", index: i }, ctx);
      if (item.kind !== "grammar") throw new Error("sai nhánh");
      return item.questionId;
    });
    expect(new Set(ids).size).toBe(5);
  });

  it("tất định: dựng lại cùng vị trí cho cùng phương án", () => {
    const a = buildItem({ kind: "meaning", index: 5 }, ctx);
    const b = buildItem({ kind: "meaning", index: 5 }, ctx);
    expect(a).toEqual(b);
  });

  it("câu nghĩa và câu đồng nghĩa của cùng một từ (cùng index) không dùng chung hoán vị phương án", () => {
    // item-plan.ts cố ý cho meaning và synonym của cùng một từ chung index.
    // Nếu seed chỉ phụ thuộc index (bỏ qua kind), seededShuffle sẽ cho ra
    // cùng một hoán vị 4 phần tử cho cả hai câu — đáp án đúng luôn rơi vào
    // cùng một vị trí, học viên đoán được câu sau mà không cần biết nghĩa.
    const meaning = buildItem({ kind: "meaning", index: 0 }, ctx);
    const synonym = buildItem({ kind: "synonym", index: 0 }, ctx);
    if (meaning.kind !== "meaning") throw new Error("sai nhánh");
    if (synonym.kind !== "synonym") throw new Error("sai nhánh");

    const meaningPos = meaning.options.indexOf(lessonWords[0]!.meaningVi);
    const synonymPos = synonym.options.indexOf(lessonWords[0]!.synonyms[0]!);
    expect(meaningPos).not.toBe(-1);
    expect(synonymPos).not.toBe(-1);
    expect(meaningPos).not.toBe(synonymPos);
  });

  it("thẻ gặp từ điền lại BLANKANSWER (không phải word) vào chỗ trống — câu ví dụ hiện ra ĐẦY ĐỦ", () => {
    // Phase 0 khoét "___" vào cả 605 câu ví dụ để phục vụ câu điền từ. Thẻ
    // gặp từ là nơi DẠY, không phải nơi hỏi, nên nó phải điền ngược lại —
    // bằng CHÍNH chuỗi đã bị khoét ra (`blankAnswer`), không phải `word`: hai
    // giá trị này khác nhau ở 169/605 từ thật (word "opening", blankAnswer
    // "openings"), và điền nhầm `word` cho ra câu sai ngữ pháp nhẹ.
    const item = buildItem({ kind: "flashcard", index: 3 }, ctx);
    if (item.kind !== "flashcard") throw new Error("sai nhánh");
    expect(item.word.exampleEn).not.toContain("___");
    expect(item.word.exampleEn).toBe(`A ${lessonWords[3]!.blankAnswer} sentence for item 4.`);
    expect(item.word.exampleEn).not.toBe(`A ${lessonWords[3]!.word} sentence for item 4.`);
    expect(item.word.exampleVi).toBe(lessonWords[3]!.exampleVi);
  });

  it("thẻ gặp từ không đụng tới exampleEn dùng cho câu điền từ", () => {
    // Chỉ bản sao trong item bị điền, ctx.lessonWords phải còn nguyên — nếu
    // không, câu điền từ ở cùng buổi sẽ mất chỗ trống.
    buildItem({ kind: "flashcard", index: 3 }, ctx);
    const fill = buildItem({ kind: "fill", index: 3 }, ctx);
    if (fill.kind !== "fill") throw new Error("sai nhánh");
    expect(fill.sentence).toContain("___");
  });

  it("câu đồng nghĩa: KHÔNG phương án nhiễu nào cũng là đồng nghĩa của từ đích", () => {
    // Lỗi thật đã đo được trên kho 605 từ: "revolutionary" (đồng nghĩa
    // groundbreaking, innovative) từng được chào cả hai từ đó làm phương án
    // nhiễu, nên chọn đúng vẫn bị báo "Chưa đúng" + một wrong_count oan.
    const target: VocabLite = { ...w(1, "n"), synonyms: ["alpha", "beta"] };
    const pool = [
      target,
      { ...w(2, "n"), word: "beta" },
      { ...w(3, "n"), word: "gamma" },
      { ...w(4, "n"), word: "delta" },
      { ...w(5, "n"), word: "epsilon" },
    ];
    const localCtx: BuildContext = {
      lessonWords: pool, grammar: [], seed: 99, grammarLessonId: 1,
    };
    const item = buildItem({ kind: "synonym", index: 0 }, localCtx);
    if (item.kind !== "synonym") throw new Error("sai nhánh");
    expect(item.options).toContain("alpha");
    expect(item.options).not.toContain("beta");
  });

  it("câu đồng nghĩa: loại cả ứng viên NHẬN từ đích làm đồng nghĩa của mình", () => {
    // Chiều ngược lại: "eligible" liệt kê "qualified" nên nó cũng là một đáp
    // án đúng cho câu hỏi về "qualified", dù "qualified" không liệt kê nó.
    // 17 cặp như vậy nằm chung buổi trong kho thật.
    const target: VocabLite = { ...w(1, "n"), word: "qualified", synonyms: ["skilled"] };
    const mirror: VocabLite = { ...w(2, "n"), word: "eligible", synonyms: ["qualified", "suitable"] };
    const pool = [
      target,
      mirror,
      { ...w(3, "n"), word: "gamma" },
      { ...w(4, "n"), word: "delta" },
      { ...w(5, "n"), word: "epsilon" },
    ];
    const localCtx: BuildContext = {
      lessonWords: pool, grammar: [], seed: 3, grammarLessonId: 1,
    };
    const item = buildItem({ kind: "synonym", index: 0 }, localCtx);
    if (item.kind !== "synonym") throw new Error("sai nhánh");
    expect(item.options).toHaveLength(4);
    expect(item.options).not.toContain("eligible");
  });
});
