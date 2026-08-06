# Phase 0 — Pipeline nội dung: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biến 114 trang PDF ảnh scan và 14 file .docx thành một database Supabase có 605 từ vựng sạch, 20 bài ngữ pháp, ~500 câu hỏi có đáp án — kèm test toàn vẹn chứng minh dữ liệu dùng được.

**Architecture:** Pipeline một chiều, mỗi bước ghi ra file trên đĩa nên chạy lại được từ bất kỳ điểm nào mà không phải làm lại bước trước. Phần tách cấu trúc do regex đảm nhiệm (tất định, test được); phần sửa chất lượng chữ do Claude Code làm thủ công theo lô (không gọi API, chi phí $0). Không có bước nào trong pipeline này chạy lúc web app hoạt động.

**Tech Stack:** Node 25 · TypeScript · tsx · vitest · zod · @supabase/supabase-js · poppler (`pdftoppm`) · tesseract 5.5 (`vie+eng`) · pandoc · Supabase CLI + Docker

## Global Constraints

- **Chi phí phải bằng $0.** Không gọi API trả tiền ở bất kỳ bước nào. Bước làm sạch do Claude Code thực hiện trực tiếp trong phiên làm việc.
- **Không commit file nhị phân lớn.** `toeic-resource/` (105MB) và ảnh render (~68MB) không bao giờ được stage. `.gitignore` phải chặn trước khi tạo ra chúng.
- **Package manager: `npm`** (đi kèm Node, không thêm phụ thuộc).
- **Mọi module trong `src/content/` là hàm thuần** — không đọc file, không gọi mạng, không đụng database. I/O nằm ở `scripts/`.
- **IPA được tái tạo, không vá.** OCR phá hỏng ký hiệu phiên âm có hệ thống (`/kood/` thay vì `/koʊd/`); viết lại từ từ đã biết đáng tin hơn sửa chuỗi rác.
- **Đáp án không bao giờ rời server.** `vocab_words.blank_answer` và `grammar_questions.answer` bị chặn bằng column-level GRANT của Postgres.
- Ngôn ngữ nội dung: giải thích tiếng Việt, ví dụ tiếng Anh. Giữ nguyên thuật ngữ tiếng Việt của tài liệu gốc.

---

## Bản đồ file

```
package.json · tsconfig.json · vitest.config.ts · .gitignore · .env.local.example
scripts/phase0/
  01-render-ocr.ts      PDF → PNG → text (I/O, gọi pdftoppm + tesseract)
  02-parse-vocab.ts     text → data/raw/vocab-raw.json (I/O, dùng src/content)
  03-extract-grammar.ts .docx → data/raw/grammar/*.md (I/O, gọi pandoc)
  04-parse-questions.ts .docx → data/raw/questions-raw.json (I/O)
  05-seed.ts            data/clean/* → Supabase (I/O)
src/content/
  types.ts              kiểu dùng chung, không logic
  vocab-parser.ts       parseVocabPage(text, page) → RawVocabEntry[]   [thuần]
  vocab-schema.ts       zod schema + validateVocab()                    [thuần]
  question-parser.ts    parseQuestionDoc(text) → RawQuestion[]          [thuần]
  lesson-manifest.ts    buildLessonPlan(words, lessons) → LessonPlan[]  [thuần]
  integrity.ts          checkIntegrity(bundle) → Violation[]            [thuần]
supabase/migrations/
  0001_content.sql · 0002_curriculum.sql · 0003_user_state.sql · 0004_rls.sql
data/
  raw/     ocr/*.txt · vocab-raw.json · grammar/*.md · questions-raw.json   [commit]
  clean/   vocab.json · grammar.json · questions.json · lesson-plan.json    [commit]
  images/  PNG render trung gian                                      [KHÔNG commit]
tests/
  vocab-parser.test.ts · vocab-schema.test.ts · question-parser.test.ts
  lesson-manifest.test.ts · integrity.test.ts · rls.test.ts
  fixtures/page-010.txt · fixtures/page-050.txt
```

Lý do tách `src/content/` khỏi `scripts/`: các hàm parser là chỗ dễ sai nhất và cũng là chỗ đáng test nhất. Giữ chúng thuần thì test chạy trong mili-giây, không cần PDF, không cần tesseract, không cần database.

---

### Task 1: Khởi tạo toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.local.example`
- Create: `src/content/types.ts`, `tests/smoke.test.ts`

**Interfaces:**
- Consumes: (không có — task đầu tiên)
- Produces: kiểu `RawVocabEntry`, `VocabWord`, `PartOfSpeech` dùng ở Task 3–6; lệnh `npm test` dùng ở mọi task sau.

- [ ] **Step 1: Tạo package.json**

```json
{
  "name": "richard-nina-learning",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "phase0:render": "tsx scripts/phase0/01-render-ocr.ts",
    "phase0:vocab": "tsx scripts/phase0/02-parse-vocab.ts",
    "phase0:grammar": "tsx scripts/phase0/03-extract-grammar.ts",
    "phase0:questions": "tsx scripts/phase0/04-parse-questions.ts",
    "phase0:seed": "tsx scripts/phase0/05-seed.ts"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.47.10",
    "dotenv": "^16.4.7",
    "zod": "^3.24.1"
  }
}
```

- [ ] **Step 2: Tạo tsconfig.json và vitest.config.ts**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "baseUrl": ".",
    "paths": { "@content/*": ["src/content/*"] }
  },
  "include": ["src", "scripts", "tests"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
  resolve: { alias: { "@content": resolve(__dirname, "src/content") } },
});
```

- [ ] **Step 3: Tạo .gitignore — chặn file lớn TRƯỚC khi sinh ra chúng**

```
.DS_Store
node_modules/
data/images/
toeic-resource/
.env.local
```

- [ ] **Step 4: Tạo .env.local.example**

```bash
# Lay tu Supabase Dashboard > Project Settings > API
SUPABASE_URL=https://efouimcmdufsaywudcgx.supabase.co
SUPABASE_ANON_KEY=
# CHI dung trong script seed chay tren may. KHONG BAO GIO dat len client.
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 5: Tạo src/content/types.ts**

```ts
export type PartOfSpeech = "n" | "v" | "adj" | "adv" | "prep" | "conj";

/** Bản ghi thô ngay sau parser — mọi trường có thể null hoặc còn nhiễu OCR. */
export interface RawVocabEntry {
  ordinal: number;
  word: string;
  pos: PartOfSpeech;
  sourcePage: number;
  ipaRaw: string | null;
  synonymsRaw: string | null;
  meanRaw: string | null;
  expRaw: string | null;
  bodyLines: string[];
}

/** Bản ghi đã làm sạch, sẵn sàng seed. Không trường nào được null. */
export interface VocabWord {
  ordinal: number;
  word: string;
  pos: PartOfSpeech;
  ipa: string;
  meaningVi: string;
  definitionEn: string;
  definitionVi: string;
  synonyms: string[];
  exampleEn: string;
  exampleVi: string;
  blankAnswer: string;
}

export interface RawQuestion {
  index: number;
  stem: string;
  options: string[];
  sourceFile: string;
}

export interface GrammarQuestion {
  lessonSlug: string;
  stem: string;
  options: string[];
  answer: "A" | "B" | "C" | "D";
  explanation: string;
}

export interface GrammarLesson {
  ordinal: number;
  slug: string;
  title: string;
  summary: string;
  contentMd: string;
  sourceFile: string;
}

export interface LessonPlan {
  ordinal: number;
  grammarSlug: string;
  wordOrdinals: number[];
}
```

- [ ] **Step 6: Viết smoke test**

`tests/smoke.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { PartOfSpeech } from "@content/types";

describe("toolchain", () => {
  it("chạy được TypeScript và alias @content", () => {
    const pos: PartOfSpeech = "n";
    expect(pos).toBe("n");
  });
});
```

- [ ] **Step 7: Cài đặt và chạy test**

