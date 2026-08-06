import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseVocabPage } from "../../src/content/vocab-parser.js";
import type { RawVocabEntry } from "../../src/content/types.js";

const OCR = "data/raw/ocr";
const all: RawVocabEntry[] = [];

for (const f of readdirSync(OCR).filter((f) => f.endsWith(".txt")).sort()) {
  const page = Number(f.match(/page-(\d+)/)![1]);
  all.push(...parseVocabPage(readFileSync(join(OCR, f), "utf8"), page));
}

all.sort((a, b) => a.ordinal - b.ordinal);

// Bao cao khoang trong: so thu tu bi nhay = OCR bo sot muc
const gaps: number[] = [];
for (let n = 1; n <= (all.at(-1)?.ordinal ?? 0); n++) {
  if (!all.some((e) => e.ordinal === n)) gaps.push(n);
}

mkdirSync("data/raw", { recursive: true });
writeFileSync("data/raw/vocab-raw.json", JSON.stringify(all, null, 2));

console.log(`Tach duoc ${all.length} muc, so lon nhat ${all.at(-1)?.ordinal}`);
console.log(`Thieu ${gaps.length} so thu tu: ${gaps.slice(0, 40).join(", ")}${gaps.length > 40 ? " ..." : ""}`);
console.log(`Thieu SYN: ${all.filter((e) => !e.synonymsRaw).length}`);
console.log(`Thieu Exp: ${all.filter((e) => !e.expRaw).length}`);
