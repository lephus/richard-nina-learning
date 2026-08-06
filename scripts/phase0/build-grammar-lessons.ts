import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GrammarLesson } from "../../src/content/types.js";

// Task 7: chia 14 file ngu phap trong data/raw/grammar/*.md thanh dung 20 bai
// hoc. Cac file lon duoc tach theo ranh gioi chu de tu nhien co san trong tai
// lieu goc (tieu de muc, bang so sanh tron ven) - xem task-7-report.md de biet
// ly do chon tung diem tach.

const SRC = "data/raw/grammar";
const OUT = "data/clean/grammar.json";

/** Cat theo so dong 1-indexed, dong dau va dong cuoi deu duoc giu (inclusive). */
function lines(content: string, from: number, to?: number): string {
  const all = content.split("\n");
  const end = to ?? all.length;
  return all.slice(from - 1, end).join("\n").trim();
}

interface LessonSpec {
  ordinal: number;
  slug: string;
  title: string;
  summary: string;
  sourceFile: string;
  /** Neu vang mat: lay toan bo file. Neu co: noi cac doan [from, to] lai (to = het file khi bo qua). */
  ranges?: Array<[number, number | undefined]>;
}

const specs: LessonSpec[] = [
  {
    ordinal: 1,
    slug: "cau-truc-cau",
    title: "Cấu trúc chung của một câu tiếng Anh",
    summary:
      "Bài học giới thiệu 5 thành phần cốt lõi của một câu tiếng Anh: chủ ngữ, động từ, bổ ngữ, tân ngữ và trạng ngữ. Đây là nền tảng để hiểu mọi cấu trúc ngữ pháp phức tạp hơn ở các bài sau.",
    sourceFile: "on-dh-cau-truc-chung-cua-mot-cau.md",
  },
  {
    ordinal: 2,
    slug: "tinh-tu-va-trang-tu",
    title: "Tính từ và trạng từ",
    summary:
      "Bài học phân biệt chức năng bổ ngữ và bổ nghĩa của tính từ, trạng từ, đồng thời hệ thống các loại tính từ (mô tả, sở hữu, chỉ định, phân bổ) và vị trí thường gặp của chúng trong câu. Ngoài ra bài học còn tổng hợp các đuôi tính từ/trạng từ thường gặp và danh sách động từ nối.",
    sourceFile: "li-thuyet-tinh-tu-va-trang-tu.md",
  },
  {
    ordinal: 3,
    slug: "dai-tu",
    title: "Đại từ: nhân xưng, sở hữu, phản thân, phân bổ và bất định",
    summary:
      "Bài học hệ thống các loại đại từ trong tiếng Anh: đại từ nhân xưng, đại từ sở hữu, đại từ phản thân/nhấn mạnh, đại từ phân bổ (all, most, each, both, either, neither) và đại từ bất định (some, any, none, something, everyone...). Mỗi loại đi kèm cấu trúc và ví dụ minh hoạ cụ thể.",
    sourceFile: "dai-tu.md",
  },
  {
    ordinal: 4,
    slug: "thi-hien-tai-va-qua-khu",
    title: "Thì hiện tại đơn, hiện tại tiếp diễn, quá khứ đơn, quá khứ tiếp diễn",
    summary:
      "Bài học trình bày công thức, cách dùng và dấu hiệu nhận biết của bốn thì cơ bản: hiện tại đơn, hiện tại tiếp diễn, quá khứ đơn và quá khứ tiếp diễn, kèm phân biệt used to/be used to/get used to. Bài học có phần bài tập chia động từ để luyện tập ngay.",
    sourceFile: "tenses.md",
    ranges: [[1, 430]],
  },
  {
    ordinal: 5,
    slug: "thi-hoan-thanh",
    title: "Thì hiện tại hoàn thành và quá khứ hoàn thành",
    summary:
      "Bài học trình bày công thức, cách dùng, dấu hiệu nhận biết của thì hiện tại hoàn thành (tiếp diễn) và quá khứ hoàn thành (tiếp diễn), cùng cách phân biệt các cặp thì dễ nhầm như have been to/have gone to hay quá khứ đơn với hiện tại hoàn thành. Bài học có nhiều bài tập chia thì và viết lại câu.",
    sourceFile: "tenses.md",
    ranges: [[431, 1109]],
  },
  {
    ordinal: 6,
    slug: "thi-tuong-lai",
    title: "Thì tương lai đơn, tương lai tiếp diễn và tương lai hoàn thành",
    summary:
      "Bài học trình bày công thức và cách dùng của thì tương lai đơn, tương lai tiếp diễn, be going to và tương lai hoàn thành (tiếp diễn), giúp phân biệt các cách diễn đạt ý định và dự đoán trong tương lai. Bài học kèm bài tập chia thì thực hành.",
    sourceFile: "tenses.md",
    ranges: [[1110, undefined]],
  },
  {
    ordinal: 7,
    slug: "dong-tu-khiem-khuyet",
    title: "Động từ khiếm khuyết (Modal verbs)",
    summary:
      "Bài học trình bày cách dùng của các động từ khiếm khuyết must, have to, can/could, và cấu trúc modal + have + P.P để diễn tả suy đoán về quá khứ. Bài học kèm 25 câu trắc nghiệm để luyện tập ngay.",
    sourceFile: "on-dh-modal-verbs-copy.md",
  },
  {
    ordinal: 8,
    slug: "su-hoa-hop-chu-ngu-dong-tu",
    title: "Sự hoà hợp giữa chủ ngữ và động từ",
    summary:
      "Bài học hệ thống các quy tắc chia động từ theo chủ ngữ trong những trường hợp đặc biệt: hai danh từ nối bằng and/or/of, danh từ tận cùng bằng s nhưng chia số ít, danh từ tập hợp chia số nhiều, và cách chia theo either...or, as well as... Mỗi quy tắc có ví dụ minh hoạ đi kèm.",
    sourceFile: "on-dh-su-hoa-hop-giua-chu-ngu-va-dong-tu.md",
  },
  {
    ordinal: 9,
    slug: "so-sanh",
    title: "Các cấu trúc so sánh trong tiếng Anh",
    summary:
      "Bài học trình bày đầy đủ ba dạng so sánh cơ bản (so sánh bằng, so sánh hơn kém, so sánh nhất) cùng các dạng so sánh nâng cao như so sánh kép (càng...càng), so sánh lặp và so sánh bội. Mỗi cấu trúc có công thức, quy tắc biến đổi tính từ/trạng từ và ví dụ song ngữ.",
    sourceFile: "so-sanh.md",
  },
  {
    ordinal: 10,
    slug: "cau-bi-dong",
    title: "Câu bị động (Passive voice)",
    summary:
      "Bài học trình bày quy tắc chuyển câu chủ động sang bị động qua các thì, cùng những trường hợp đặc biệt như bị động của cấu trúc nhờ vả (have/get), bị động của động từ tri giác, và bị động của make/let. Bảng công thức bị động theo từng thì giúp tra cứu nhanh.",
    sourceFile: "on-dh-bi-dong.md",
  },
  {
    ordinal: 11,
    slug: "mao-tu-ly-thuyet",
    title: "Mạo từ A/An/The: quy tắc dùng và không dùng",
    summary:
      "Bài học hệ thống hơn 25 trường hợp dùng mạo từ 'the' và các trường hợp không dùng mạo từ, kèm bài thơ mạo từ giúp ghi nhớ nhanh quy tắc. Bảng danh mục địa danh, tổ chức, báo chí thường đi kèm 'the' được tổng hợp cuối bài.",
    sourceFile: "on-dh-articles-mao-tu.md",
    ranges: [[1, 348]],
  },
  {
    ordinal: 12,
    slug: "mao-tu-luyen-tap",
    title: "Luyện tập mạo từ A/An/The",
    summary:
      "Bài học gồm các bài tập điền mạo từ thích hợp vào chỗ trống ở nhiều dạng câu và đoạn văn khác nhau, giúp củng cố quy tắc dùng the/a/an đã học ở bài lý thuyết. Nội dung bao gồm nhiều bộ bài tập bổ sung để luyện tập sâu hơn.",
    sourceFile: "on-dh-articles-mao-tu.md",
    ranges: [[349, undefined]],
  },
  {
    ordinal: 13,
    slug: "dong-tu-nguyen-mau-danh-dong-tu-ly-thuyet",
    title: "Động từ nguyên mẫu (to-infinitive) và danh động từ (V-ing): lý thuyết",
    summary:
      "Bài học phân biệt chức năng và cách dùng của động từ nguyên mẫu có to, động từ nguyên mẫu không to và danh động từ V-ing, cùng danh sách động từ/tính từ/giới từ đi kèm từng dạng. Bài học còn trình bày cấu trúc nhờ vả have/get và các trường hợp to-inf hay V-ing làm thay đổi nghĩa của động từ.",
    sourceFile: "on-dh-inf-ving.md",
    ranges: [[1, 270]],
  },
  {
    ordinal: 14,
    slug: "dong-tu-nguyen-mau-danh-dong-tu-luyen-tap",
    title: "Luyện tập động từ nguyên mẫu và danh động từ",
    summary:
      "Bài học gồm nhiều dạng bài tập: chia đúng dạng động từ trong ngoặc, viết lại câu, dựng câu hoàn chỉnh và chọn đáp án đúng, giúp củng cố kiến thức về to-infinitive và V-ing đã học ở bài lý thuyết. Đây là phần thực hành trọng tâm trước khi chuyển sang chủ đề mệnh đề quan hệ.",
    sourceFile: "on-dh-inf-ving.md",
    ranges: [[271, undefined]],
  },
  {
    ordinal: 15,
    slug: "menh-de-quan-he",
    title: "Mệnh đề quan hệ (Relative clauses)",
    summary:
      "Bài học trình bày các đại từ quan hệ (who, whom, which, that, whose) và trạng từ quan hệ (why, where, when) dùng để nối và bổ nghĩa cho danh từ đứng trước. Bài học phân biệt mệnh đề quan hệ xác định và không xác định cùng các trường hợp bắt buộc hoặc không được dùng that.",
    sourceFile: "on-dh-menh-de-quan-he.md",
  },
  {
    ordinal: 16,
    slug: "cau-dieu-kien-loai-1-2-3",
    title: "Câu điều kiện loại 1, 2, 3 và câu điều kiện hỗn hợp",
    summary:
      "Bài học trình bày công thức và cách dùng của câu điều kiện loại 1, 2, 3, câu điều kiện loại 0, câu điều kiện hỗn hợp, cùng cách đảo ngữ và các từ thay thế if như unless, provided that, without. Bài học có nhiều ví dụ song ngữ để làm rõ từng loại điều kiện.",
    sourceFile: "on-dh-cau-dieu-kien.md",
    ranges: [[1, 280]],
  },
  {
    ordinal: 17,
    slug: "cau-mong-uoc-wish-va-luyen-tap-dieu-kien",
    title: "Câu mong ước WISH/IF ONLY và luyện tập câu điều kiện",
    summary:
      "Bài học trình bày ba dạng câu mong ước với wish/if only ở tương lai, hiện tại và quá khứ, gắn liền với kiến thức câu điều kiện đã học ở bài trước. Bài học có bộ bài tập trắc nghiệm và chia dạng động từ kèm đáp án chi tiết để tự kiểm tra.",
    sourceFile: "on-dh-cau-dieu-kien.md",
    ranges: [[281, undefined]],
  },
  {
    ordinal: 18,
    slug: "dao-ngu-cau-dieu-kien-va-dieu-kien-an",
    title: "Ôn nhanh câu điều kiện, đảo ngữ và câu điều kiện ẩn",
    summary:
      "Bài học mở đầu bằng bảng ôn nhanh công thức loại 1, 2, 3 và hỗn hợp, sau đó đi sâu vào cách đảo ngữ câu điều kiện (Should/Were/Had đứng đầu câu) và câu điều kiện ẩn dùng with, without, otherwise, but for thay cho mệnh đề if đầy đủ. Bài học kèm bộ 60 câu trắc nghiệm để luyện nhận diện các dạng biến thể này.",
    sourceFile: "on-dh-cau-dieu-kien-wish-would-rather.md",
    // Ghep muc dao ngu/dieu kien an (ly thuyet) voi bai tap trac nghiem cung
    // chu de (Bai tap A) dang nam o cuoi file, de bai hoc la mot don vi tron
    // ven "hoc xong - luyen ngay" thay vi tach roi ly thuyet khoi bai tap
    // tuong ung cua no. Xem task-7-report.md.
    ranges: [
      [1, 104],
      [297, 453],
    ],
  },
  {
    ordinal: 19,
    slug: "wish-nang-cao-va-would-rather",
    title: "WISH nâng cao và WOULD RATHER",
    summary:
      "Bài học mở rộng cách dùng wish với to-V, wish + N và wish + O + to-V, đồng thời trình bày would rather cho câu một chủ ngữ và would rather that cho câu hai chủ ngữ ở hiện tại và quá khứ. Bài học có bài tập chia dạng động từ với wish và viết lại câu với would rather.",
    sourceFile: "on-dh-cau-dieu-kien-wish-would-rather.md",
    ranges: [
      [105, 296],
      [454, undefined],
    ],
  },
  {
    ordinal: 20,
    slug: "cau-tuong-thuat",
    title: "Câu tường thuật (Reported speech)",
    summary:
      "Bài học trình bày quy tắc đổi ngôi, lùi thì và đổi trạng từ chỉ thời gian/nơi chốn khi chuyển câu trực tiếp sang câu gián tiếp, áp dụng cho câu trần thuật, câu hỏi, câu mệnh lệnh và cả câu điều kiện. Bài học có hơn 80 câu bài tập viết lại theo lối gián tiếp để luyện tập.",
    sourceFile: "on-dh-reported-speech.md",
  },
];

const fileCache = new Map<string, string>();
function readSource(name: string): string {
  let content = fileCache.get(name);
  if (!content) {
    content = readFileSync(join(SRC, name), "utf8");
    fileCache.set(name, content);
  }
  return content;
}

const lessons: GrammarLesson[] = specs.map((spec) => {
  const content = readSource(spec.sourceFile);
  const body = spec.ranges
    ? spec.ranges.map(([from, to]) => lines(content, from, to)).join("\n\n")
    : content.trim();
  return {
    ordinal: spec.ordinal,
    slug: spec.slug,
    title: spec.title,
    summary: spec.summary,
    contentMd: `# ${spec.title}\n\n${body}`,
    sourceFile: spec.sourceFile,
  };
});

mkdirSync("data/clean", { recursive: true });
writeFileSync(OUT, JSON.stringify(lessons, null, 2) + "\n");

for (const l of lessons) {
  console.log(
    `${l.ordinal}. ${l.slug} <- ${l.sourceFile} (${l.contentMd.split(/\s+/).length} tu)`
  );
}
console.log(`Da ghi ${lessons.length} bai vao ${OUT}`);
