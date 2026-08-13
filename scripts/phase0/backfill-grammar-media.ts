import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";

// Vong soat cuoi lat 2d (finding 4): 3/20 bai (ordinal 2, 11, 13) co
// <img src="media/imageN.ext"> trong content_html. Pandoc tu sinh tham chieu
// nay khi markdown nguon co anh nhung, nhung 03-extract-grammar.ts (buoc
// trich .docx -> markdown tho, chay TRUOC ca lat nay) khong tung goi
// --extract-media — khong file anh nao ton tai tren dia, va repo nay khong co
// thu muc public/ nao — moi src do 404 THAT. Bai 11 va 13 moi bai chi co
// DUNG MOT anh nhung chiem tron mot trang: mot bang tong hop lon (bang phan
// loai mao tu / bang dong tu di kem V-ing, to-V) — rat co the la phan lon gia
// tri cua ca bai, khong phai anh trang tri.
//
// Script nay CHI trich anh ra dia duoi public/grammar-media/<ordinal>/media/
// — KHONG dong vao data/clean/grammar.json, va KHONG ghi vao Supabase. Ly do
// co tinh, khong phai thieu sot:
//   1. `data/clean/grammar.json` la nguon doi chieu cua
//      `tests/db-integrity.test.ts` (khang dinh content_html cua DATABASE
//      THAT khop BYTE-FOR-BYTE voi contentHtml trong file nay). Sua file nay
//      ma KHONG day duoc len database (moi truong chay vong soat cuoi tu
//      choi cho phep ghi vao Supabase, da thu that voi ca script co san tu
//      truoc — backfill-grammar-html.ts — khong rieng gi script moi nay) se
//      lam do chinh bai test integrity do.
//   2. Duong src that duoc va o TANG RENDER thay vao do — xem
//      `src/lib/content/fix-image-src.ts`, goi tu
//      `src/app/(app)/grammar/[ordinal]/page.tsx` — khong dong tay vao
//      content_html/grammar.json chut nao. Cach nay co tac dung NGAY LAP TUC,
//      khong phu thuoc buoc backfill nao khac.
//   3. Media van phai TON TAI tren dia that (public/grammar-media/) de duong
//      dan tang-render o tren tro toi — day chinh la phan viec CON LAI cua
//      script nay.
//
// Da doi chieu THAT: chay `pandoc <docx goc> --extract-media` cho dung 3 file
// .docx nguon lay ra CHINH XAC nhung anh voi CHINH XAC ten (image2.svg,
// image4.svg cho bai 2; image1.png cho bai 11 va 13) da xuat hien trong
// content_html dang seed — khong phai suy doan, la doi chieu byte that. Danh
// sach 3 cap (ordinal, file .docx nguon) duoi day la KHOA CUNG, khong doan tu
// ten slug: xac nhan bang doc thang GrammarLesson.sourceFile trong
// data/clean/grammar.json roi khop nguoc lai voi ten file trong
// toeic-resource/NGU PHAP TOEIC/.
//
// AN TOAN de chay lai (idempotent) — nguon la chinh file .docx bat bien, ket
// qua tat dinh, va pandoc ghi de cung ten file moi lan chay.
const OUT_PUBLIC = "public/grammar-media";

interface AnhCanTrich {
  ordinal: number;
  docx: string;
}

const DANH_SACH: AnhCanTrich[] = [
  { ordinal: 2, docx: "toeic-resource/NGỮ PHÁP TOEIC/LÍ THUYẾT TÍNH TỪ VÀ TRẠNG TỪ.docx" },
  { ordinal: 11, docx: "toeic-resource/NGỮ PHÁP TOEIC/ÔN ĐH - ARTICLES-MẠO TỪ.docx" },
  { ordinal: 13, docx: "toeic-resource/NGỮ PHÁP TOEIC/ÔN ĐH - INF -Ving.docx" },
];

for (const { ordinal, docx } of DANH_SACH) {
  if (!existsSync(docx)) {
    throw new Error(`khong tim thay file nguon: ${docx}`);
  }

  const destDir = `${OUT_PUBLIC}/${ordinal}`;
  mkdirSync(destDir, { recursive: true });

  // --extract-media ghi anh THAT ra dia duoi <destDir>/media/imageN.ext —
  // dung DUNG chinh loi goi pandoc (-t markdown --wrap=none) ma
  // 03-extract-grammar.ts da dung de sinh contentMd dang seed, de thu tu danh
  // so anh (imageN) khop CHINH XAC voi tham chieu da nam san trong
  // content_html. Bo qua output markdown (khong can, contentMd da co san) —
  // chi lay tac dung phu la anh duoc ghi ra dia.
  execFileSync(
    "pandoc",
    [docx, "-t", "markdown", "--wrap=none", `--extract-media=${destDir}`, "-o", "/dev/null"],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  console.log(`${ordinal}. da trich anh vao ${destDir}/media/`);
}

console.log(
  `\nDa trich anh cho ${DANH_SACH.length} bai vao ${OUT_PUBLIC}/. ` +
    "Duong dan that duoc va o tang render (src/lib/content/fix-image-src.ts), " +
    "khong can sua data/clean/grammar.json hay day gi len Supabase.",
);
