import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC = "toeic-resource/NGỮ PHÁP TOEIC";
const OUT = "data/raw/grammar";
mkdirSync(OUT, { recursive: true });

// \p{M} = moi dau phu ket hop. Dung Unicode property escape thay vi go
// dai ky tu to hop truc tiep — ky tu to hop khong hien thi va khong sao
// chep an toan qua cac trinh soan thao.
// Da kiem chung: "ÔN ĐH - MỆNH ĐỀ QUAN HỆ" -> "on-dh-menh-de-quan-he"
const slug = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "")
   .replace(/đ/gi, "d").toLowerCase()
   .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

for (const f of readdirSync(SRC).filter((f) => f.endsWith(".docx"))) {
  const md = execFileSync("pandoc", [join(SRC, f), "-t", "markdown", "--wrap=none"], {
    encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  });
  const name = `${slug(f.replace(/\.docx$/, ""))}.md`;
  writeFileSync(join(OUT, name), md);
  console.log(`${f} -> ${name} (${md.split(/\s+/).length} tu)`);
}
