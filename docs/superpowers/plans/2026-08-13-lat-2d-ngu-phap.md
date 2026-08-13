# Lát 2d — Lộ trình ngữ pháp: Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thẻ NGỮ PHÁP trên dashboard dẫn tới 20 bài lý thuyết đọc được, mỗi bài có bài thi chấm điểm thật — và chữ "Sắp có" cuối cùng của app biến mất.

**Architecture:** Nội dung bài học chuyển từ markdown (grid table pandoc, không render được) sang HTML sinh offline, lưu ở cột mới `content_html`. Bài thi dùng lại nguyên bộ máy của lát 2b/2c: chỉ thêm một hàm dựng đề thuần cho câu ngữ pháp và một nhánh `item_type` trong `recordAnswer`.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase, Vitest, Playwright, pandoc.

**Spec:** `docs/superpowers/specs/2026-08-13-lat-2d-lo-trinh-ngu-phap-design.md`

## Global Constraints

- Tiếng Việt cho mọi chữ người dùng thấy và mọi chú thích; **đủ dấu** trong `src/` và `tests/`, **không dấu** trong `scripts/`, `supabase/migrations/` và thông điệp commit. Chú thích giải thích **vì sao**.
- Bài `grammar` ghi `type: "grammar"` và **`scope = [ordinal bài ngữ pháp]`** (1..20 của `grammar_lessons`, một phần tử). Đây là **không gian số khác** với `scope` của bài từ vựng; `progress.ts` lọc theo `type` **trước** khi so `scope` nên hai bên không lẫn — ghi rõ sự thật đó tại chỗ.
- Bài thi ngữ pháp lấy **toàn bộ** câu của bài (20–100 câu tuỳ bài). Không cắt bớt.
- Phương án **lấy nguyên từ dữ liệu** — `grammar_questions.options` đã có sẵn 4 phương án và `answer` là chữ cái A–D. Không sinh phương án nhiễu.
- Chấm câu ngữ pháp bằng RPC `answer_for_question`; ghi tiến độ bằng `applyGrammarMastery(supabase, userId, grammarLessonId, correct)`. **`grammarLessonId` lấy từ `scope` của bài thi, không suy từ `ref_id`.**
- Giữ nguyên CAS `user_answer is null` và luật "chỉ cộng tiến độ ở lần trả lời đầu". Không nhánh nào được đi vòng qua chúng.
- Bài `grammar` **không có bổ túc**. Trang kết quả phải rẽ theo `type`, không chỉ theo `passed`.
- `PASS_MARK` vẫn là một hằng số 80% cho mọi loại.
- Không có ESLint; không thêm `eslint-disable`. `params` là `Promise` (Next 16).
- **Không chạy** `supabase db push`, `supabase link`, hay `psql`. Task 1 có một migration — người dùng dán tay.

## Cấu trúc tệp

| Tệp | Trách nhiệm |
|---|---|
| `scripts/phase0/03-extract-grammar.ts` | **Sửa.** Sinh thêm HTML, tự kiểm an toàn. |
| `supabase/migrations/0012_grammar_content_html.sql` | **Tạo.** Thêm cột `content_html`. |
| `scripts/phase0/05-seed.ts` | **Sửa.** Seed cột mới. |
| `src/content/types.ts` | **Sửa.** `GrammarLesson` thêm `contentHtml`. |
| `tests/grammar-html.test.ts` | **Tạo.** Bất biến an toàn + bảng đã thành `<table>`. |
| `src/lib/exam/build-grammar.ts` | **Tạo.** Dựng đề ngữ pháp, hàm thuần. |
| `tests/exam-build-grammar.test.ts` | **Tạo.** |
| `src/lib/exam/run.ts` | **Sửa.** `recordAnswer` rẽ theo `item_type`; thêm `createGrammarExam`. |
| `tests/exam-grammar.test.ts` | **Tạo.** Tích hợp. |
| `src/app/(app)/grammar/page.tsx` | **Tạo.** Danh sách 20 bài. |
| `src/app/(app)/grammar/[ordinal]/page.tsx` | **Tạo.** Lý thuyết + nút Làm bài. |
| `src/app/(app)/grammar/[ordinal]/actions.ts` | **Tạo.** `batDauBaiNguPhap(ordinal)`. |
| `src/app/(app)/dashboard/page.tsx` | **Sửa.** Thẻ NGỮ PHÁP thành link. |
| `src/components/exam/ExamRunner.tsx` | **Sửa.** Tiêu đề nhánh `grammar`. |
| `src/app/(app)/exam/[id]/ket-qua/page.tsx` | **Sửa.** Không hiện bổ túc cho `grammar`. |
| `e2e/grammar.spec.ts` | **Tạo.** |

