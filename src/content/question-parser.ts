import type { RawQuestion } from "./types";

const STEM = /^\s*(\d{1,3})\.\s+(.*\S)\s*$/;
const OPT = /^\s*([A-D])\.\s+(.*\S)\s*$/;
const INLINE_A = /^\s*(\d{1,3})\.\s+(.*)\s+([A-D])\.\s+(.*\S)\s*$/;

export function parseQuestionDoc(text: string, sourceFile: string): RawQuestion[] {
  const out: RawQuestion[] = [];
  let cur: RawQuestion | null = null;

  for (const line of text.split("\n")) {
    const o = line.match(OPT);
    if (o && cur) { cur.options.push(o[2]!); continue; }

    const ia = line.match(INLINE_A);
    if (ia) {
      if (cur && cur.options.length === 4) out.push(cur);
      cur = { index: Number(ia[1]), stem: ia[2]!, options: [ia[4]!], sourceFile };
      continue;
    }

    const s = line.match(STEM);
    if (s) {
      if (cur && cur.options.length === 4) out.push(cur);
      cur = { index: Number(s[1]), stem: s[2]!, options: [], sourceFile };
      continue;
    }
    // de bai xuong dong: noi tiep vao stem khi chua co lua chon nao
    if (cur && cur.options.length === 0 && line.trim()) cur.stem += " " + line.trim();
  }
  if (cur && cur.options.length === 4) out.push(cur);
  return out;
}
