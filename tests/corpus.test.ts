/**
 * Dựng thẻ hiển thị cho CẢ 600 từ của chương trình từ chính
 * `data/clean/*.json` — kho nội dung THẬT đã seed lên database — rồi soi mọi
 * thứ người học sẽ nhìn thấy.
 *
 * VÌ SAO PHẢI CÓ TỆP NÀY. Lát 1b từng có một lỗi khiến MỌI câu điền từ hiển
 * thị vỡ vụn ("___I___t___ ___i___s___…") mà không lớp kiểm thử nào bắt được:
 * fixture của test đơn vị mô phỏng một kho dữ liệu KHÔNG TỒN TẠI, còn test
 * tích hợp thì không chạm tới nội dung hiển thị. Lỗi chỉ lộ ra khi có người mở
 * trình duyệt.
 *
 * Tệp này lấp đúng khoảng trống đó: không mô phỏng gì cả, không cần database.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderCard } from "@/lib/vocab/load-cards";
import type { VocabLite } from "@/lib/vocab/word";
import type { LessonPlan, VocabWord } from "@content/types";

const vocab = JSON.parse(readFileSync("data/clean/vocab.json", "utf8")) as VocabWord[];
const plan = JSON.parse(readFileSync("data/clean/lesson-plan.json", "utf8")) as LessonPlan[];
const byOrdinal = new Map(vocab.map((w) => [w.ordinal, w]));

/** Cùng hình dạng `toVocabLite` dựng từ một dòng database, nhưng lấy từ JSON.
    `blankAnswer` để rỗng vì đó đúng là thứ client đọc lên được. */
function lite(w: VocabWord): VocabLite {
  return {
    id: w.ordinal, word: w.word, pos: w.pos, ipa: w.ipa,
    meaningVi: w.meaningVi, definitionEn: w.definitionEn, synonyms: w.synonyms,
    exampleEn: w.exampleEn, exampleVi: w.exampleVi, blankAnswer: "",
  };
}

const cards = plan.flatMap((p) =>
  p.wordOrdinals.map((o) => {
    const source = byOrdinal.get(o);
    if (!source) throw new Error(`lesson-plan trỏ tới từ ${o} không có trong vocab.json`);
    return { source, card: renderCard(lite(source), source.blankAnswer, "") };
  }),
);

describe("toàn bộ thẻ từ dựng từ data/clean/", () => {
  it("dựng đủ 20 buổi × 30 từ = 600 thẻ, không từ nào lặp", () => {
    expect(plan).toHaveLength(20);
    expect(cards).toHaveLength(600);
    expect(new Set(cards.map((c) => c.card.id)).size).toBe(600);
  });

  it("không thẻ nào còn chỗ trống chưa điền", () => {
    for (const { card } of cards) expect(card.exampleEn).not.toContain("___");
  });

  it("mọi câu ví dụ NGUỒN có đúng một chỗ trống", () => {
    // Nếu một câu có hai "___" thì `.replace` chỉ điền cái đầu và thẻ vẫn lọt
    // qua phép kiểm trên — nên phải canh ở nguồn.
    for (const { source } of cards) {
      expect(source.exampleEn.split("___")).toHaveLength(2);
    }
  });

  it("điền blank_answer chứ không phải word", () => {
    const bienCach = cards.filter(({ source }) => source.blankAnswer !== source.word);
    // Nếu con số này về 0 thì phép kiểm dưới không còn kiểm gì cả. Đo được 183.
    expect(bienCach.length).toBeGreaterThan(100);

    for (const { source, card } of bienCach) {
      expect(card.exampleEn).toBe(source.exampleEn.replace("___", source.blankAnswer));
      expect(card.exampleEn).not.toBe(source.exampleEn.replace("___", source.word));
    }
  });

  it("mọi thẻ có bản dịch tiếng Việt của câu ví dụ", () => {
    for (const { card } of cards) expect(card.exampleVi.trim()).not.toBe("");
  });

  it("mọi thẻ có ít nhất một từ đồng nghĩa", () => {
    // Thẻ hiển thị dòng "Đồng nghĩa: …" không điều kiện; kho rỗng ở đây sẽ ra
    // một dòng cụt trên màn hình.
    for (const { card } of cards) expect(card.synonyms.length).toBeGreaterThan(0);
  });

  it("thẻ KHÔNG mang blankAnswer xuống trình duyệt", () => {
    for (const { card } of cards) {
      expect(Object.keys(card)).not.toContain("blankAnswer");
      // Và không lọt qua đường nào khác: chuỗi đáp án chỉ được xuất hiện bên
      // trong `exampleEn` đã điền, không phải như một trường riêng.
      expect(JSON.stringify(card)).not.toContain('"blankAnswer"');
    }
  });
});
