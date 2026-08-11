import { seededShuffle } from "@content/shuffle-options";
import type { VocabLite } from "@/lib/vocab/word";

export interface DistractorOptions {
  /**
   * Chữ HIỂN THỊ trên nút của một ứng viên: `meaningVi` với câu nghĩa, `word`
   * với câu đồng nghĩa. Lọc theo `id` là không đủ — hai dòng khác id vẫn hiện
   * ra hai nút y hệt nhau (17 chuỗi `meaningVi` bị hai dòng dùng chung).
   */
  textOf: (candidate: VocabLite) => string;
  /**
   * Những chữ đã bị chiếm và KHÔNG được xuất hiện thêm lần nào: đáp án đúng,
   * và với câu đồng nghĩa là TOÀN BỘ `target.synonyms`.
   */
  taken: readonly string[];
  /** Lý do loại riêng của từng loại câu, xét trên chính ứng viên. */
  reject?: (candidate: VocabLite) => boolean;
  /** Bậc 3 — xem BuildContext.bank. Không truyền thì bỏ qua bậc 3. */
  bank?: () => readonly VocabLite[];
  count?: number;
}

/**
 * Ba bậc dự phòng, theo thứ tự ưu tiên:
 *   1. cùng buổi, cùng loại từ   — khó nhất, ép phân biệt thật
 *   2. cùng buổi, khác loại từ
 *   3. toàn kho 605 từ (lười, xem BuildContext.bank)
 *
 * Bậc 2 không phải phòng xa lý thuyết: toàn kho chỉ có 2 giới từ, nên một
 * buổi chứa giới từ sẽ cạn bậc 1 ngay lập tức.
 *
 * ĐIỀU KIỆN LOẠI ỨNG VIÊN là phần quan trọng nhất của hàm này. Loại theo `id`
 * một mình từng khiến app CHẤM SAI CÂU TRẢ LỜI ĐÚNG: 185/605 từ trong kho có
 * một từ đồng nghĩa mà chính nó cũng là một từ khác trong kho, nên "phương án
 * nhiễu" đôi khi là một đáp án thật sự đúng (`revolutionary` → nhiễu
 * `innovative` trong khi `innovative` nằm ngay trong synonyms của nó). Ứng
 * viên bị loại khi: trùng chính từ đích, trùng CHỮ HIỂN THỊ với đáp án đúng,
 * trùng chữ hiển thị với một phương án đã chọn, hoặc bị `reject` gạt.
 */
export function pickDistractors(
  target: VocabLite,
  lessonWords: readonly VocabLite[],
  seed: number,
  opts: DistractorOptions,
): VocabLite[] {
  const count = opts.count ?? 3;
  const rejected = opts.reject ?? (() => false);
  const eligible = (x: VocabLite): boolean => x.id !== target.id && !rejected(x);

  const used = new Set(opts.taken);
  const out: VocabLite[] = [];

  const consider = (pool: readonly VocabLite[]): void => {
    if (out.length >= count) return;
    for (const candidate of seededShuffle(pool, seed)) {
      const text = opts.textOf(candidate);
      if (used.has(text)) continue;
      used.add(text);
      out.push(candidate);
      if (out.length >= count) return;
    }
  };

  consider(lessonWords.filter((x) => eligible(x) && x.pos === target.pos));
  consider(lessonWords.filter((x) => eligible(x) && x.pos !== target.pos));

  // Bậc 3 chỉ dựng khi thật sự cần — với buổi 30 từ thì không bao giờ tới đây.
  if (out.length < count && opts.bank) {
    const inLesson = new Set(lessonWords.map((x) => x.id));
    consider(opts.bank().filter((x) => eligible(x) && !inLesson.has(x.id)));
  }

  // Lớp bảo vệ thứ hai: corpus test (tests/corpus.test.ts) đã canh hết mọi
  // buổi trong data/clean/ hiện có, nhưng canh đó chỉ chạy trên dữ liệu ĐÃ
  // qua CI — không chặn được dữ liệu thêm sau này (buổi mới, kho từ mở rộng)
  // mà chưa từng chạy qua corpus test. Khi bậc 1+2(+3) không đủ ứng viên,
  // vòng lặp trong `consider` không cắt bớt gì cả — nó chỉ đơn giản HẾT phần
  // tử để duyệt rồi thoát, `out` lặng lẽ NGẮN HƠN `count` mà không có tín
  // hiệu nào báo cho người gọi. Không có guard này, `meaningItem`/nhánh
  // synonym nhận về ít hơn `count` phương án mà không biết, dựng ra một câu
  // hỏi có ít hơn 4 lựa chọn thay vì báo lỗi ngay tại chỗ sai.
  if (out.length < count) {
    throw new Error(
      `pickDistractors: từ "${target.word}" (id ${target.id}) chỉ tìm được ` +
        `${out.length}/${count} phương án nhiễu`,
    );
  }

  return out;
}