---

### Task 1: Nội dung HTML và migration

**Files:**
- Modify: `scripts/phase0/03-extract-grammar.ts`, `scripts/phase0/05-seed.ts`, `src/content/types.ts`
- Create: `supabase/migrations/0012_grammar_content_html.sql`, `tests/grammar-html.test.ts`

**Interfaces:**
- Produces: `GrammarLesson.contentHtml: string` trong `data/clean/grammar.json`; cột `grammar_lessons.content_html`.

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/grammar-html.test.ts`, đọc `data/clean/grammar.json` (không cần database):

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface Bai { ordinal: number; slug: string; contentMd: string; contentHtml: string }
const bai = JSON.parse(readFileSync("data/clean/grammar.json", "utf8")) as Bai[];

describe("contentHtml của 20 bài ngữ pháp", () => {
  it("bài nào cũng có, và không rỗng", () => {
    expect(bai).toHaveLength(20);
    for (const b of bai) expect(b.contentHtml.length).toBeGreaterThan(100);
  });

  // Đây là khẳng định đóng lại rủi ro 11.2 của spec phase 2: giá trị của 20
  // bài nằm ở các bảng so sánh hai cột, và bản markdown cũ chứa grid table của
  // pandoc mà không thư viện JS nào render được.
  it("bảng đã thành <table> thật, không còn grid table của pandoc", () => {
    const coBang = bai.filter((b) => b.contentMd.includes("+===="));
    expect(coBang.length).toBeGreaterThan(0);
    for (const b of coBang) {
      expect(b.contentHtml).toContain("<table");
      expect(b.contentHtml).not.toContain("+====");
    }
  });

  // Trang lý thuyết render chuỗi này bằng dangerouslySetInnerHTML. Chuỗi cung
  // ứng khép kín (pandoc chạy offline trên .docx trong repo, seed bằng service
  // key) nên không có đường cho dữ liệu người dùng lọt vào — nhưng "an toàn vì
  // tôi nói vậy" không kiểm được. Đây là chỗ biến nó thành bất biến đỏ được.
  it("không chứa script, iframe, hay thuộc tính on…=", () => {
    for (const b of bai) {
      expect(b.contentHtml).not.toMatch(/<script/i);
      expect(b.contentHtml).not.toMatch(/<iframe/i);
      expect(b.contentHtml).not.toMatch(/\son[a-z]+\s*=/i);
    }
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó đỏ**

Run: `npm test -- grammar-html`
Expected: FAIL — `contentHtml` chưa tồn tại trong `data/clean/grammar.json`.

- [ ] **Step 3: Sinh HTML trong script trích xuất**

Trong `scripts/phase0/03-extract-grammar.ts`, cạnh lời gọi pandoc hiện có (`-t markdown --wrap=none`), thêm một lời gọi thứ hai `-t html` cho cùng file, gán vào `contentHtml`. Giữ nguyên `contentMd`.

Ngay sau khi sinh, **kiểm tại chỗ và nổ nếu vi phạm** — cùng ba mẫu như test trên. Script nổ ở đây thì người chạy biết ngay file `.docx` nào có vấn đề; để test bắt thì đã muộn hơn một bước.

Cập nhật `GrammarLesson` trong `src/content/types.ts` thêm `contentHtml: string`.

- [ ] **Step 4: Chạy lại trích xuất**

Run: `npm run phase0:grammar`
Expected: 20 bài, không nổ.

- [ ] **Step 5: Chạy test để xác nhận xanh**

Run: `npm test -- grammar-html`
Expected: PASS cả 3 test.

- [ ] **Step 6: Viết migration**

Tạo `supabase/migrations/0012_grammar_content_html.sql`:

```sql
-- Lat 2d: content_md cua 20 bai ngu phap chua GRID TABLE cua pandoc (+---+,
-- +===+) — khong thu vien markdown JS pho thong nao render duoc, va gia tri
-- cua ca 20 bai nam o cac bang so sanh hai cot do. Xem muc 1 cua
-- docs/superpowers/specs/2026-08-13-lat-2d-lo-trinh-ngu-phap-design.md
--
-- Them cot moi thay vi sua de content_md: cot cu da seed va da co test doi
-- chieu (tests/db-integrity.test.ts, tests/grammar-lessons.test.ts). Doi nghia
-- cua mot cot dang duoc khang dinh la mot cai bay cho nguoi doc sau.
--
-- Mac dinh chuoi rong de lenh nay chay duoc tren bang da co du lieu; buoc seed
-- ngay sau se dien noi dung that.
alter table grammar_lessons
  add column if not exists content_html text not null default '';
