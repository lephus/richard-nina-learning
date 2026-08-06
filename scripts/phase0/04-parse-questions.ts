import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseQuestionDoc } from "../../src/content/question-parser.js";
import type { RawQuestion } from "../../src/content/types.js";

const SRC = "toeic-resource/Bài tập";
const all: RawQuestion[] = [];

for (const f of readdirSync(SRC).filter((f) => f.endsWith(".docx"))) {
  const txt = execFileSync("pandoc", [join(SRC, f), "-t", "plain", "--wrap=none"], {
    encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  });
  const qs = parseQuestionDoc(txt, f);
  console.log(`${f}: ${qs.length} cau`);
  all.push(...qs);
}

mkdirSync("data/raw", { recursive: true });
writeFileSync("data/raw/questions-raw.json", JSON.stringify(all, null, 2));
console.log(`Tong: ${all.length} cau`);
