import { readFileSync } from "node:fs";
import { validateVocab } from "../../src/content/vocab-schema.js";

const items = JSON.parse(readFileSync("data/clean/vocab.json", "utf8")) as unknown[];
const { valid, invalid } = validateVocab(items);

console.log(`Hop le: ${valid.length} / ${items.length}`);
for (const e of invalid) console.error(`  #${e.ordinal}: ${e.problems.join("; ")}`);

const ords = valid.map((v) => v.ordinal);
const dup = ords.filter((o, i) => ords.indexOf(o) !== i);
if (dup.length) console.error(`Trung so thu tu: ${dup.join(", ")}`);

// Canh bao (khong chan): blankAnswer phai cung goc voi word (chia thi, so
// nhieu...). Heuristic: coi la cung goc neu mot trong hai chuoi bat dau
// bang 3-4 ky tu dau cua chuoi kia. Day chi la canh bao de nguoi soat xem,
// khong lam exit code khac 0 vi co the co bat quy tac hop le.
function sameStem(word: string, blankAnswer: string): boolean {
  const a = word.toLowerCase();
  const b = blankAnswer.toLowerCase();
  if (a === b) return true;
  const prefixLen = Math.min(4, a.length, b.length);
  if (prefixLen < 3) return a.startsWith(b) || b.startsWith(a);
  const shortPrefix = Math.min(3, a.length, b.length);
  const aPrefix4 = a.slice(0, Math.min(4, a.length));
  const bPrefix4 = b.slice(0, Math.min(4, b.length));
  const aPrefix3 = a.slice(0, shortPrefix);
  const bPrefix3 = b.slice(0, shortPrefix);
  return (
    b.startsWith(aPrefix4) ||
    a.startsWith(bPrefix4) ||
    b.startsWith(aPrefix3) ||
    a.startsWith(bPrefix3)
  );
}

const stemMismatches = valid.filter((v) => !sameStem(v.word, v.blankAnswer));
if (stemMismatches.length) {
  console.warn(`Canh bao: blankAnswer co the khong cung goc voi word (${stemMismatches.length} muc):`);
  for (const v of stemMismatches) console.warn(`  #${v.ordinal} ${v.word} -> ${v.blankAnswer}`);
}

process.exit(invalid.length || dup.length ? 1 : 0);
