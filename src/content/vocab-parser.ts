import type { PartOfSpeech, RawVocabEntry } from "./types";

const HEAD = /^\s*(\d{1,4})\.\s+([A-Za-z][A-Za-z\- ]*?)\s*\((n|v|adj|adv|prep|conj)\)/;

function field(body: string[], re: RegExp): string | null {
  const m = body.join(" ").match(re);
  return m?.[1]?.trim().replace(/\s+/g, " ") ?? null;
}

export function parseVocabPage(text: string, page: number): RawVocabEntry[] {
  const entries: RawVocabEntry[] = [];
  let cur: RawVocabEntry | null = null;

  for (const line of text.split("\n")) {
    const m = line.match(HEAD);
    if (m) {
      if (cur) entries.push(cur);
      cur = {
        ordinal: Number(m[1]),
        word: m[2]!.trim().toLowerCase(),
        pos: m[3] as PartOfSpeech,
        sourcePage: page,
        ipaRaw: null, synonymsRaw: null, meanRaw: null, expRaw: null,
        bodyLines: [line],
      };
    } else if (cur) {
      cur.bodyLines.push(line);
    }
  }
  if (cur) entries.push(cur);

  for (const e of entries) {
    e.ipaRaw = field(e.bodyLines, /(\/[^\/\n]{2,40}\/)/);
    e.synonymsRaw = field(e.bodyLines, /SYN:\s*([^.]+)\./);
    e.meanRaw = field(e.bodyLines, /Mean:\s*(.{10,400}?)(?:Exp:|$)/);
    e.expRaw = field(e.bodyLines, /Exp:\s*(.{10,300})/);
  }
  return entries;
}
