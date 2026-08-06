import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";

const PDF = "toeic-resource/VOCAB. Toeic Practice Club.pdf";
const IMG = "data/images";
const OCR = "data/raw/ocr";
const FIRST = 3, LAST = 114; // trang 1-2 la bia, khong co muc tu

mkdirSync(IMG, { recursive: true });
mkdirSync(OCR, { recursive: true });

for (let p = FIRST; p <= LAST; p++) {
  const stem = join(IMG, `p${String(p).padStart(3, "0")}`);
  const txt = join(OCR, `page-${String(p).padStart(3, "0")}.txt`);
  if (existsSync(txt)) { console.log(`bo qua trang ${p} (da co)`); continue; }

  execFileSync("pdftoppm", ["-f", String(p), "-l", String(p), "-r", "300", "-png", PDF, stem]);
  // pdftoppm them hau to -NNN vao ten file; tim lai file vua tao
  const produced = readdirSync(IMG).find((f) => f.startsWith(`p${String(p).padStart(3, "0")}-`));
  if (!produced) throw new Error(`pdftoppm khong tao ra anh cho trang ${p}`);
  const png = join(IMG, produced);

  execFileSync("tesseract", [png, txt.replace(/\.txt$/, ""), "-l", "vie+eng"]);
  console.log(`xong trang ${p}`);
}
console.log(`Hoan tat: ${LAST - FIRST + 1} trang -> ${OCR}/`);