Run: `npm install && npm test`
Expected: PASS — 1 test.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore .env.local.example src/content/types.ts tests/smoke.test.ts
git commit -m "chore: khởi tạo toolchain Phase 0 (TypeScript + vitest + zod)"
```

---

### Task 2: Render PDF → ảnh → text OCR

**Files:**
- Create: `scripts/phase0/01-render-ocr.ts`
- Create: `tests/fixtures/page-010.txt` (sinh ra rồi commit làm fixture)

**Interfaces:**
- Consumes: `.gitignore` chặn `data/images/` (Task 1)
- Produces: `data/raw/ocr/page-NNN.txt` cho 114 trang — đầu vào của Task 4.

- [ ] **Step 1: Viết script render + OCR**

`scripts/phase0/01-render-ocr.ts`:
```ts
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

  // --psm 6 BAT BUOC: che do mac dinh (psm 3) doc trang theo KHOI, lam
  // so thu tu + tu bi tach roi khoi tu loai + nghia + SYN o khoi khac,
  // khien parser truot sach 47/112 trang. psm 6 ep doc theo DONG.
  // Da do: psm 3 -> 297 muc; psm 6 -> ~594 muc, khong trang nao te di.
  execFileSync("tesseract", [png, txt.replace(/\.txt$/, ""), "-l", "vie+eng", "--psm", "6"]);
  console.log(`xong trang ${p}`);
}
console.log(`Hoan tat: ${LAST - FIRST + 1} trang -> ${OCR}/`);
```

- [ ] **Step 2: Chạy thử đúng một trang trước khi chạy cả 114**

Sửa tạm `LAST = 10`, chạy `npm run phase0:render`.
Expected: sinh ra `data/raw/ocr/page-003.txt` … `page-010.txt`, và `data/images/` có file PNG.

- [ ] **Step 3: Xác nhận nội dung OCR đúng**

Run: `grep -c "concern" data/raw/ocr/page-010.txt`
Expected: `1` — trang 10 chứa mục từ `concern`. Nếu ra `0` thì OCR sai ngôn ngữ hoặc sai độ phân giải, dừng lại kiểm tra.

- [ ] **Step 4: Chạy toàn bộ 114 trang**

Đổi `LAST` về `114`, chạy `npm run phase0:render`.
Expected: 112 file `.txt`. Mất khoảng 15–25 phút. Script bỏ qua file đã có nên ngắt giữa chừng vẫn chạy tiếp được.

- [ ] **Step 5: Tạo fixture cho test parser**

```bash
cp data/raw/ocr/page-010.txt tests/fixtures/page-010.txt
cp data/raw/ocr/page-050.txt tests/fixtures/page-050.txt
```

- [ ] **Step 6: Xác nhận ảnh KHÔNG bị stage**

Run: `git status --short | grep -c "data/images"`
Expected: `0`. Nếu ra số khác 0 thì `.gitignore` sai, sửa trước khi commit.

- [ ] **Step 7: Commit**

```bash
git add scripts/phase0/01-render-ocr.ts data/raw/ocr tests/fixtures
git commit -m "feat(phase0): render + OCR 112 trang từ vựng"
```

---

### Task 3: Parser từ vựng (lõi TDD)

**Files:**
- Create: `src/content/vocab-parser.ts`
- Test: `tests/vocab-parser.test.ts`

**Interfaces:**
- Consumes: `RawVocabEntry`, `PartOfSpeech` từ `@content/types` (Task 1); fixture từ Task 2.
- Produces: `parseVocabPage(text: string, page: number): RawVocabEntry[]` — dùng ở Task 4.

- [ ] **Step 1: Viết test thất bại**

`tests/vocab-parser.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseVocabPage } from "@content/vocab-parser";

const page10 = readFileSync("tests/fixtures/page-010.txt", "utf8");