```

- [ ] **Step 7: Áp migration (người dùng dán tay)**

Đưa nội dung file cho người dùng dán vào Supabase Dashboard → SQL Editor → Run. **Không** chạy `supabase db push` hay `psql`. Xác minh độc lập qua REST API rằng cột đã tồn tại trước khi đi tiếp.

- [ ] **Step 8: Seed cột mới**

Trong `scripts/phase0/05-seed.ts`, thêm `content_html` vào phần chèn `grammar_lessons`.

Run: `npm run phase0:seed -- --force`
Expected: seed xong, không lỗi. Xác minh qua REST rằng 20 dòng có `content_html` khác rỗng.

- [ ] **Step 9: Commit**

```bash
git add scripts/phase0/03-extract-grammar.ts scripts/phase0/05-seed.ts src/content/types.ts supabase/migrations/0012_grammar_content_html.sql tests/grammar-html.test.ts data/clean/grammar.json
git commit -m "feat(2d): sinh content_html cho 20 bai ngu phap, them cot va seed"
```

---

### Task 2: Dựng đề ngữ pháp (`src/lib/exam/build-grammar.ts`)

**Files:**
- Create: `src/lib/exam/build-grammar.ts`, `tests/exam-build-grammar.test.ts`

**Interfaces:**
- Consumes: `seededShuffle`, `hashString` từ `@content/shuffle-options`.
- Produces:
  ```ts
  export interface GrammarQuestionLite {
    id: number; stem: string; options: string[]; answer: string;
  }
  export interface GrammarExamQuestion {
    questionId: number; prompt: string; options: string[]; answer: string;
  }
  export function buildGrammarExam(
    questions: readonly GrammarQuestionLite[], seed: number,
  ): GrammarExamQuestion[];
  ```
  `answer` là **chữ hiển thị** của phương án đúng (không phải chữ cái A–D), để cùng hình dạng với `buildVocabExam`.

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/exam-build-grammar.test.ts`, dựng dữ liệu từ `data/clean/questions.json` + `data/clean/grammar.json`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGrammarExam, type GrammarQuestionLite } from "@/lib/exam/build-grammar";

interface RawQ { lessonSlug: string; stem: string; options: string[]; answer: string }
const raw = JSON.parse(readFileSync("data/clean/questions.json", "utf8")) as RawQ[];
const slugs = [...new Set(raw.map((q) => q.lessonSlug))];

function cauCuaBai(slug: string): GrammarQuestionLite[] {
  return raw
    .filter((q) => q.lessonSlug === slug)
    .map((q, i) => ({ id: i + 1, stem: q.stem, options: q.options, answer: q.answer }));
}

