import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const PDF = "toeic-resource/VOCAB. Toeic Practice Club.pdf";
const IMG = "data/images";
const OCR = "data/raw/ocr";
const FIRST = 3, LAST = 114; // trang 1-2 la bia, khong co muc tu

mkdirSync(IMG, { recursive: true });
mkdirSync(OCR, { recursive: true });

// don file .tmp con sot lai tu lan chay truoc bi ngat giua chung ghi
for (const f of readdirSync(OCR)) {
  if (f.endsWith(".tmp.txt")) {
    unlinkSync(join(OCR, f));
    console.log(`don file tam con sot: ${f}`);
  }
}

for (let p = FIRST; p <= LAST; p++) {
  const padded = String(p).padStart(3, "0");
  const stem = join(IMG, `p${padded}`);
  const txt = join(OCR, `page-${padded}.txt`);
  const tmpBase = join(OCR, `page-${padded}.tmp`);
  const tmpTxt = `${tmpBase}.txt`;
  if (existsSync(txt)) { console.log(`bo qua trang ${p} (da co)`); continue; }

  execFileSync("pdftoppm", ["-f", String(p), "-l", String(p), "-r", "300", "-png", PDF, stem]);
  // pdftoppm them hau to -NNN vao ten file; tim lai file vua tao
  const produced = readdirSync(IMG).find((f) => f.startsWith(`p${padded}-`));
  if (!produced) throw new Error(`pdftoppm khong tao ra anh cho trang ${p}`);
  const png = join(IMG, produced);

  // tesseract ghi ra file tam (page-NNN.tmp.txt) roi doi ten nguyen tu sang
  // dich (page-NNN.txt) chi khi ghi xong hoan toan. Neu tien trinh bi giet
  // giua chung, chi con lai file .tmp.txt, khong co .txt -> lan chay sau se
  // lam lai dung trang do thay vi bo qua nham mot file bi cat cut.
  execFileSync("tesseract", [png, tmpBase, "-l", "vie+eng"]);
  renameSync(tmpTxt, txt);
  console.log(`xong trang ${p}`);
}
console.log(`Hoan tat: ${LAST - FIRST + 1} trang -> ${OCR}/`);