describe("parseVocabPage", () => {
  it("tách được 4 mục từ trang 10", () => {
    expect(parseVocabPage(page10, 10)).toHaveLength(4);
  });

  it("lấy đúng số thứ tự, từ và từ loại", () => {
    const [first] = parseVocabPage(page10, 10);
    expect(first).toMatchObject({ ordinal: 42, word: "code", pos: "n", sourcePage: 10 });
  });

  it("lấy được danh sách từ đồng nghĩa", () => {
    const concern = parseVocabPage(page10, 10).find((e) => e.ordinal === 43)!;
    expect(concern.synonymsRaw).toContain("issue");
    expect(concern.synonymsRaw).toContain("worry");
  });

  it("chuẩn hoá từ về chữ thường (nguồn viết hoa không nhất quán)", () => {
    const policy = parseVocabPage(page10, 10).find((e) => e.ordinal === 44)!;
    expect(policy.word).toBe("policy");
  });

  it("giữ lại toàn bộ dòng gốc để bước làm sạch tham chiếu", () => {
    const [first] = parseVocabPage(page10, 10);
    expect(first.bodyLines.length).toBeGreaterThan(3);
  });

  it("bỏ qua dòng rác không khớp mẫu đầu mục", () => {
    const noise = "THỂ enon ch ban\nHil\n42. code (n). quy định, SYN: rules.\n";
    expect(parseVocabPage(noise, 1)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npm test -- vocab-parser`
Expected: FAIL — `Cannot find module '@content/vocab-parser'`.

- [ ] **Step 3: Viết implementation tối thiểu**

`src/content/vocab-parser.ts`:
```ts
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
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm test -- vocab-parser`
Expected: PASS — 6 test.

- [ ] **Step 5: Commit**

```bash
git add src/content/vocab-parser.ts tests/vocab-parser.test.ts
git commit -m "feat(phase0): parser tách mục từ vựng từ text OCR"
```

---

### Task 4: Schema kiểm định + chạy parser trên toàn bộ

**Files:**
- Create: `src/content/vocab-schema.ts`, `scripts/phase0/02-parse-vocab.ts`
- Test: `tests/vocab-schema.test.ts`

**Interfaces:**
- Consumes: `parseVocabPage` (Task 3), `VocabWord` (Task 1)
- Produces: `vocabWordSchema` (zod) và `validateVocab(items): {valid, invalid}` — dùng ở Task 5 và 13. File `data/raw/vocab-raw.json`.

- [ ] **Step 1: Viết test thất bại cho schema**

`tests/vocab-schema.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { validateVocab, vocabWordSchema } from "@content/vocab-schema";

const ok = {
  ordinal: 42, word: "code", pos: "n", ipa: "/koʊd/",
  meaningVi: "quy định, quy tắc",
  definitionEn: "a system of written rules",
  definitionVi: "một hệ thống các quy tắc thành văn",
  synonyms: ["rules", "regulations"],
  exampleEn: "Employees must follow the dress ___.",
  exampleVi: "Nhân viên phải tuân theo ___ về trang phục.",
  blankAnswer: "code",
};

describe("vocabWordSchema", () => {
  it("chấp nhận bản ghi hợp lệ", () => {
    expect(vocabWordSchema.parse(ok).word).toBe("code");
  });

  it("từ chối IPA không bọc trong dấu gạch chéo", () => {
    expect(() => vocabWordSchema.parse({ ...ok, ipa: "koʊd" })).toThrow();
  });

  it("từ chối câu ví dụ thiếu chỗ trống ___", () => {
    expect(() => vocabWordSchema.parse({ ...ok, exampleEn: "Follow the code." })).toThrow();
  });

  it("từ chối danh sách đồng nghĩa rỗng", () => {
    expect(() => vocabWordSchema.parse({ ...ok, synonyms: [] })).toThrow();
  });

  it("từ chối nghĩa tiếng Việt không có dấu (dấu hiệu OCR chưa sửa)", () => {
    expect(() => vocabWordSchema.parse({ ...ok, meaningVi: "quy dinh, quy tac" })).toThrow();
  });
});

describe("validateVocab", () => {
  it("tách được bản ghi hợp lệ và không hợp lệ kèm lý do", () => {
    const r = validateVocab([ok, { ...ok, ordinal: 43, synonyms: [] }]);
    expect(r.valid).toHaveLength(1);
    expect(r.invalid).toHaveLength(1);
    expect(r.invalid[0]!.ordinal).toBe(43);
    expect(r.invalid[0]!.problems.join(" ")).toMatch(/synonyms/);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npm test -- vocab-schema`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết schema**

`src/content/vocab-schema.ts`:
```ts
import { z } from "zod";
import type { VocabWord } from "./types";

/** Dấu tiếng Việt. Nghĩa tiếng Việt không chứa ký tự nào trong tập này
 *  gần như chắc chắn là OCR chưa sửa (vd "quy dinh" thay vì "quy định"). */
const VN_DIACRITIC =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

export const vocabWordSchema = z.object({
  ordinal: z.number().int().positive(),
  word: z.string().min(1).regex(/^[a-z][a-z\- ]*$/, "từ phải là chữ thường"),
  pos: z.enum(["n", "v", "adj", "adv", "prep", "conj"]),
  ipa: z.string().regex(/^\/.+\/$/, "IPA phải bọc trong dấu /.../"),
  meaningVi: z.string().min(2).regex(VN_DIACRITIC, "nghĩa tiếng Việt thiếu dấu"),
  definitionEn: z.string().min(10),
  definitionVi: z.string().min(5).regex(VN_DIACRITIC, "định nghĩa tiếng Việt thiếu dấu"),
  synonyms: z.array(z.string().min(1)).min(1, "cần ít nhất 1 từ đồng nghĩa"),
  exampleEn: z.string().includes("___", { message: "câu ví dụ phải có chỗ trống ___" }),
  exampleVi: z.string().min(5).regex(VN_DIACRITIC, "dịch ví dụ thiếu dấu"),
  blankAnswer: z.string().min(1),
});

export interface InvalidEntry { ordinal: number; problems: string[] }

export function validateVocab(items: unknown[]): { valid: VocabWord[]; invalid: InvalidEntry[] } {
  const valid: VocabWord[] = [];
  const invalid: InvalidEntry[] = [];
  for (const item of items) {
    const r = vocabWordSchema.safeParse(item);
    if (r.success) valid.push(r.data);
    else invalid.push({
      ordinal: (item as { ordinal?: number })?.ordinal ?? -1,
      problems: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  return { valid, invalid };
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm test -- vocab-schema`
Expected: PASS — 6 test.

- [ ] **Step 5: Viết script chạy parser trên toàn bộ trang**

`scripts/phase0/02-parse-vocab.ts`:
```ts
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
```

- [ ] **Step 6: Chạy và ghi lại con số**

Run: `npm run phase0:vocab`
Expected: khoảng 560–605 mục. Con số chính xác chưa biết trước — **ghi lại kết quả thật vào commit message.** Nếu tách được dưới 500 mục thì regex đầu mục hụt quá nhiều, quay lại Task 3 bổ sung mẫu trước khi đi tiếp.

- [ ] **Step 7: Commit**

```bash
git add src/content/vocab-schema.ts tests/vocab-schema.test.ts scripts/phase0/02-parse-vocab.ts data/raw/vocab-raw.json
git commit -m "feat(phase0): schema kiểm định + chạy parser trên toàn bộ 112 trang"
```

---

### Task 5: Làm sạch từ vựng theo lô

**Files:**
- Create: `data/clean/vocab.json`
- Create: `scripts/phase0/check-clean.ts`

**Interfaces:**
- Consumes: `data/raw/vocab-raw.json` (Task 4), `validateVocab` (Task 4)
- Produces: `data/clean/vocab.json` — mảng `VocabWord` đã qua schema, dùng ở Task 9 và 12.

> **Task này do Claude Code thực hiện trực tiếp, không có API call.** Xử lý theo lô 60 mục để mỗi lô kiểm định được ngay và commit được ngay. Khoảng 10 lô.

- [ ] **Step 1: Viết script kiểm định lô**

`scripts/phase0/check-clean.ts`:
```ts
import { readFileSync } from "node:fs";
import { validateVocab } from "../../src/content/vocab-schema.js";

const items = JSON.parse(readFileSync("data/clean/vocab.json", "utf8")) as unknown[];
const { valid, invalid } = validateVocab(items);

console.log(`Hop le: ${valid.length} / ${items.length}`);
for (const e of invalid) console.error(`  #${e.ordinal}: ${e.problems.join("; ")}`);

const ords = valid.map((v) => v.ordinal);
const dup = ords.filter((o, i) => ords.indexOf(o) !== i);
if (dup.length) console.error(`Trung so thu tu: ${dup.join(", ")}`);

process.exit(invalid.length || dup.length ? 1 : 0);
```

- [ ] **Step 2: Làm sạch lô đầu (mục 1–60)**

Đọc `data/raw/vocab-raw.json`, với mỗi mục trong lô, dựng bản ghi `VocabWord` theo đúng quy tắc:

| Trường | Cách dựng |
|---|---|
| `word`, `pos`, `ordinal` | giữ nguyên từ parser (đã tin cậy) |
| `ipa` | **viết lại từ đầu** dựa trên từ đã biết, không sửa `ipaRaw`. `code` → `/koʊd/` |
| `meaningVi` | lấy từ dòng đầu mục, phục hồi dấu tiếng Việt |
| `definitionEn` / `definitionVi` | tách từ `meanRaw` theo cặp `<tiếng Anh> (<tiếng Việt>)` |
| `synonyms` | tách `synonymsRaw` theo dấu phẩy, trim, bỏ rỗng |
| `exampleEn` | lấy từ `expRaw`, **thay từ đích bằng `___`** nếu sách chưa khoét |
| `exampleVi` | phần trong ngoặc của `expRaw`, phục hồi dấu |
| `blankAnswer` | dạng của từ xuất hiện thật trong câu (có thể là `codes`, `complied`… chứ không luôn bằng `word`) |

Ghi vào `data/clean/vocab.json`.

- [ ] **Step 3: Kiểm định lô đầu**

Run: `npx tsx scripts/phase0/check-clean.ts`
Expected: `Hop le: 60 / 60`, thoát mã 0. Nếu có mục lỗi, sửa đúng mục đó rồi chạy lại — không bỏ qua.

- [ ] **Step 4: Commit lô đầu**

```bash
git add data/clean/vocab.json scripts/phase0/check-clean.ts
git commit -m "feat(phase0): làm sạch từ vựng lô 1 (mục 1-60)"
```

- [ ] **Step 5: Lặp lại Step 2–4 cho các lô còn lại**

Mỗi lô 60 mục, commit riêng với message `... lô N (mục X-Y)`. Lặp đến hết.

- [ ] **Step 6: Kiểm định toàn bộ**

Run: `npx tsx scripts/phase0/check-clean.ts`
Expected: `Hop le: N / N` với N là tổng số mục, không có số trùng.

- [ ] **Step 7: Người soát mẫu ngẫu nhiên**

Tạo `scripts/phase0/sample-review.ts` (dự án dùng ESM nên `require()` không tồn tại — phải viết thành file, không dùng `tsx -e`):

```ts
import { readFileSync } from "node:fs";
import type { VocabWord } from "../../src/content/types.js";

const all = JSON.parse(readFileSync("data/clean/vocab.json", "utf8")) as VocabWord[];
const picked = new Set<number>();
while (picked.size < Math.min(30, all.length)) {
  picked.add(Math.floor(Math.random() * all.length));
}
for (const i of picked) {
  const w = all[i]!;
  console.log(`\n#${w.ordinal}  ${w.word} (${w.pos})  ${w.ipa}`);
  console.log(`  nghia   : ${w.meaningVi}`);
  console.log(`  dong nghia: ${w.synonyms.join(", ")}`);
  console.log(`  vi du   : ${w.exampleEn}`);
  console.log(`  dap an  : ${w.blankAnswer}`);
  console.log(`  dich    : ${w.exampleVi}`);
}
```

Run: `npx tsx scripts/phase0/sample-review.ts`

Người dùng đối chiếu 30 mục này với PDF gốc. **Đây là cổng chất lượng — không đi tiếp nếu chưa được duyệt.**

- [ ] **Step 8: Commit script soát mẫu**

```bash
git add scripts/phase0/sample-review.ts
git commit -m "chore(phase0): script lấy mẫu ngẫu nhiên để soát chất lượng"
```

---

### Task 6: Trích xuất ngữ pháp từ .docx

**Files:**
- Create: `scripts/phase0/03-extract-grammar.ts`
- Create: `data/raw/grammar/*.md` (14 file)

**Interfaces:**
- Consumes: `toeic-resource/NGỮ PHÁP TOEIC/*.docx`
- Produces: 14 file markdown — đầu vào của Task 7.

- [ ] **Step 1: Viết script trích xuất**

`scripts/phase0/03-extract-grammar.ts`:
```ts
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
```

- [ ] **Step 2: Chạy script**

Run: `npm run phase0:grammar`
Expected: 14 dòng log, tổng khoảng 53.600 từ.

- [ ] **Step 3: Xác nhận bảng so sánh còn nguyên**

Run: `grep -c "^|" data/raw/grammar/tenses.md`
Expected: số lớn hơn 0 — file TENSES dựa nhiều vào bảng hai cột, `--wrap=none` phải giữ được cấu trúc bảng markdown. Nếu ra 0, đổi sang `-t gfm` và chạy lại.

- [ ] **Step 4: Commit**

```bash
git add scripts/phase0/03-extract-grammar.ts data/raw/grammar
git commit -m "feat(phase0): trích xuất 14 bài ngữ pháp từ .docx sang markdown"
```

---

### Task 7: Chia 14 file thành 20 bài học

**Files:**
- Create: `data/clean/grammar.json`
- Test: `tests/grammar-lessons.test.ts`

**Interfaces:**
- Consumes: `data/raw/grammar/*.md` (Task 6), kiểu `GrammarLesson` (Task 1)
- Produces: `data/clean/grammar.json` — 20 bài, dùng ở Task 9, 10, 12.

- [ ] **Step 1: Viết test thất bại**

`tests/grammar-lessons.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GrammarLesson } from "@content/types";

const lessons = JSON.parse(readFileSync("data/clean/grammar.json", "utf8")) as GrammarLesson[];

describe("bộ bài ngữ pháp", () => {
  it("có đúng 20 bài", () => {
    expect(lessons).toHaveLength(20);
  });

  it("số thứ tự liên tục 1..20", () => {
    expect(lessons.map((l) => l.ordinal).sort((a, b) => a - b))
      .toEqual([...Array(20)].map((_, i) => i + 1));
  });

  it("slug không trùng nhau", () => {
    expect(new Set(lessons.map((l) => l.slug)).size).toBe(20);
  });

  it("mọi bài có nội dung đủ dài để học một buổi", () => {
    for (const l of lessons) {
      expect(l.contentMd.split(/\s+/).length, `bài ${l.slug} quá ngắn`).toBeGreaterThan(400);
    }
  });

  it("mọi bài có tóm tắt tiếng Việt", () => {
    for (const l of lessons) expect(l.summary.length).toBeGreaterThan(20);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npm test -- grammar-lessons`
Expected: FAIL — `data/clean/grammar.json` chưa tồn tại.

- [ ] **Step 3: Dựng 20 bài học**

Đọc 14 file markdown, tách các file lớn theo ranh giới chủ đề tự nhiên có sẵn trong tài liệu. Phân bổ dự kiến (chốt lại theo nội dung thật khi đọc):

| File gốc | Số từ | Số bài |
|---|---|---|
| TENSES | 9.659 | 3 |
| ÔN ĐH - CÂU ĐIỀU KIỆN | 6.294 | 2 |
| ÔN ĐH - ARTICLES-MẠO TỪ | 5.291 | 2 |
| ÔN ĐH - INF -Ving | 4.639 | 2 |
| ÔN ĐH - Bị động | 4.555 | 1 |
| ÔN ĐH-CÂU ĐIỀU KIỆN-WISH-WOULD RATHER | 4.436 | 2 |
| ÔN ĐH - MỆNH ĐỀ QUAN HỆ | 3.716 | 1 |
| ÔN ĐH-SỰ HÒA HỢP CHỦ NGỮ ĐỘNG TỪ | 3.665 | 1 |
| ÔN ĐH.reported speech | 2.881 | 1 |
| ĐẠI TỪ | 2.453 | 1 |
| ÔN ĐH-MODAL VERBS | 2.184 | 1 |
| SO SÁNH | 2.020 | 1 |
| LÍ THUYẾT TÍNH TỪ VÀ TRẠNG TỪ | 1.106 | 1 |
| ÔN ĐH - CẤU TRÚC CHUNG CỦA MỘT CÂU | 744 | 1 |
| **Tổng** | | **20** |

Ghi `data/clean/grammar.json`, mỗi phần tử có `ordinal`, `slug`, `title`, `summary` (2–3 câu tiếng Việt), `contentMd`, `sourceFile`.

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm test -- grammar-lessons`
Expected: PASS — 5 test.

- [ ] **Step 5: Commit**

```bash
git add data/clean/grammar.json tests/grammar-lessons.test.ts
git commit -m "feat(phase0): chia 14 file ngữ pháp thành 20 bài học"
```

---

### Task 8: Parser câu hỏi trắc nghiệm có sẵn

**Files:**
- Create: `src/content/question-parser.ts`, `scripts/phase0/04-parse-questions.ts`
- Test: `tests/question-parser.test.ts`

**Interfaces:**
- Consumes: `RawQuestion` (Task 1)
- Produces: `parseQuestionDoc(text, sourceFile): RawQuestion[]`; file `data/raw/questions-raw.json` — đầu vào Task 9.

- [ ] **Step 1: Viết test thất bại**

`tests/question-parser.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseQuestionDoc } from "@content/question-parser";

const SAMPLE = `BÀI TẬP DANH TỪ TOEIC
PART 1: Multiple Choice (1–50)
1.  The company is seeking a qualified ______ for the position.
    A. apply
    B. applicant
    C. application
    D. applicable
2.  Customer ______ is our top priority.
    A. satisfy
    B. satisfaction
    C. satisfying
    D. satisfied
`;

describe("parseQuestionDoc", () => {
  it("tách được 2 câu hỏi", () => {
    expect(parseQuestionDoc(SAMPLE, "danh-tu.docx")).toHaveLength(2);
  });

  it("lấy đúng đề bài kèm chỗ trống", () => {
    const [q] = parseQuestionDoc(SAMPLE, "danh-tu.docx");
    expect(q!.stem).toBe("The company is seeking a qualified ______ for the position.");
  });

  it("lấy đủ 4 lựa chọn, đã bỏ tiền tố A./B./C./D.", () => {
    const [q] = parseQuestionDoc(SAMPLE, "danh-tu.docx");
    expect(q!.options).toEqual(["apply", "applicant", "application", "applicable"]);
  });

  it("bỏ qua dòng tiêu đề không phải câu hỏi", () => {
    const qs = parseQuestionDoc(SAMPLE, "danh-tu.docx");
    expect(qs.every((q) => q.options.length === 4)).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npm test -- question-parser`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết implementation**

`src/content/question-parser.ts`:
```ts
import type { RawQuestion } from "./types";

const STEM = /^\s*(\d{1,3})\.\s+(.*\S)\s*$/;
const OPT = /^\s*([A-D])\.\s+(.*\S)\s*$/;

export function parseQuestionDoc(text: string, sourceFile: string): RawQuestion[] {
  const out: RawQuestion[] = [];
  let cur: RawQuestion | null = null;

  for (const line of text.split("\n")) {
    const o = line.match(OPT);
    if (o && cur) { cur.options.push(o[2]!); continue; }

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
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm test -- question-parser`
Expected: PASS — 4 test.

- [ ] **Step 5: Viết script chạy trên 2 file bài tập**

`scripts/phase0/04-parse-questions.ts`:
```ts
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
```

- [ ] **Step 6: Chạy script**

Run: `npm run phase0:questions`
Expected: khoảng 100 câu từ file danh từ + 50 câu từ file tính/trạng từ. Ghi con số thật vào commit message.

- [ ] **Step 7: Commit**

```bash
git add src/content/question-parser.ts tests/question-parser.test.ts scripts/phase0/04-parse-questions.ts data/raw/questions-raw.json
git commit -m "feat(phase0): parser câu hỏi trắc nghiệm từ file bài tập"
```

---

### Task 9: Soạn đáp án và bổ sung ngân hàng câu hỏi

**Files:**
- Create: `data/clean/questions.json`
- Test: `tests/questions.test.ts`

**Interfaces:**
- Consumes: `data/raw/questions-raw.json` (Task 8), `data/clean/grammar.json` (Task 7), kiểu `GrammarQuestion` (Task 1)
- Produces: `data/clean/questions.json` — dùng ở Task 12, 13.

> Task này do Claude Code soạn nội dung. Chia theo bài học để commit từng phần.

- [ ] **Step 1: Viết test thất bại**

`tests/questions.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GrammarLesson, GrammarQuestion } from "@content/types";

const qs = JSON.parse(readFileSync("data/clean/questions.json", "utf8")) as GrammarQuestion[];
const lessons = JSON.parse(readFileSync("data/clean/grammar.json", "utf8")) as GrammarLesson[];
const slugs = new Set(lessons.map((l) => l.slug));

describe("ngân hàng câu hỏi ngữ pháp", () => {
  it("mỗi bài có ít nhất 20 câu", () => {
    for (const s of slugs) {
      expect(qs.filter((q) => q.lessonSlug === s).length, `bài ${s} thiếu câu hỏi`)
        .toBeGreaterThanOrEqual(20);
    }
  });

  it("mọi câu trỏ tới một bài có thật", () => {
    for (const q of qs) expect(slugs.has(q.lessonSlug), `slug lạ: ${q.lessonSlug}`).toBe(true);
  });

  it("mọi câu có đúng 4 lựa chọn khác nhau", () => {
    for (const q of qs) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
    }
  });

  it("đáp án nằm trong A-D và mọi câu đều có giải thích", () => {
    for (const q of qs) {
      expect(["A", "B", "C", "D"]).toContain(q.answer);
      expect(q.explanation.length).toBeGreaterThan(10);
    }
  });

  it("đáp án phân bố không lệch — không nhãn nào chiếm quá 40%", () => {
    for (const label of ["A", "B", "C", "D"] as const) {
      expect(qs.filter((q) => q.answer === label).length / qs.length).toBeLessThan(0.4);
    }
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npm test -- questions`
Expected: FAIL — `data/clean/questions.json` chưa tồn tại.

- [ ] **Step 3: Gán đáp án cho câu hỏi có sẵn**

Với mỗi câu trong `data/raw/questions-raw.json`: xác định đáp án đúng, viết giải thích tiếng Việt một câu, gán `lessonSlug` phù hợp (file danh từ → bài danh từ; file tính/trạng từ → bài tính từ trạng từ). Ghi vào `data/clean/questions.json`.

- [ ] **Step 4: Soạn câu hỏi cho các bài còn thiếu**

Với mỗi bài trong `data/clean/grammar.json` chưa đủ 20 câu, soạn thêm theo đúng phong cách TOEIC Part 5 — câu đơn có một chỗ trống, 4 lựa chọn cùng gốc từ hoặc cùng nhóm ngữ pháp. Soạn theo từng bài, commit sau mỗi 2–3 bài.

- [ ] **Step 5: Chạy test để xác nhận pass**

Run: `npm test -- questions`
Expected: PASS — 5 test.

- [ ] **Step 6: Commit**

```bash
git add data/clean/questions.json tests/questions.test.ts
git commit -m "feat(phase0): ngân hàng câu hỏi ngữ pháp có đáp án cho 20 bài"
```

---

### Task 10: Ánh xạ 20 buổi học

**Files:**
- Create: `src/content/lesson-manifest.ts`, `data/clean/lesson-plan.json`
- Test: `tests/lesson-manifest.test.ts`

**Interfaces:**
- Consumes: `data/clean/vocab.json` (Task 5), `data/clean/grammar.json` (Task 7), `LessonPlan` (Task 1)
- Produces: `buildLessonPlan(wordOrdinals, grammarSlugs): LessonPlan[]`; file `data/clean/lesson-plan.json` — dùng ở Task 12, 13.

- [ ] **Step 1: Viết test thất bại**

`tests/lesson-manifest.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildLessonPlan } from "@content/lesson-manifest";

const words = [...Array(605)].map((_, i) => i + 1);
const slugs = [...Array(20)].map((_, i) => `bai-${i + 1}`);

describe("buildLessonPlan", () => {
  it("tạo đúng 20 buổi", () => {
    expect(buildLessonPlan(words, slugs)).toHaveLength(20);
  });

  it("mỗi buổi đúng 30 từ", () => {
    for (const l of buildLessonPlan(words, slugs)) expect(l.wordOrdinals).toHaveLength(30);
  });

  it("không từ nào xuất hiện ở hai buổi", () => {
    const used = buildLessonPlan(words, slugs).flatMap((l) => l.wordOrdinals);
    expect(new Set(used).size).toBe(used.length);
  });

  it("giữ nguyên thứ tự sách — buổi 1 là 30 từ đầu", () => {
    expect(buildLessonPlan(words, slugs)[0]!.wordOrdinals).toEqual(words.slice(0, 30));
  });

  it("mỗi buổi gắn đúng một bài ngữ pháp, không trùng", () => {
    const g = buildLessonPlan(words, slugs).map((l) => l.grammarSlug);
    expect(new Set(g).size).toBe(20);
  });

  it("báo lỗi rõ ràng khi không đủ 600 từ", () => {
    expect(() => buildLessonPlan(words.slice(0, 599), slugs)).toThrow(/599/);
  });

  it("báo lỗi rõ ràng khi không đủ 20 bài ngữ pháp", () => {
    expect(() => buildLessonPlan(words, slugs.slice(0, 19))).toThrow(/19/);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npm test -- lesson-manifest`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết implementation**

`src/content/lesson-manifest.ts`:
```ts
import type { LessonPlan } from "./types";

export const LESSON_COUNT = 20;
export const WORDS_PER_LESSON = 30;
const NEEDED = LESSON_COUNT * WORDS_PER_LESSON; // 600

/**
 * Xếp từ vào buổi theo đúng thứ tự sách gốc — người học đi tuần tự
 * theo mạch tác giả biên soạn. Từ dôi ra (605 - 600) bị bỏ lại và
 * chỉ dùng làm phương án nhiễu trong câu hỏi, không phải nội dung học.
 */
export function buildLessonPlan(wordOrdinals: number[], grammarSlugs: string[]): LessonPlan[] {
  if (wordOrdinals.length < NEEDED) {
    throw new Error(`Cần ${NEEDED} từ để xếp ${LESSON_COUNT} buổi, chỉ có ${wordOrdinals.length}`);
  }
  if (grammarSlugs.length < LESSON_COUNT) {
    throw new Error(`Cần ${LESSON_COUNT} bài ngữ pháp, chỉ có ${grammarSlugs.length}`);
  }

  const sorted = [...wordOrdinals].sort((a, b) => a - b);
  return [...Array(LESSON_COUNT)].map((_, i) => ({
    ordinal: i + 1,
    grammarSlug: grammarSlugs[i]!,
    wordOrdinals: sorted.slice(i * WORDS_PER_LESSON, (i + 1) * WORDS_PER_LESSON),
  }));
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm test -- lesson-manifest`
Expected: PASS — 7 test.

- [ ] **Step 5: Sinh file lesson-plan.json**

Tạo `scripts/phase0/make-lesson-plan.ts`:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { buildLessonPlan } from "../../src/content/lesson-manifest.js";
import type { GrammarLesson, VocabWord } from "../../src/content/types.js";

const vocab = JSON.parse(readFileSync("data/clean/vocab.json", "utf8")) as VocabWord[];
const grammar = JSON.parse(readFileSync("data/clean/grammar.json", "utf8")) as GrammarLesson[];

const plan = buildLessonPlan(
  vocab.map((w) => w.ordinal),
  [...grammar].sort((a, b) => a.ordinal - b.ordinal).map((l) => l.slug),
);

writeFileSync("data/clean/lesson-plan.json", JSON.stringify(plan, null, 2));
console.log(`Da tao ${plan.length} buoi`);
```

Run: `npx tsx scripts/phase0/make-lesson-plan.ts`
Expected: `Da tao 20 buoi`

- [ ] **Step 6: Commit**

```bash
git add src/content/lesson-manifest.ts tests/lesson-manifest.test.ts \
        scripts/phase0/make-lesson-plan.ts data/clean/lesson-plan.json
git commit -m "feat(phase0): ánh xạ 600 từ + 20 bài ngữ pháp thành 20 buổi học"
```

---

### Task 11: Migration schema database

**Files:**
- Create: `supabase/migrations/0001_content.sql`, `0002_curriculum.sql`, `0003_user_state.sql`
- Create: `supabase/config.toml` (do `supabase init` sinh)

**Interfaces:**
- Consumes: (không có — schema độc lập)
- Produces: bảng cho Task 12 (seed) và Task 12b (RLS).

- [ ] **Step 1: Khởi tạo Supabase local**

```bash
supabase init
supabase start
```
Expected: in ra `API URL`, `DB URL`, `anon key`. Ghi lại `DB URL` để chạy test.

- [ ] **Step 2: Viết 0001_content.sql**

```sql
create type part_of_speech as enum ('n','v','adj','adv','prep','conj');

create table vocab_words (
  id            bigserial primary key,
  ordinal       int  not null unique,
  word          text not null,
  pos           part_of_speech not null,
  ipa           text not null,
  meaning_vi    text not null,
  definition_en text not null,
  definition_vi text not null,
  synonyms      text[] not null default '{}',
  example_en    text not null,
  example_vi    text not null,
  blank_answer  text not null,
  created_at    timestamptz not null default now()
);

create table grammar_lessons (
  id          bigserial primary key,
  ordinal     int  not null unique,
  slug        text not null unique,
  title       text not null,
  summary     text not null,
  content_md  text not null,
  source_file text not null
);

create table grammar_questions (
  id          bigserial primary key,
  lesson_id   bigint not null references grammar_lessons(id) on delete cascade,
  stem        text not null,
  options     jsonb  not null,
  answer      char(1) not null check (answer in ('A','B','C','D')),
  explanation text not null
);

create index on grammar_questions (lesson_id);
```

- [ ] **Step 3: Viết 0002_curriculum.sql**

```sql
create table lessons (
  id                bigserial primary key,
  ordinal           int not null unique check (ordinal between 1 and 20),
  grammar_lesson_id bigint not null unique references grammar_lessons(id)
);

create table lesson_words (
  lesson_id bigint not null references lessons(id) on delete cascade,
  word_id   bigint not null references vocab_words(id),
  position  int    not null check (position between 1 and 30),
  primary key (lesson_id, position),
  -- Rang buoc nay ep "khong tu nao lap giua hai buoi" o tang database,
  -- khong phu thuoc vao script seed lam dung.
  unique (word_id)
);
```

- [ ] **Step 4: Viết 0003_user_state.sql**

```sql
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);

create type lesson_status     as enum ('locked','available','in_progress','completed');
create type assessment_type   as enum ('review','test','remedial');
create type assessment_status as enum ('in_progress','submitted','expired');

create table user_lesson_progress (
  user_id      uuid   not null references auth.users(id) on delete cascade,
  lesson_id    bigint not null references lessons(id),
  status       lesson_status not null default 'locked',
  score        int,
  completed_at timestamptz,
  primary key (user_id, lesson_id)
);

create table word_mastery (
  user_id       uuid   not null references auth.users(id) on delete cascade,
  word_id       bigint not null references vocab_words(id),
  correct_count int not null default 0,
  wrong_count   int not null default 0,
  mastered      boolean not null default false,
  last_seen_at  timestamptz,
  primary key (user_id, word_id)
);

create table grammar_mastery (
  user_id           uuid   not null references auth.users(id) on delete cascade,
  grammar_lesson_id bigint not null references grammar_lessons(id),
  correct_count int not null default 0,
  wrong_count   int not null default 0,
  primary key (user_id, grammar_lesson_id)
);

create table assessments (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  type         assessment_type not null,
  scope        int[] not null,
  status       assessment_status not null default 'in_progress',
  score        int,
  passed       boolean,
  started_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  submitted_at timestamptz
);

create table assessment_items (
  id            bigserial primary key,
  assessment_id bigint not null references assessments(id) on delete cascade,
  position      int    not null,
  item_type     text   not null check (item_type in ('vocab','grammar')),
  ref_id        bigint not null,
  payload       jsonb  not null,
  user_answer   text,
  is_correct    boolean,
  unique (assessment_id, position)
);

create index on assessments (user_id, status);
create index on assessment_items (assessment_id);
```

- [ ] **Step 5: Áp migration**

Run: `supabase db reset`
Expected: chạy sạch cả 3 file, không lỗi.

- [ ] **Step 6: Xác nhận ràng buộc chống trùng từ hoạt động**

```bash
export DB_URL=$(supabase status -o env | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')
psql "$DB_URL" -c "
insert into grammar_lessons (ordinal,slug,title,summary,content_md,source_file)
  values (1,'t','T','s','c','f');
insert into lessons (ordinal,grammar_lesson_id) values (1,1),(2,1);
"
```
Expected: **lỗi** `duplicate key value violates unique constraint` ở `lessons.grammar_lesson_id` — chứng minh một bài ngữ pháp không thể gán cho hai buổi.

- [ ] **Step 7: Commit**

```bash
git add supabase/
git commit -m "feat(phase0): schema database — nội dung, chương trình học, trạng thái người dùng"
```

---

### Task 12: Chính sách RLS và chặn rò rỉ đáp án

**Files:**
- Create: `supabase/migrations/0004_rls.sql`
- Test: `tests/rls.test.ts`

**Interfaces:**
- Consumes: bảng từ Task 11
- Produces: hàng rào bảo mật mà Phase 1 dựa vào.

- [ ] **Step 1: Viết migration RLS**

`supabase/migrations/0004_rls.sql`:
```sql
-- 1. Bang trang thai nguoi dung: chi chu so huu doc/ghi duoc
alter table profiles             enable row level security;
alter table user_lesson_progress enable row level security;
alter table word_mastery         enable row level security;
alter table grammar_mastery      enable row level security;
alter table assessments          enable row level security;
alter table assessment_items     enable row level security;

create policy own_profile  on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy own_progress on user_lesson_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_wmastery on word_mastery
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_gmastery on grammar_mastery
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_assess   on assessments
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy own_items on assessment_items for all
  using (exists (select 1 from assessments a
                 where a.id = assessment_items.assessment_id and a.user_id = auth.uid()))
  with check (exists (select 1 from assessments a
                      where a.id = assessment_items.assessment_id and a.user_id = auth.uid()));

-- 2. Bang noi dung: ai dang nhap cung doc duoc
alter table vocab_words       enable row level security;
alter table grammar_lessons   enable row level security;
alter table grammar_questions enable row level security;
alter table lessons           enable row level security;
alter table lesson_words      enable row level security;

create policy read_vocab   on vocab_words       for select to authenticated using (true);
create policy read_glesson on grammar_lessons   for select to authenticated using (true);
create policy read_gq      on grammar_questions for select to authenticated using (true);
create policy read_lessons on lessons           for select to authenticated using (true);
create policy read_lwords  on lesson_words      for select to authenticated using (true);

-- 3. CHAN RO RI DAP AN bang quyen cap cot cua Postgres.
--    RLS loc theo DONG; day la thu duy nhat loc duoc theo COT.
revoke all on vocab_words from authenticated;
grant select (id, ordinal, word, pos, ipa, meaning_vi, definition_en,
              definition_vi, synonyms, example_en, example_vi)
  on vocab_words to authenticated;   -- blank_answer KHONG nam trong danh sach

revoke all on grammar_questions from authenticated;
grant select (id, lesson_id, stem, options)
  on grammar_questions to authenticated;  -- answer, explanation chi server doc
```

- [ ] **Step 2: Viết test RLS thất bại**

`tests/rls.test.ts`:
```ts
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(URL, SERVICE);
let alice: ReturnType<typeof createClient>;
let bob: ReturnType<typeof createClient>;
let aliceId = "";

beforeAll(async () => {
  const mk = async (email: string) => {
    const { data } = await admin.auth.admin.createUser({
      email, password: "test-pass-1234", email_confirm: true,
    });
    const c = createClient(URL, ANON);
    await c.auth.signInWithPassword({ email, password: "test-pass-1234" });
    return { client: c, id: data.user!.id };
  };
  const a = await mk(`alice-${Date.now()}@test.local`);
  const b = await mk(`bob-${Date.now()}@test.local`);
  alice = a.client; bob = b.client; aliceId = a.id;

  await admin.from("profiles").insert({ id: aliceId, display_name: "Alice" });
});

describe("RLS", () => {
  it("Alice đọc được hồ sơ của chính mình", async () => {
    const { data } = await alice.from("profiles").select("*").eq("id", aliceId);
    expect(data).toHaveLength(1);
  });

  it("Bob KHÔNG đọc được hồ sơ của Alice", async () => {
    const { data } = await bob.from("profiles").select("*").eq("id", aliceId);
    expect(data).toHaveLength(0);
  });

  it("Bob KHÔNG ghi đè được tiến độ của Alice", async () => {
    const { error } = await bob.from("word_mastery")
      .insert({ user_id: aliceId, word_id: 1, correct_count: 999 });
    expect(error).not.toBeNull();
  });

  it("người dùng đọc được từ vựng nhưng KHÔNG đọc được blank_answer", async () => {
    const okay = await alice.from("vocab_words").select("word, ipa").limit(1);
    expect(okay.error).toBeNull();
    const leak = await alice.from("vocab_words").select("blank_answer").limit(1);
    expect(leak.error, "blank_answer phải bị chặn").not.toBeNull();
  });

  it("người dùng đọc được đề bài nhưng KHÔNG đọc được đáp án", async () => {
    const okay = await alice.from("grammar_questions").select("stem, options").limit(1);
    expect(okay.error).toBeNull();
    const leak = await alice.from("grammar_questions").select("answer").limit(1);
    expect(leak.error, "answer phải bị chặn").not.toBeNull();
  });
});
```

- [ ] **Step 3: Chạy test để xác nhận thất bại**

```bash
# Tam thoi doi ten 0004_rls.sql de migration nay KHONG duoc ap dung,
# nho vay test chung minh duoc no that su la thu chan ro ri.
mv supabase/migrations/0004_rls.sql /tmp/0004_rls.sql.bak
supabase db reset

# Nap bien moi truong. Gan tung bien mot — mot lenh sed gop de sinh ra
# ten sai kieu SUPABASE_SUPABASE_URL.
export SUPABASE_URL=$(supabase status -o env | grep '^API_URL=' | cut -d= -f2- | tr -d '"')
export SUPABASE_ANON_KEY=$(supabase status -o env | grep '^ANON_KEY=' | cut -d= -f2- | tr -d '"')
export SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o env | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')

npm test -- rls
```
Expected: FAIL ở các test "KHÔNG đọc được" — chưa bật RLS nên Bob đọc được hết.

- [ ] **Step 4: Khôi phục migration RLS và áp dụng**

```bash
mv /tmp/0004_rls.sql.bak supabase/migrations/0004_rls.sql
supabase db reset
```
Expected: cả 4 migration chạy sạch.

- [ ] **Step 5: Chạy test để xác nhận pass**

Run: `npm test -- rls`
Expected: PASS — 5 test.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0004_rls.sql tests/rls.test.ts
git commit -m "feat(phase0): RLS + chặn rò rỉ đáp án bằng quyền cấp cột"
```

---

### Task 13: Script seed

**Files:**
- Create: `scripts/phase0/05-seed.ts`

**Interfaces:**
- Consumes: `data/clean/*.json` (Task 5, 7, 9, 10); schema (Task 11)
- Produces: database đã nạp đầy — đầu vào của Task 14 và của toàn bộ Phase 1.

- [ ] **Step 1: Viết script seed**

`scripts/phase0/05-seed.ts`:
```ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import "dotenv/config";
import type { GrammarLesson, GrammarQuestion, LessonPlan, VocabWord } from "../../src/content/types.js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Thieu SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY trong .env.local");
const db = createClient(url, key, { auth: { persistSession: false } });

const read = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const vocab = read<VocabWord[]>("data/clean/vocab.json");
const grammar = read<GrammarLesson[]>("data/clean/grammar.json");
const questions = read<GrammarQuestion[]>("data/clean/questions.json");
const plan = read<LessonPlan[]>("data/clean/lesson-plan.json");

const die = (label: string, e: unknown) => { if (e) { console.error(label, e); process.exit(1); } };

// Chan xoa nham du lieu nguoi hoc. word_mastery tro toi vocab_words bang khoa ngoai
// khong cascade, nen xoa noi dung khi da co tien do se that bai giua chung va
// de lai database do dang. Kiem tra truoc, dung han neu co.
const { count: progressRows } = await db
  .from("word_mastery").select("*", { count: "exact", head: true });
if ((progressRows ?? 0) > 0 && !process.argv.includes("--force")) {
  console.error(`DUNG: da co ${progressRows} dong tien do hoc tap. Seed lai se xoa noi dung`);
  console.error(`ma tien do dang tro toi. Chay lai voi --force neu that su muon.`);
  process.exit(1);
}

// Xoa theo thu tu nguoc phu thuoc khoa ngoai.
// Moi bang mot cot loc rieng: lesson_words dung khoa chinh ghep, KHONG co cot "id".
const WIPE: Array<[string, string]> = [
  ["lesson_words", "lesson_id"],
  ["lessons", "id"],
  ["grammar_questions", "id"],
  ["grammar_lessons", "id"],
  ["vocab_words", "id"],
];
for (const [table, col] of WIPE) {
  die(`xoa ${table}`, (await db.from(table).delete().gte(col, 0)).error);
}

const vRows = vocab.map((w) => ({
  ordinal: w.ordinal, word: w.word, pos: w.pos, ipa: w.ipa,
  meaning_vi: w.meaningVi, definition_en: w.definitionEn, definition_vi: w.definitionVi,
  synonyms: w.synonyms, example_en: w.exampleEn, example_vi: w.exampleVi,
  blank_answer: w.blankAnswer,
}));
const { data: words, error: vErr } = await db.from("vocab_words").insert(vRows).select("id, ordinal");
die("seed vocab", vErr);
const wordIdByOrdinal = new Map(words!.map((w) => [w.ordinal as number, w.id as number]));

const gRows = grammar.map((l) => ({
  ordinal: l.ordinal, slug: l.slug, title: l.title,
  summary: l.summary, content_md: l.contentMd, source_file: l.sourceFile,
}));
const { data: gl, error: gErr } = await db.from("grammar_lessons").insert(gRows).select("id, slug");
die("seed grammar", gErr);
const lessonIdBySlug = new Map(gl!.map((l) => [l.slug as string, l.id as number]));

die("seed questions", (await db.from("grammar_questions").insert(
  questions.map((q) => ({
    lesson_id: lessonIdBySlug.get(q.lessonSlug), stem: q.stem,
    options: q.options, answer: q.answer, explanation: q.explanation,
  })),
)).error);

const { data: ls, error: lErr } = await db.from("lessons").insert(
  plan.map((p) => ({ ordinal: p.ordinal, grammar_lesson_id: lessonIdBySlug.get(p.grammarSlug) })),
).select("id, ordinal");
die("seed lessons", lErr);
const lessonIdByOrdinal = new Map(ls!.map((l) => [l.ordinal as number, l.id as number]));

die("seed lesson_words", (await db.from("lesson_words").insert(
  plan.flatMap((p) =>
    p.wordOrdinals.map((ord, i) => ({
      lesson_id: lessonIdByOrdinal.get(p.ordinal),
      word_id: wordIdByOrdinal.get(ord),
      position: i + 1,
    })),
  ),
)).error);

console.log(`Seed xong: ${vocab.length} tu, ${grammar.length} bai, ${questions.length} cau hoi, ${plan.length} buoi`);
```

- [ ] **Step 2: Chạy seed lên Supabase local**

```bash
export SUPABASE_URL=$(supabase status -o env | grep '^API_URL=' | cut -d= -f2- | tr -d '"')
export SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o env | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
npm run phase0:seed
```
Expected: `Seed xong: 605 tu, 20 bai, ~500 cau hoi, 20 buoi`

- [ ] **Step 3: Xác nhận chạy lại được (idempotent)**

Run: `npm run phase0:seed`
Expected: kết quả y hệt lần đầu, không lỗi khoá trùng. Script xoá trước khi chèn nên chạy bao nhiêu lần cũng ra cùng trạng thái.

- [ ] **Step 4: Commit**

```bash
git add scripts/phase0/05-seed.ts
git commit -m "feat(phase0): script seed dữ liệu lên Supabase"
```

---

### Task 14: Kiểm thử toàn vẹn nội dung

**Files:**
- Create: `src/content/integrity.ts`
- Test: `tests/integrity.test.ts`

**Interfaces:**
- Consumes: mọi file trong `data/clean/`
- Produces: `checkIntegrity(bundle): Violation[]` — cổng chất lượng cuối của Phase 0.

- [ ] **Step 1: Viết test thất bại**

`tests/integrity.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkIntegrity } from "@content/integrity";
import type { GrammarLesson, GrammarQuestion, LessonPlan, VocabWord } from "@content/types";

const read = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const bundle = {
  vocab: read<VocabWord[]>("data/clean/vocab.json"),
  grammar: read<GrammarLesson[]>("data/clean/grammar.json"),
  questions: read<GrammarQuestion[]>("data/clean/questions.json"),
  plan: read<LessonPlan[]>("data/clean/lesson-plan.json"),
};

describe("toàn vẹn nội dung", () => {
  it("không có vi phạm nào trong bộ dữ liệu thật", () => {
    expect(checkIntegrity(bundle)).toEqual([]);
  });

  it("phát hiện từ bị dùng ở hai buổi", () => {
    const broken = { ...bundle, plan: bundle.plan.map((p, i) =>
      i === 1 ? { ...p, wordOrdinals: bundle.plan[0]!.wordOrdinals } : p) };
    expect(checkIntegrity(broken).some((v) => v.kind === "duplicate-word")).toBe(true);
  });

  it("phát hiện buổi trỏ tới bài ngữ pháp không tồn tại", () => {
    const broken = { ...bundle, plan: bundle.plan.map((p, i) =>
      i === 0 ? { ...p, grammarSlug: "khong-ton-tai" } : p) };
    expect(checkIntegrity(broken).some((v) => v.kind === "missing-grammar")).toBe(true);
  });

  it("phát hiện buổi thiếu từ", () => {
    const broken = { ...bundle, plan: bundle.plan.map((p, i) =>
      i === 0 ? { ...p, wordOrdinals: p.wordOrdinals.slice(0, 29) } : p) };
    expect(checkIntegrity(broken).some((v) => v.kind === "wrong-word-count")).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npm test -- integrity`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết implementation**

`src/content/integrity.ts`:
```ts
import { LESSON_COUNT, WORDS_PER_LESSON } from "./lesson-manifest";
import type { GrammarLesson, GrammarQuestion, LessonPlan, VocabWord } from "./types";

export interface Violation { kind: string; detail: string }

export interface ContentBundle {
  vocab: VocabWord[];
  grammar: GrammarLesson[];
  questions: GrammarQuestion[];
  plan: LessonPlan[];
}

export function checkIntegrity(b: ContentBundle): Violation[] {
  const v: Violation[] = [];
  const push = (kind: string, detail: string) => v.push({ kind, detail });

  if (b.plan.length !== LESSON_COUNT) push("wrong-lesson-count", `có ${b.plan.length} buổi`);
  if (b.grammar.length !== LESSON_COUNT) push("wrong-grammar-count", `có ${b.grammar.length} bài`);

  const wordOrdinals = new Set(b.vocab.map((w) => w.ordinal));
  const slugs = new Set(b.grammar.map((g) => g.slug));
  const seen = new Set<number>();

  for (const p of b.plan) {
    if (p.wordOrdinals.length !== WORDS_PER_LESSON) {
      push("wrong-word-count", `buổi ${p.ordinal} có ${p.wordOrdinals.length} từ`);
    }
    if (!slugs.has(p.grammarSlug)) {
      push("missing-grammar", `buổi ${p.ordinal} trỏ tới "${p.grammarSlug}"`);
    }
    for (const o of p.wordOrdinals) {
      if (!wordOrdinals.has(o)) push("missing-word", `buổi ${p.ordinal} trỏ tới từ #${o}`);
      if (seen.has(o)) push("duplicate-word", `từ #${o} xuất hiện ở nhiều buổi`);
      seen.add(o);
    }
  }

  for (const g of b.grammar) {
    const n = b.questions.filter((q) => q.lessonSlug === g.slug).length;
    if (n < 20) push("too-few-questions", `bài ${g.slug} chỉ có ${n} câu`);
  }

  return v;
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm test -- integrity`
Expected: PASS — 4 test.

- [ ] **Step 5: Chạy toàn bộ bộ test**

Run: `npm test`
Expected: PASS toàn bộ — parser, schema, câu hỏi, buổi học, RLS, toàn vẹn.

- [ ] **Step 6: Commit**

```bash
git add src/content/integrity.ts tests/integrity.test.ts
git commit -m "feat(phase0): kiểm thử toàn vẹn nội dung — cổng chất lượng cuối"
```

---

### Task 15: Seed lên Supabase thật và chống ngủ

**Files:**
- Create: `.github/workflows/keepalive.yml`
- Create: `.env.local` (KHÔNG commit)

**Interfaces:**
- Consumes: script seed (Task 13), thông tin đăng nhập Supabase từ người dùng
- Produces: database production sẵn sàng cho Phase 1.

> **Task này bị chặn cho tới khi người dùng cung cấp `SUPABASE_SERVICE_ROLE_KEY` và `SUPABASE_ANON_KEY`.**

- [ ] **Step 1: Tạo .env.local từ mẫu**

```bash
cp .env.local.example .env.local
# dien SUPABASE_ANON_KEY va SUPABASE_SERVICE_ROLE_KEY
```

- [ ] **Step 2: Xác nhận .env.local bị git bỏ qua**

Run: `git check-ignore -v .env.local`
Expected: in ra dòng khớp trong `.gitignore`. **Nếu không in gì thì DỪNG LẠI** — service role key sắp bị commit.

- [ ] **Step 3: Áp migration lên project thật**

```bash
supabase link --project-ref efouimcmdufsaywudcgx
supabase db push
```
Expected: cả 4 migration áp thành công.

- [ ] **Step 4: Seed dữ liệu thật**

Run: `npm run phase0:seed`
Expected: `Seed xong: 605 tu, 20 bai, ... cau hoi, 20 buoi`

- [ ] **Step 5: Chạy test RLS trên database thật**

Run: `npm test -- rls`
Expected: PASS — 5 test. Đây là lần kiểm chứng cuối rằng hàng rào bảo mật hoạt động trên môi trường thật, không chỉ local.

- [ ] **Step 6: Tạo workflow chống ngủ**

`.github/workflows/keepalive.yml`:
```yaml
name: keepalive
on:
  schedule:
    - cron: "0 6 */3 * *"   # 3 ngay/lan, du an toan truoc nguong ~7 ngay
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Truy van nhe de giu project Supabase khong ngu
        run: |
          curl -sS -f \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" \
            "${{ secrets.SUPABASE_URL }}/rest/v1/grammar_lessons?select=id&limit=1" \
            > /dev/null
          echo "ping ok"
```

Thêm `SUPABASE_URL` và `SUPABASE_ANON_KEY` vào GitHub repository secrets.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/keepalive.yml
git commit -m "chore(phase0): cron giữ project Supabase không bị tạm dừng"
```

---

## Xong Phase 0

Kết quả: database Supabase có 605 từ vựng sạch, 20 bài ngữ pháp, ~500 câu hỏi có đáp án, 20 buổi học đã ánh xạ, RLS đã bật và được kiểm chứng, đáp án không rò rỉ ra client.

**Bước tiếp theo:** viết kế hoạch Phase 1 (web app Next.js). Kế hoạch đó sẽ dựa trên hình dạng dữ liệu thật đã seed ở đây.