describe("buildGrammarExam", () => {
  it("lấy hết câu của bài, mỗi câu đúng một lần", () => {
    const nguon = cauCuaBai(slugs[0]!);
    const de = buildGrammarExam(nguon, 1);
    expect(de).toHaveLength(nguon.length);
    expect(new Set(de.map((c) => c.questionId)).size).toBe(nguon.length);
  });

  it("phương án lấy nguyên từ dữ liệu, không sinh thêm", () => {
    const nguon = cauCuaBai(slugs[0]!);
    for (const c of buildGrammarExam(nguon, 5)) {
      const goc = nguon.find((q) => q.id === c.questionId)!;
      expect([...c.options].sort()).toEqual([...goc.options].sort());
    }
  });

  it("đáp án là CHỮ HIỂN THỊ đúng, suy từ chữ cái A–D", () => {
    const nguon = cauCuaBai(slugs[0]!);
    for (const c of buildGrammarExam(nguon, 5)) {
      const goc = nguon.find((q) => q.id === c.questionId)!;
      const chiSo = goc.answer.charCodeAt(0) - "A".charCodeAt(0);
      expect(c.answer).toBe(goc.options[chiSo]);
      expect(c.options).toContain(c.answer);
    }
  });

  it("cùng seed cho cùng đề", () => {
    const nguon = cauCuaBai(slugs[0]!);
    expect(buildGrammarExam(nguon, 42)).toEqual(buildGrammarExam(nguon, 42));
  });

  it("nổ khi bài không có câu nào, thay vì trả đề rỗng", () => {
    expect(() => buildGrammarExam([], 1)).toThrow();
  });

  // Cùng lý do như lát 2b: một bài không dựng được đề nghĩa là người học
  // không vào thi được bài đó, và lỗi chỉ lộ khi có người thật bấm vào.
  it("dựng được đề cho cả 20 bài", () => {
    expect(slugs).toHaveLength(20);
    for (const [i, s] of slugs.entries()) {
      const nguon = cauCuaBai(s);
      expect(() => buildGrammarExam(nguon, i + 1)).not.toThrow();
      expect(buildGrammarExam(nguon, i + 1)).toHaveLength(nguon.length);
    }
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó đỏ**

Run: `npm test -- exam-build-grammar`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `src/lib/exam/build-grammar.ts`**

Trộn thứ tự câu bằng `seededShuffle(questions, seed)`; với mỗi câu, suy `answer` từ chữ cái (`answer.charCodeAt(0) - 65`) rồi trộn phương án bằng `seededShuffle(options, hashString(...))`. Nổ khi danh sách rỗng hoặc chữ cái đáp án nằm ngoài biên của `options` — không lặng lẽ trả đề thiếu.

Ghi chú vì sao **không** dùng `pickDistractors` ở đây: dữ liệu đã mang sẵn 4 phương án do người soạn đề chọn, sinh thêm là thay đề của họ.

- [ ] **Step 4: Chạy test để xác nhận xanh**

Run: `npm test -- exam-build-grammar`
Expected: PASS cả 6 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/exam/build-grammar.ts tests/exam-build-grammar.test.ts
git commit -m "feat(2d): dung de bai thi ngu phap tu du lieu co san"
```

---

### Task 3: Chạy bài ngữ pháp

**Files:**
- Modify: `src/lib/exam/run.ts`
- Create: `tests/exam-grammar.test.ts`

**Interfaces:**
- Consumes: `buildGrammarExam` (Task 2); `applyGrammarMastery` từ `@/lib/mastery/write`.
- Produces: `createGrammarExam(supabase, userId, grammarLessonOrdinal, questions, seed): Promise<number>`; `recordAnswer` rẽ theo `item_type`.

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/exam-grammar.test.ts` theo khuôn `tests/exam-security.test.ts` (tạo người dùng thật, dọn trong `afterAll`). Bốn khẳng định:

1. Bài ngữ pháp ghi `type: "grammar"` và `scope = [ordinal]`, `item_type` của mọi item là `'grammar'`.
2. `payload` chỉ có `prompt`, `options`, `kind` — không có đáp án.
3. Trả lời đúng một câu ghi `grammar_mastery` theo khoá `(user_id, grammar_lesson_id)` với `correct_count = 1`; trả lời sai ghi `wrong_count`; **không** đụng `word_mastery`.
4. Trả lời lại cùng một câu **không** cộng lần hai (CAS giữ nguyên).

- [ ] **Step 2: Chạy test để chắc chắn nó đỏ**

Run: `npm test -- exam-grammar`
Expected: FAIL — `createGrammarExam` chưa tồn tại.

- [ ] **Step 3: Thêm `createGrammarExam` và nhánh `item_type`**

Trong `src/lib/exam/run.ts`:

- `createGrammarExam` dựng đề bằng `buildGrammarExam`, ghi `assessments` với `type: "grammar"`, `scope: [ordinal]`, rồi ghi `assessment_items` với `item_type: "grammar"`, `ref_id` = id câu hỏi, `payload` = `{ prompt, options, kind: "grammar" }`. Đi qua `timHoacDungBaiThi` như các loại khác.
- `recordAnswer` rẽ theo `item_type` đọc từ chính dòng item:
  - `'grammar'` → đáp án lấy qua RPC `answer_for_question(ref_id)`; sau khi CAS thắng, gọi `applyGrammarMastery(supabase, userId, grammarLessonId, dung)` với `grammarLessonId` lấy từ `scope[0]` của bài thi (**không** suy từ `ref_id` — đây là cái bẫy `write.ts` cũ đã ghi lại).
  - `'vocab'` → nguyên như cũ.

Giữ nguyên CAS và luật cộng-một-lần cho cả hai nhánh.

- [ ] **Step 4: Chạy test để xác nhận xanh**

Run: `npm test -- exam-grammar`
Expected: PASS cả 4 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/exam/run.ts tests/exam-grammar.test.ts
git commit -m "feat(2d): chay bai thi ngu phap, re theo item_type trong recordAnswer"
```

---

### Task 4: Màn hình lộ trình ngữ pháp

**Files:**
- Create: `src/app/(app)/grammar/page.tsx`, `src/app/(app)/grammar/[ordinal]/page.tsx`, `src/app/(app)/grammar/[ordinal]/actions.ts`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Test: `e2e/grammar.spec.ts`

**Interfaces:**
- Consumes: `createGrammarExam`, `timHoacDungBaiThi` (Task 3).
- Produces: Server Action `batDauBaiNguPhap(ordinal: number)`.

- [ ] **Step 1: Viết e2e thất bại**

Tạo `e2e/grammar.spec.ts` với `login()` cục bộ theo quy ước từng tệp. Bốn kịch bản:

1. Thẻ NGỮ PHÁP trên dashboard là link, không còn "Sắp có"; bấm vào tới `/grammar`.
2. `/grammar` liệt kê đúng 20 bài.
3. Mở một bài có bảng → **thấy `<table>` thật trong trang, và không thấy chuỗi `+====`**. Đây là khẳng định đóng rủi ro 11.2 ở tầng giao diện.
4. Bấm "Làm bài" → vào `/exam/[id]`, thấy 4 phương án.

Dọn bài đang làm dở giữa các test như `e2e/exam.spec.ts`.

- [ ] **Step 2: Chạy e2e để chắc chắn nó đỏ**

Run: `npm run test:e2e -- grammar`
Expected: FAIL — `/grammar` chưa tồn tại (404), thẻ dashboard vẫn xám.

- [ ] **Step 3: Viết `/grammar`**

Server Component: đọc `grammar_lessons` (id, ordinal, title) và `assessments` loại `grammar` của người dùng, ghép điểm gần nhất cho mỗi bài. Danh sách dọc, mỗi dòng là `<Link href={"/grammar/" + ordinal}>` với `data-testid="grammar-row"`.

- [ ] **Step 4: Viết `/grammar/[ordinal]` và Server Action**

Trang: `const { ordinal } = await params`, kiểm 1..20 nếu không thì `notFound()`. Đọc `content_html` của bài, render bằng `dangerouslySetInnerHTML` trong một khối có `data-testid="grammar-content"`.

Ghi chú tại chỗ **vì sao** dùng `dangerouslySetInnerHTML`: chuỗi do pipeline của chính dự án sinh offline từ `.docx` trong repo, seed bằng service key, và `tests/grammar-html.test.ts` khẳng định nó không chứa `<script`, `<iframe`, hay `on…=`. Dẫn tên tệp test đó trong chú thích — nó là thứ giữ cho câu này đúng.

`actions.ts`: `batDauBaiNguPhap(ordinal)` đọc câu hỏi của bài rồi gọi `createGrammarExam` qua `timHoacDungBaiThi`, chuyển tới `/exam/[id]`.

- [ ] **Step 5: Đổi thẻ NGỮ PHÁP trên dashboard**

Trong `src/app/(app)/dashboard/page.tsx`, đổi khối xám `data-testid="track-grammar"` thành `<Link href="/grammar">` cùng khuôn thẻ TỪ VỰNG, bỏ chữ "Sắp có". Xoá khối chú thích nói lộ trình ngữ pháp là lát sau.

`e2e/auth.spec.ts` có một khẳng định coi `track-grammar` là placeholder — cập nhật nó cho khớp thực tế mới.

- [ ] **Step 6: Chạy e2e để xác nhận xanh**

Run: `npm run test:e2e -- grammar`
Expected: PASS cả 4 test.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(2d): trang /grammar, trang ly thuyet, va the NGU PHAP tren dashboard"
```

---

### Task 5: Kết quả và tiêu đề cho bài ngữ pháp

**Files:**
- Modify: `src/app/(app)/exam/[id]/ket-qua/page.tsx`, `src/components/exam/ExamRunner.tsx`
- Test: `e2e/grammar.spec.ts` (thêm)

- [ ] **Step 1: Viết e2e thất bại**

Thêm vào `e2e/grammar.spec.ts`: làm hết một bài ngữ pháp (chọn phương án đầu mỗi câu), tới trang kết quả, khẳng định:
- thấy điểm;
- **không** có nút bổ túc (`ket-qua-bo-tuc` count 0), kể cả khi chưa đạt;
- có đường quay lại `/grammar`, không phải `/vocab/learn/...`.

Chọn bài có ít câu nhất để test không quá dài; cho timeout rộng.

- [ ] **Step 2: Chạy e2e để chắc chắn nó đỏ**

Run: `npm run test:e2e -- grammar`
Expected: test mới FAIL — trang kết quả vẫn hiện nút bổ túc và link về buổi từ vựng.

- [ ] **Step 3: Sửa trang kết quả**

Trong `ket-qua/page.tsx`, nút bổ túc chỉ hiện khi `bai.type !== "grammar"`. Đường quay lại rẽ theo `type`: `grammar` → `/grammar/{scope[0]}`, còn lại giữ nguyên logic hiện có (`phamViThuocNhom` → `/vocab`, ngược lại → buổi học).

Ghi chú vì sao: mục 3.3 spec phase 2 nói bài ngữ pháp không có bổ túc; hiện nút đó sẽ dựng một bài `remedial` không ai định nghĩa hành vi.

- [ ] **Step 4: Thêm nhánh tiêu đề `grammar`**

Trong `ExamRunner.tsx`, thêm nhánh `grammar` vào cùng chỗ ba nhánh hiện có (`lesson`/`review`/`remedial`), hiện tên bài ngữ pháp. Không thêm predicate rời rạc thứ hai.

- [ ] **Step 5: Chạy e2e để xác nhận xanh**

Run: `npm run test:e2e -- grammar`
Expected: PASS.

- [ ] **Step 6: Chạy toàn bộ**

Run: `npm test && npx tsc --noEmit && npm run build && npm run test:e2e`
Expected: tất cả xanh.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(2d): trang ket qua khong hien bo tuc cho bai ngu phap"
```

---

## Đối chiếu với spec

| Mục spec | Task |
|---|---|
| 1. `content_html`, migration, giữ `content_md` | 1 |
| 2. Bất biến an toàn của HTML | 1 |
| 3. Dựng đề từ dữ liệu có sẵn, chạy trên cả 20 bài | 2 |
| 4. Nhánh `item_type`, `grammarLessonId` từ `scope` | 3 |
| 5. `scope` là ordinal bài ngữ pháp, không gian số riêng | 3 |
| 6. `/grammar`, `/grammar/[ordinal]`, thẻ dashboard | 4 |
| 6. Kết quả không có bổ túc cho `grammar` | 5 |
| 7. Cảnh báo lệch loại; bài 100 câu; tiêu đề | 3, 5 |
| 8. Kiểm thử unit / tích hợp / pipeline / e2e | 1–5 |
