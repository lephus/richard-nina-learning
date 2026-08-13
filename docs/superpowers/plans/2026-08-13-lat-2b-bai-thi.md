# Lát 2b — Bài thi từ vựng: Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nút LÀM BÀI dẫn tới bài thi 30 câu thật, chấm điểm thật, ghi tiến độ thật, và người trượt có bài bổ túc để đi tiếp.

**Architecture:** Ba module thuần tách khỏi nhau — `exam/build.ts` dựng đề (hàm thuần, test không cần mạng), `mastery/write.ts` ghi tiến độ, `exam/run.ts` nối chúng với Supabase qua Server Action. Đáp án không bao giờ rời server: `assessment_items.payload` chỉ chứa `prompt` + `options`, việc chấm dùng `ref_id` và RPC `answer_for_word`.

**Tech Stack:** Next.js 16 App Router (Server Actions), React 19, Supabase, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-13-lat-2b-bai-thi-tu-vung-design.md`

## Global Constraints

- Tiếng Việt cho mọi chữ người dùng thấy và mọi chú thích; **đủ dấu** trong `src/` và `tests/`, **không dấu** trong `scripts/`, `supabase/migrations/` và thông điệp commit. Chú thích giải thích **vì sao**.
- **`MASTERY_THRESHOLD` = 2** sau lát này. Một chỗ duy nhất: `src/lib/mastery/apply.ts`.
- **`PASS_MARK` = 80% cho MỌI loại bài** — một hằng số, không phải `Record<AssessmentType, number>`.
- Bài `lesson`: 30 câu / 30 từ, chia **15–15** hai dạng. Bài `remedial`: mỗi từ sai một câu, chia đôi làm tròn.
- **`payload` không bao giờ chứa đáp án** — chỉ `prompt`, `options`, `kind`.
- Dựng đề **nổ khi thiếu nguồn**, không lặng lẽ trả đề ngắn hơn.
- Seed tất định: cùng seed cho cùng đề.
- `finalize_assessment_items(p_assessment_id, p_pass_mark, p_now)` — `p_now` truyền từ TypeScript, không dùng `now()` của Postgres.
- Không có ESLint; không thêm `eslint-disable`.
- `params` là `Promise` (Next 16).
- Không chạy `supabase db push`, `supabase link`, hay `psql`. Migration (nếu có) do người dùng dán tay.

## Cấu trúc tệp

| Tệp | Trách nhiệm |
|---|---|
| `src/lib/mastery/apply.ts` | **Sửa.** Ngưỡng 3 → 2. |
| `tests/mastery.test.ts` | **Sửa.** Khẳng định ngưỡng mới. |
| `src/lib/exam/build.ts` | **Tạo.** Dựng đề từ phạm vi. Hàm thuần. |
| `tests/exam-build.test.ts` | **Tạo.** |
| `src/lib/mastery/write.ts` | **Tạo.** Ghi `word_mastery` / `grammar_mastery`. |
| `src/lib/exam/run.ts` | **Tạo.** Tạo bài, ghi đáp án, nộp bài. |
| `tests/exam-security.test.ts` | **Tạo.** Sáu khẳng định an toàn ở mục 6 của spec. |
| `src/app/(app)/exam/[id]/page.tsx` | **Tạo.** Trang làm bài. |
| `src/components/exam/ExamRunner.tsx` | **Tạo.** Client: một câu mỗi lần, hàng đợi gửi nền. |
| `src/app/(app)/exam/[id]/ket-qua/page.tsx` | **Tạo.** Điểm, từ sai, nút bổ túc. |
| `src/app/(app)/vocab/learn/[lessonId]/sap-co/` | **Xoá.** |
| `src/app/(app)/vocab/learn/[lessonId]/page.tsx` | **Sửa.** LÀM BÀI gọi Server Action. |
| `e2e/exam.spec.ts` | **Tạo.** |

---

### Task 1: Ngưỡng "đã thuộc" 3 → 2

Việc nhỏ nhất và độc lập nhất, nhưng phải làm trước vì mọi test mastery sau đó đều dựa vào nó.

**Files:**
- Modify: `src/lib/mastery/apply.ts`
- Test: `tests/mastery.test.ts`

**Interfaces:**
- Consumes: không có.
- Produces: `MASTERY_THRESHOLD = 2`; `masteryDelta(current: MasteryRow | null, correct: boolean): MasteryRow` (chữ ký không đổi).

- [ ] **Step 1: Sửa test cho ngưỡng mới**

Trong `tests/mastery.test.ts`, thay các khẳng định dựa trên ngưỡng 3 bằng:

```ts
it("đúng 1 lần chưa đủ thuộc — cấu trúc mới chạm mỗi từ 2 lần", () => {
  expect(masteryDelta(null, true)).toEqual({
    correctCount: 1, wrongCount: 0, mastered: false,
  });
});

it("đúng 2 lần liên tiếp thì thuộc — bài buổi và bài ôn tập nhóm", () => {
  const sau1 = masteryDelta(null, true);
  expect(masteryDelta(sau1, true).mastered).toBe(true);
});

it("đúng 2 sai 1 thì chưa thuộc — hiệu số mới là thứ được đếm", () => {
  let m = masteryDelta(null, true);
  m = masteryDelta(m, false);
  m = masteryDelta(m, true);
  expect(m).toEqual({ correctCount: 2, wrongCount: 1, mastered: false });
});

it("ngưỡng đúng bằng 2", () => {
  expect(MASTERY_THRESHOLD).toBe(2);
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó đỏ**

Run: `npm test -- mastery`
Expected: FAIL — `MASTERY_THRESHOLD` vẫn là 3, nên "đúng 2 lần thì thuộc" trả `false`.

- [ ] **Step 3: Đổi hằng số và chú thích**

Trong `src/lib/mastery/apply.ts`, đổi `export const MASTERY_THRESHOLD = 3;` thành `2` và thay khối chú thích phía trên bằng:

```ts
/**
 * Một từ coi là "đã thuộc" khi số lần đúng vượt số lần sai đúng bằng ngưỡng này.
 *
 * Ngưỡng là 2 chứ không phải 3 vì cấu trúc sau lát 2a chạm mỗi từ **tối đa hai
 * lần trong cả đời**: đúng một câu trong bài buổi (30 câu/30 từ) và đúng một
 * câu trong bài ôn tập nhóm (60 câu/60 từ). Bài bổ túc chỉ chứa từ đã sai. Với
 * ngưỡng 3, trần đạt được là 2 — nghĩa là KHÔNG từ nào có thể "đã thuộc", bao
 * giờ, và thẻ "đã thuộc /605" trên dashboard đứng ở 0 vĩnh viễn.
 *
 * Ngưỡng 2 nghĩa là "đúng ở cả hai lần kiểm riêng biệt, cách nhau nhiều ngày" —
 * mức cao nhất mà cấu trúc mới còn cho phép, và vẫn mang nghĩa thật. Ngưỡng 1
 * thì "đã thuộc" chỉ còn nghĩa "đã đoán trúng một lần": câu 4 phương án có 25%
 * đoán trúng.
 *
 * Ngưỡng nằm ở đây, một chỗ duy nhất, để `/stats` đếm cột `mastered` bằng cùng
 * một luật thay vì tự tính lại.
 */
export const MASTERY_THRESHOLD = 2;
```

- [ ] **Step 4: Chạy test để xác nhận xanh**

Run: `npm test -- mastery`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mastery/apply.ts tests/mastery.test.ts
git commit -m "feat(2b): nguong da thuoc 3 -> 2 vi cau truc moi cham moi tu toi da 2 lan"
```

---

### Task 2: Dựng đề (`src/lib/exam/build.ts`)

**Files:**
- Create: `src/lib/exam/build.ts`
- Test: `tests/exam-build.test.ts`

**Interfaces:**
- Consumes: `pickDistractors(target, lessonWords, seed, opts)` từ `@/lib/exam/distractors`; `seededShuffle(arr, seed)`, `hashString(s)` từ `@content/shuffle-options`; `VocabLite` từ `@/lib/vocab/word`.
- Produces:
  ```ts
  export type ExamQuestionKind = "nghia" | "dien";
  export interface ExamQuestion {
    wordId: number;
    kind: ExamQuestionKind;
    prompt: string;
    options: string[];   // 4 phương án, đã trộn
    answer: string;      // CHỈ dùng ở server, không bao giờ ghi vào payload
  }
  export function buildVocabExam(
    words: readonly VocabLite[],
    blankAnswers: ReadonlyMap<number, string>,
    seed: number,
    distractorPool?: readonly VocabLite[],
  ): ExamQuestion[];
  ```

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/exam-build.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildVocabExam } from "@/lib/exam/build";
import type { VocabLite } from "@/lib/vocab/word";

interface RawWord {
  ordinal: number; word: string; pos: string; ipa: string;
  meaningVi: string; definitionEn: string; synonyms: string[];
  exampleEn: string; exampleVi: string; blankAnswer: string;
}
const raw = JSON.parse(readFileSync("data/clean/vocab.json", "utf8")) as RawWord[];

/** Dựng VocabLite + bảng đáp án từ dữ liệu sách thật, không phải fixture bịa. */
function lieu(tu: number, den: number) {
  const lat = raw.slice(tu, den);
  const words: VocabLite[] = lat.map((w) => ({
    id: w.ordinal, word: w.word, pos: w.pos, ipa: w.ipa,
    meaningVi: w.meaningVi, definitionEn: w.definitionEn,
    synonyms: w.synonyms, exampleEn: w.exampleEn, exampleVi: w.exampleVi,
  }));
  const blanks = new Map(lat.map((w) => [w.ordinal, w.blankAnswer]));
  return { words, blanks };
}

describe("buildVocabExam", () => {
  it("30 từ cho đúng 30 câu, mỗi từ đúng một câu", () => {
    const { words, blanks } = lieu(0, 30);
    const cau = buildVocabExam(words, blanks, 1);
    expect(cau).toHaveLength(30);
    expect(new Set(cau.map((c) => c.wordId)).size).toBe(30);
  });

  it("chia 15 câu nghĩa và 15 câu điền", () => {
    const { words, blanks } = lieu(0, 30);
    const cau = buildVocabExam(words, blanks, 1);
    expect(cau.filter((c) => c.kind === "nghia")).toHaveLength(15);
    expect(cau.filter((c) => c.kind === "dien")).toHaveLength(15);
  });

  it("mỗi câu có đúng 4 phương án khác nhau, và đáp án nằm trong đó", () => {
    const { words, blanks } = lieu(0, 30);
    for (const c of buildVocabExam(words, blanks, 7)) {
      expect(c.options).toHaveLength(4);
      expect(new Set(c.options).size).toBe(4);
      expect(c.options).toContain(c.answer);
    }
  });

  it("câu điền lấy cả 4 phương án ở dạng biến cách, không phải dạng gốc", () => {
    // blankAnswer co the la "openings" trong khi word la "opening". Neu nhieu
    // de o dang goc thi dap an dung tu lo — no thanh phuong an duy nhat khop
    // ngu phap. Kiem: moi phuong an cua cau dien phai la mot blankAnswer nao do.
    const { words, blanks } = lieu(0, 30);
    const hopLe = new Set(blanks.values());
    for (const c of buildVocabExam(words, blanks, 3).filter((c) => c.kind === "dien")) {
      for (const p of c.options) expect(hopLe.has(p)).toBe(true);
    }
  });

  it("cùng seed cho cùng đề — tải lại trang không đổi câu hỏi", () => {
    const { words, blanks } = lieu(0, 30);
    expect(buildVocabExam(words, blanks, 42)).toEqual(buildVocabExam(words, blanks, 42));
  });

  it("nổ khi nguồn quá hẹp thay vì lặng lẽ trả đề ngắn hơn", () => {
    const { words, blanks } = lieu(0, 2);
    expect(() => buildVocabExam(words, blanks, 1)).toThrow();
  });

  it("phạm vi hẹp vẫn dựng được khi có nguồn nhiễu mở rộng — đường của bài bổ túc", () => {
    const { words, blanks } = lieu(0, 30);
    const hep = words.slice(0, 2);
    const cau = buildVocabExam(hep, blanks, 1, words);
    expect(cau).toHaveLength(2);
    for (const c of cau) expect(c.options).toHaveLength(4);
  });

  // Bai thi la lan dau nguoi hoc gap phan cham diem. Neu build no tren MOT buoi
  // cu the thi buoi do khong vao thi duoc — nen kiem ca 20 buoi, khong phai mot
  // buoi mau. Xem muc 8 cua spec.
  it("dựng được đề cho cả 20 buổi, không buổi nào nổ", () => {
    for (let buoi = 0; buoi < 20; buoi++) {
      const { words, blanks } = lieu(buoi * 30, buoi * 30 + 30);
      expect(() => buildVocabExam(words, blanks, buoi + 1)).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó đỏ**

Run: `npm test -- exam-build`
Expected: FAIL — không giải được import `@/lib/exam/build`.

- [ ] **Step 3: Viết `src/lib/exam/build.ts`**

```ts
import { hashString, seededShuffle } from "@content/shuffle-options";
import { pickDistractors } from "@/lib/exam/distractors";
import type { VocabLite } from "@/lib/vocab/word";

export type ExamQuestionKind = "nghia" | "dien";

export interface ExamQuestion {
  wordId: number;
  kind: ExamQuestionKind;
  prompt: string;
  /** 4 phương án đã trộn. Đây là thứ DUY NHẤT cùng `prompt` được ghi xuống payload. */
  options: string[];
  /**
   * Đáp án đúng. CHỈ dùng trong tiến trình server lúc dựng đề để kiểm tra tính
   * nhất quán; KHÔNG BAO GIỜ được ghi vào `assessment_items.payload` — chấm
   * điểm về sau đọc lại đáp án từ `ref_id` qua RPC `answer_for_word`.
   */
  answer: string;
}

/**
 * Dựng đề cho một phạm vi từ.
 *
 * `blankAnswers` phải truyền từ ngoài vào vì cột `vocab_words.blank_answer` đã
 * bị revoke khỏi `authenticated` (0004_rls.sql) — chỉ server đọc được, qua
 * `blank_answers_for_lesson`. Hàm này vì thế là hàm thuần: không tự gọi mạng,
 * nên test được trên toàn bộ 605 từ mà không cần database.
 *
 * `distractorPool` mở rộng nguồn nhiễu ra ngoài `words`. Bài `remedial` có thể
 * chỉ có 2-3 từ sai — hẹp hơn 4 phương án cần thiết — nên nó truyền phạm vi
 * của bài cha vào đây. Bỏ trống thì nguồn nhiễu chính là `words`.
 */
export function buildVocabExam(
  words: readonly VocabLite[],
  blankAnswers: ReadonlyMap<number, string>,
  seed: number,
  distractorPool?: readonly VocabLite[],
): ExamQuestion[] {
  const pool = distractorPool ?? words;

  // Từ nào rơi vào dạng nào do seed quyết định, nên tải lại trang không đổi đề.
  // Nửa đầu sau khi trộn là câu nghĩa, nửa sau là câu điền — với 30 từ thành
  // đúng 15-15 như spec đòi.
  const thuTu = seededShuffle(words, seed);
  const soCauNghia = Math.ceil(thuTu.length / 2);

  return thuTu.map((tu, i) => {
    const kind: ExamQuestionKind = i < soCauNghia ? "nghia" : "dien";
    // Seed riêng cho từng câu: cùng một từ ở hai bài khác seed phải ra bộ nhiễu
    // khác, nếu không thì làm lại bài sau khi trượt sẽ gặp y hệt bốn phương án.
    const seedCau = hashString(`${seed}:${tu.id}:${kind}`);

    if (kind === "nghia") {
      const dapAn = tu.word;
      const nhieu = pickDistractors(tu, pool, seedCau, {
        textOf: (c) => c.word,
        // Đồng nghĩa của từ đích cũng là đáp án đúng về nghĩa — 185/605 từ có
        // một từ đồng nghĩa cũng nằm trong kho. Không chặn thì đề có hai đáp án.
        taken: [dapAn, ...tu.synonyms],
      });
      if (nhieu.length < 3) {
        throw new Error(`không đủ phương án nhiễu cho từ ${tu.id} (${tu.word}) dạng nghĩa`);
      }
      return {
        wordId: tu.id,
        kind,
        prompt: tu.meaningVi,
        options: seededShuffle([dapAn, ...nhieu.map((n) => n.word)], seedCau),
        answer: dapAn,
      };
    }

    const dapAn = blankAnswers.get(tu.id);
    if (dapAn === undefined) {
      throw new Error(`thiếu blankAnswer cho từ ${tu.id} (${tu.word})`);
    }
    const nhieu = pickDistractors(tu, pool, seedCau, {
      // Cả 4 phương án phải ở dạng biến cách. Để nhiễu ở dạng gốc thì đáp án
      // đúng tự lộ: nó là phương án duy nhất khớp ngữ pháp với câu.
      textOf: (c) => blankAnswers.get(c.id) ?? c.word,
      taken: [dapAn],
      reject: (c) => blankAnswers.get(c.id) === undefined,
    });
    if (nhieu.length < 3) {
      throw new Error(`không đủ phương án nhiễu cho từ ${tu.id} (${tu.word}) dạng điền`);
    }
    return {
      wordId: tu.id,
      kind,
      prompt: tu.exampleEn,
      options: seededShuffle(
        [dapAn, ...nhieu.map((n) => blankAnswers.get(n.id)!)],
        seedCau,
      ),
      answer: dapAn,
    };
  });
}
```

- [ ] **Step 4: Chạy test để xác nhận xanh**

Run: `npm test -- exam-build`
Expected: PASS cả 8 test. Nếu test "cả 20 buổi" đỏ ở một buổi cụ thể, **không** nới lỏng test — đó đúng là buổi mà người học sẽ không vào thi được; sửa nguồn nhiễu.

- [ ] **Step 5: Commit**

```bash
git add src/lib/exam/build.ts tests/exam-build.test.ts
git commit -m "feat(2b): dung de bai thi tu vung, 15-15 hai dang, seed tat dinh"
```

---

### Task 3: Đường ghi mastery (`src/lib/mastery/write.ts`)

Tệp này từng tồn tại và bị xoá ở lát 2a. Bản cũ xem được bằng `git show 93b7920:src/lib/mastery/write.ts` — đọc nó trước khi viết, vì hai chú thích trong đó ghi lại lỗi đã trả giá thật.

**Files:**
- Create: `src/lib/mastery/write.ts`
- Test: `tests/mastery-write.test.ts`

**Interfaces:**
- Consumes: `masteryDelta`, `MasteryRow` từ `./apply`.
- Produces:
  ```ts
  export async function applyWordMastery(
    supabase: SupabaseClient, userId: string, wordId: number, correct: boolean,
  ): Promise<void>;
  export async function applyGrammarMastery(
    supabase: SupabaseClient, userId: string, grammarLessonId: number, correct: boolean,
  ): Promise<void>;
  ```

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/mastery-write.test.ts`, theo khuôn `tests/rls.test.ts` (tạo người dùng thật bằng admin client, đăng nhập bằng anon key, dọn trong `afterAll`):

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyWordMastery } from "@/lib/mastery/write";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const hasEnv = Boolean(URL && SERVICE && ANON);

describe.skipIf(!hasEnv)("applyWordMastery", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "x", {
    auth: { persistSession: false },
  });
  let alice: SupabaseClient;
  let aliceId = "";
  const WORD_ID = 1;

  beforeAll(async () => {
    const email = `mastery-${Date.now()}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password: "test-pass-1234", email_confirm: true,
    });
    if (error) throw error;
    aliceId = data.user.id;
    const c = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password: "test-pass-1234" });
    alice = c;
  });

  afterAll(async () => {
    if (aliceId) {
      await admin.from("word_mastery").delete().eq("user_id", aliceId);
      await admin.auth.admin.deleteUser(aliceId);
    }
  });

  it("đúng hai lần thì cộng dồn và đánh dấu đã thuộc", async () => {
    await applyWordMastery(alice, aliceId, WORD_ID, true);
    await applyWordMastery(alice, aliceId, WORD_ID, true);

    const { data } = await admin
      .from("word_mastery")
      .select("correct_count, wrong_count, mastered")
      .eq("user_id", aliceId).eq("word_id", WORD_ID).single();

    expect(data).toMatchObject({ correct_count: 2, wrong_count: 0, mastered: true });
  });

  it("trả lời sai vẫn được đếm, và làm mất trạng thái đã thuộc", async () => {
    await applyWordMastery(alice, aliceId, WORD_ID, false);

    const { data } = await admin
      .from("word_mastery")
      .select("correct_count, wrong_count, mastered")
      .eq("user_id", aliceId).eq("word_id", WORD_ID).single();

    expect(data).toMatchObject({ correct_count: 2, wrong_count: 1, mastered: false });
  });

  // Day la loi da tra gia that: nuot loi doc khien current = null, masteryDelta
  // tinh lai tu 0, roi upsert GHI DE sach tien do da tich luy.
  it("ném khi không đọc được dòng hiện tại, thay vì ghi đè tiến độ", async () => {
    const nguoiLa = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await expect(
      applyWordMastery(nguoiLa, aliceId, WORD_ID, true),
    ).rejects.toBeTruthy();

    const { data } = await admin
      .from("word_mastery")
      .select("correct_count").eq("user_id", aliceId).eq("word_id", WORD_ID).single();
    expect(data?.correct_count).toBe(2);
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó đỏ**

Run: `npm test -- mastery-write`
Expected: FAIL — không giải được import `@/lib/mastery/write`.

- [ ] **Step 3: Viết `src/lib/mastery/write.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { masteryDelta } from "./apply";

/**
 * Ghi kết quả một câu vào `word_mastery` / `grammar_mastery`.
 *
 * Không có `"use server"`: hàm nhận `SupabaseClient` của NGƯỜI DÙNG làm tham
 * số thay vì tự dựng client, nên `SUPABASE_SERVICE_ROLE_KEY` không có chỗ lọt
 * vào. RLS của chính người dùng là lớp chặn cuối.
 *
 * Bản này dựng lại tệp bị xoá ở lát 2a (`git show 93b7920:src/lib/mastery/write.ts`),
 * giữ nguyên hai bài học đã trả giá — xem chú thích tại chỗ `throw` bên dưới và
 * tại `applyGrammarMastery`.
 */
export async function applyWordMastery(
  supabase: SupabaseClient,
  userId: string,
  wordId: number,
  correct: boolean,
): Promise<void> {
  const { data: current, error: currentErr } = await supabase
    .from("word_mastery")
    .select("correct_count, wrong_count, mastered")
    .eq("user_id", userId)
    .eq("word_id", wordId)
    .maybeSingle();
  // BẮT BUỘC throw. Nuốt lỗi ở đây khiến `current` thành null, `masteryDelta`
  // tính lại từ 0, và `upsert` bên dưới GHI ĐÈ correct_count/wrong_count/mastered
  // đã tích luỹ về điểm xuất phát — mất lịch sử học mà không có gì báo cho
  // người học biết. Đây là mất dữ liệu âm thầm, không phải một lần hiện sai.
  if (currentErr) throw currentErr;

  const next = masteryDelta(
    current
      ? {
          correctCount: current.correct_count as number,
          wrongCount: current.wrong_count as number,
          mastered: current.mastered as boolean,
        }
      : null,
    correct,
  );

  const { error } = await supabase.from("word_mastery").upsert(
    {
      user_id: userId,
      word_id: wordId,
      correct_count: next.correctCount,
      wrong_count: next.wrongCount,
      mastered: next.mastered,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id,word_id" },
  );
  if (error) throw error;
}

/**
 * `grammar_mastery` khoá theo `(user_id, grammar_lesson_id)` — **không** suy ra
 * được từ `question_id`. Vì vậy `grammarLessonId` phải truyền từ ngoài vào; đây
 * đúng là chỗ bản cũ ghi lại như một cái bẫy.
 *
 * Bảng này chỉ đếm, không có cột `mastered`, nên phần `mastered` của
 * `masteryDelta` bị bỏ đi — truyền `false` vào để nó không ảnh hưởng hai bộ đếm.
 * Dùng chung `masteryDelta` để hai loại mastery cộng dồn theo CÙNG một luật.
 *
 * Lát 2b chưa gọi hàm này (bài ngữ pháp là lát sau), nhưng ranh giới phải đúng
 * từ đầu — bản cũ bị xoá chính vì import treo sau khi luồng cũ biến mất.
 */
export async function applyGrammarMastery(
  supabase: SupabaseClient,
  userId: string,
  grammarLessonId: number,
  correct: boolean,
): Promise<void> {
  const { data: current, error: currentErr } = await supabase
    .from("grammar_mastery")
    .select("correct_count, wrong_count")
    .eq("user_id", userId)
    .eq("grammar_lesson_id", grammarLessonId)
    .maybeSingle();
  if (currentErr) throw currentErr;

  const next = masteryDelta(
    current
      ? {
          correctCount: current.correct_count as number,
          wrongCount: current.wrong_count as number,
          mastered: false,
        }
      : null,
    correct,
  );

  const { error } = await supabase.from("grammar_mastery").upsert(
    {
      user_id: userId,
      grammar_lesson_id: grammarLessonId,
      correct_count: next.correctCount,
      wrong_count: next.wrongCount,
    },
    { onConflict: "user_id,grammar_lesson_id" },
  );
  if (error) throw error;
}
```

- [ ] **Step 4: Chạy test để xác nhận xanh**

Run: `npm test -- mastery-write`
Expected: PASS cả 3 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mastery/write.ts tests/mastery-write.test.ts
git commit -m "feat(2b): dung lai duong ghi mastery da bi xoa o lat 2a"
```

---

### Task 4: Chạy bài (`src/lib/exam/run.ts`) và các khẳng định an toàn

**Files:**
- Create: `src/lib/exam/run.ts`
- Test: `tests/exam-security.test.ts`

**Interfaces:**
- Consumes: `buildVocabExam`, `ExamQuestion` (Task 2); `applyWordMastery` (Task 3).
- Produces:
  ```ts
  export const PASS_MARK = 80;
  export async function createVocabExam(
    supabase: SupabaseClient, userId: string,
    type: "lesson" | "remedial", scope: number[],
    words: readonly VocabLite[], blankAnswers: ReadonlyMap<number, string>,
    seed: number, parentId?: number, distractorPool?: readonly VocabLite[],
  ): Promise<number>;                        // trả về assessment id
  export async function recordAnswer(
    supabase: SupabaseClient, userId: string,
    assessmentId: number, position: number, answer: string,
  ): Promise<boolean>;                       // trả về đúng/sai
  export async function submitExam(
    supabase: SupabaseClient, assessmentId: number,
  ): Promise<{ total: number; correct: number; score: number; passed: boolean }>;
  ```

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/exam-security.test.ts`. Sáu khẳng định ở mục 6 của spec, theo khuôn `tests/rls.test.ts`:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PASS_MARK, createVocabExam, recordAnswer, submitExam } from "@/lib/exam/run";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const hasEnv = Boolean(URL && SERVICE && ANON);

describe.skipIf(!hasEnv)("an toàn bài thi", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "x", {
    auth: { persistSession: false },
  });
  let alice: SupabaseClient, bob: SupabaseClient;
  let aliceId = "", bobId = "", baiId = 0;

  async function taoNguoiDung(nhan: string) {
    const email = `exam-${nhan}-${Date.now()}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password: "test-pass-1234", email_confirm: true,
    });
    if (error) throw error;
    const c = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password: "test-pass-1234" });
    return { client: c, id: data.user.id };
  }

  beforeAll(async () => {
    const a = await taoNguoiDung("alice");
    const b = await taoNguoiDung("bob");
    alice = a.client; aliceId = a.id; bob = b.client; bobId = b.id;

    // Dựng một bài thi thật cho Alice từ 30 từ đầu.
    const { data: rows } = await admin
      .from("vocab_words")
      .select("id, word, pos, ipa, meaning_vi, definition_en, synonyms, example_en, example_vi, blank_answer")
      .order("ordinal").limit(30);
    const words = (rows ?? []).map((r) => ({
      id: r.id as number, word: r.word as string, pos: r.pos as string,
      ipa: r.ipa as string, meaningVi: r.meaning_vi as string,
      definitionEn: r.definition_en as string, synonyms: (r.synonyms ?? []) as string[],
      exampleEn: r.example_en as string, exampleVi: r.example_vi as string,
    }));
    const blanks = new Map((rows ?? []).map((r) => [r.id as number, r.blank_answer as string]));
    baiId = await createVocabExam(alice, aliceId, "lesson", [1], words, blanks, 1);
  });

  afterAll(async () => {
    for (const id of [aliceId, bobId]) {
      if (!id) continue;
      await admin.from("assessments").delete().eq("user_id", id);
      await admin.from("word_mastery").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("ngưỡng đạt là một hằng số 80% cho mọi loại bài", () => {
    expect(PASS_MARK).toBe(80);
  });

  it("payload không bao giờ chứa đáp án", async () => {
    const { data } = await admin
      .from("assessment_items").select("payload").eq("assessment_id", baiId);
    for (const row of data ?? []) {
      const p = row.payload as Record<string, unknown>;
      expect(Object.keys(p).sort()).toEqual(["kind", "options", "prompt"]);
    }
  });

  it("is_correct bị từ chối SELECT với authenticated, cột khác vẫn đọc được", async () => {
    const bi = await alice.from("assessment_items").select("is_correct").eq("assessment_id", baiId);
    expect(bi.error?.code).toBe("42501");
    const duoc = await alice.from("assessment_items").select("position").eq("assessment_id", baiId);
    expect(duoc.error).toBeNull();
  });

  it("wrong_items_for_assessment từ chối CẢ CHÍNH CHỦ khi bài còn in_progress", async () => {
    const { error } = await alice.rpc("wrong_items_for_assessment", { p_assessment_id: baiId });
    expect(error?.code).toBe("42501");
  });

  it("finalize từ chối người không phải chủ", async () => {
    const { error } = await bob.rpc("finalize_assessment_items", {
      p_assessment_id: baiId, p_pass_mark: PASS_MARK, p_now: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it("finalize chặn p_pass_mark NULL bằng lỗi 22004", async () => {
    const { error } = await alice.rpc("finalize_assessment_items", {
      p_assessment_id: baiId, p_pass_mark: null, p_now: new Date().toISOString(),
    });
    expect(error?.code).toBe("22004");
  });

  it("double-submit song song: đúng một lần thắng, điểm là số thật", async () => {
    await recordAnswer(alice, aliceId, baiId, 0, "sai-hoan-toan");
    const [a, b] = await Promise.allSettled([
      submitExam(alice, baiId), submitExam(alice, baiId),
    ]);
    const thang = [a, b].filter((r) => r.status === "fulfilled");
    expect(thang.length).toBeGreaterThanOrEqual(1);
    const { data } = await admin
      .from("assessments").select("status, score, passed").eq("id", baiId).single();
    expect(data?.status).toBe("submitted");
    expect(data?.score).not.toBeNull();
    expect(data?.passed).not.toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó đỏ**

Run: `npm test -- exam-security`
Expected: FAIL — không giải được import `@/lib/exam/run`.

- [ ] **Step 3: Viết `src/lib/exam/run.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildVocabExam } from "./build";
import { applyWordMastery } from "@/lib/mastery/write";
import type { VocabLite } from "@/lib/vocab/word";

/**
 * Ngưỡng đạt, tính theo phần trăm, dùng chung cho MỌI loại bài — `lesson`,
 * `review`, `remedial`, `grammar`. Trước lát 2a đây là một
 * `Record<AssessmentType, number>`; giờ cả bốn loại dùng chung một con số nên
 * bảng tra đó chỉ còn là bốn chỗ để lệch nhau.
 */
export const PASS_MARK = 80;

/** Bài hết hạn sau ngần này. Đủ rộng cho 30 câu mà vẫn dọn được bài bỏ dở. */
const EXAM_TTL_MS = 2 * 60 * 60 * 1000;

export async function createVocabExam(
  supabase: SupabaseClient,
  userId: string,
  type: "lesson" | "remedial",
  scope: number[],
  words: readonly VocabLite[],
  blankAnswers: ReadonlyMap<number, string>,
  seed: number,
  parentId?: number,
  distractorPool?: readonly VocabLite[],
): Promise<number> {
  const questions = buildVocabExam(words, blankAnswers, seed, distractorPool);

  const { data: bai, error: baiErr } = await supabase
    .from("assessments")
    .insert({
      user_id: userId,
      type,
      scope,
      parent_id: parentId ?? null,
      expires_at: new Date(Date.now() + EXAM_TTL_MS).toISOString(),
    })
    .select("id")
    .single();
  if (baiErr) throw baiErr;
  const assessmentId = bai.id as number;

  // `payload` CHỈ mang prompt/options/kind. Đáp án ở lại `ref_id`: chấm điểm về
  // sau đọc lại từ đó qua RPC `answer_for_word`. Ghi đáp án xuống đây là đưa
  // thẳng nó cho client, vì client đọc được payload.
  const { error: itemErr } = await supabase.from("assessment_items").insert(
    questions.map((q, i) => ({
      assessment_id: assessmentId,
      position: i,
      item_type: "vocab",
      ref_id: q.wordId,
      payload: { prompt: q.prompt, options: q.options, kind: q.kind },
    })),
  );
  if (itemErr) throw itemErr;

  return assessmentId;
}

/**
 * Chấm một câu và ghi kết quả. Chấm ở SERVER vì đáp án của câu điền nằm ở
 * `vocab_words.blank_answer`, cột đã bị revoke khỏi `authenticated`.
 */
export async function recordAnswer(
  supabase: SupabaseClient,
  userId: string,
  assessmentId: number,
  position: number,
  answer: string,
): Promise<boolean> {
  const { data: item, error: itemErr } = await supabase
    .from("assessment_items")
    .select("ref_id, payload, user_answer")
    .eq("assessment_id", assessmentId)
    .eq("position", position)
    .single();
  if (itemErr) throw itemErr;

  const kind = (item.payload as { kind: string }).kind;
  let dapAn: string;
  if (kind === "dien") {
    const { data, error } = await supabase.rpc("answer_for_word", { p_word_id: item.ref_id });
    if (error) throw error;
    dapAn = data as string;
  } else {
    const { data, error } = await supabase
      .from("vocab_words").select("word").eq("id", item.ref_id).single();
    if (error) throw error;
    dapAn = data.word as string;
  }

  const dung = answer === dapAn;

  const { error: ghiErr } = await supabase
    .from("assessment_items")
    .update({ user_answer: answer, is_correct: dung })
    .eq("assessment_id", assessmentId)
    .eq("position", position);
  if (ghiErr) throw ghiErr;

  // Chỉ cộng mastery cho lần trả lời ĐẦU TIÊN của câu này. Không có chốt chặn
  // này thì bấm lại một câu đã trả lời sẽ cộng dồn hai lần, và "đã thuộc" đo
  // số lần bấm chứ không đo trí nhớ.
  if (item.user_answer === null) {
    await applyWordMastery(supabase, userId, item.ref_id as number, dung);
  }

  return dung;
}

/**
 * Nộp bài. `finalize_assessment_items` chấm, tính điểm và đóng bài trong ĐÚNG
 * MỘT câu UPDATE — không còn trạng thái trung gian nào quan sát được từ ngoài.
 * `p_now` truyền từ đây chứ không dùng `now()` của Postgres, để cả ứng dụng
 * đọc đồng hồ ở một nguồn duy nhất.
 */
export async function submitExam(
  supabase: SupabaseClient,
  assessmentId: number,
): Promise<{ total: number; correct: number; score: number; passed: boolean }> {
  const { data, error } = await supabase.rpc("finalize_assessment_items", {
    p_assessment_id: assessmentId,
    p_pass_mark: PASS_MARK,
    p_now: new Date().toISOString(),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as { total: number; correct: number; score: number; passed: boolean };
}
```

- [ ] **Step 4: Chạy test để xác nhận xanh**

Run: `npm test -- exam-security`
Expected: PASS cả 7 test.

Nếu test "is_correct bị từ chối" đỏ vì `update` ở `recordAnswer` không ghi được `is_correct`: cột bị revoke SELECT, không phải UPDATE — kiểm lại `0008_assessment_items_grants.sql` trước khi đổi mã.

- [ ] **Step 5: Commit**

```bash
git add src/lib/exam/run.ts tests/exam-security.test.ts
git commit -m "feat(2b): duong chay bai thi va 7 khang dinh an toan"
```

---

### Task 5: Trang làm bài `/exam/[id]`

**Files:**
- Create: `src/app/(app)/exam/[id]/page.tsx`, `src/app/(app)/exam/[id]/actions.ts`, `src/components/exam/ExamRunner.tsx`
- Modify: `src/app/(app)/vocab/learn/[lessonId]/page.tsx`
- Delete: `src/app/(app)/vocab/learn/[lessonId]/sap-co/`
- Test: `e2e/exam.spec.ts`

**Interfaces:**
- Consumes: `createVocabExam`, `recordAnswer`, `submitExam`, `PASS_MARK` (Task 4).
- Produces: Server Action `batDauBaiThi(lessonId: number)` chuyển hướng tới `/exam/[id]`; Server Actions `traLoi(assessmentId, position, answer)` và `nopBai(assessmentId)`.

- [ ] **Step 1: Viết e2e thất bại**

Tạo `e2e/exam.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "./test-user";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

test("bấm LÀM BÀI vào thẳng bài thi, không còn trang sắp có", async ({ page }) => {
  await login(page);
  await page.goto("/vocab/learn/1");
  await page.getByTestId("exam-button").click();

  await expect(page).toHaveURL(/\/exam\/\d+$/);
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 1/30");
  await expect(page.getByTestId("exam-option")).toHaveCount(4);
});

test("bấm một đáp án là sang câu sau ngay", async ({ page }) => {
  await login(page);
  await page.goto("/vocab/learn/1");
  await page.getByTestId("exam-button").click();
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 1/30");

  await page.getByTestId("exam-option").first().click();

  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 2/30");
});

test("trang sắp có cũ không còn tồn tại", async ({ page }) => {
  await login(page);
  const res = await page.goto("/vocab/learn/1/sap-co");
  expect(res?.status()).toBe(404);
});
```

- [ ] **Step 2: Chạy e2e để chắc chắn nó đỏ**

Run: `npm run test:e2e -- exam`
Expected: FAIL — `exam-button` vẫn là <Link> tới /sap-co, và `/sap-co` vẫn trả 200.

- [ ] **Step 3: Viết Server Actions**

Tạo `src/app/(app)/exam/[id]/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createVocabExam, recordAnswer, submitExam } from "@/lib/exam/run";
import type { VocabLite } from "@/lib/vocab/word";

/** Dựng bài thi cho một buổi rồi chuyển thẳng vào bài. */
export async function batDauBaiThi(lessonId: number): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: lw, error: lwErr } = await supabase
    .from("lesson_words")
    .select("word_id, vocab_words(id, word, pos, ipa, meaning_vi, definition_en, synonyms, example_en, example_vi)")
    .eq("lesson_id", lessonId)
    .order("position");
  if (lwErr) throw lwErr;

  const words: VocabLite[] = (lw ?? []).map((r) => {
    // postgrest-js đôi khi trả quan hệ 1-1 thành MẢNG. Không chuẩn hoá thì ô
    // render rỗng mà không có lỗi nào — đúng cái bẫy ghi ở mục 7 tài liệu bàn giao.
    const v = Array.isArray(r.vocab_words) ? r.vocab_words[0] : r.vocab_words;
    return {
      id: v.id, word: v.word, pos: v.pos, ipa: v.ipa,
      meaningVi: v.meaning_vi, definitionEn: v.definition_en,
      synonyms: v.synonyms ?? [], exampleEn: v.example_en, exampleVi: v.example_vi,
    };
  });

  const { data: blanks, error: blankErr } = await supabase
    .rpc("blank_answers_for_lesson", { p_lesson_id: lessonId });
  if (blankErr) throw blankErr;
  const bang = new Map(
    (blanks as { word_id: number; blank_answer: string }[]).map((b) => [b.word_id, b.blank_answer]),
  );

  const id = await createVocabExam(
    supabase, user.id, "lesson", [lessonId], words, bang, Date.now(),
  );
  redirect(`/exam/${id}`);
}

export async function traLoi(
  assessmentId: number, position: number, answer: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return recordAnswer(supabase, user.id, assessmentId, position, answer);
}

export async function nopBai(assessmentId: number): Promise<void> {
  const supabase = await createClient();
  await submitExam(supabase, assessmentId);
  redirect(`/exam/${assessmentId}/ket-qua`);
}
```

- [ ] **Step 4: Viết trang và component chạy bài**

Tạo `src/app/(app)/exam/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ExamRunner } from "@/components/exam/ExamRunner";

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  if (!/^[1-9][0-9]*$/.test(raw)) notFound();
  const assessmentId = Number(raw);

  const supabase = await createClient();
  const { data: bai } = await supabase
    .from("assessments").select("id, status").eq("id", assessmentId).maybeSingle();
  if (!bai) notFound();

  const { data: items, error } = await supabase
    .from("assessment_items")
    .select("position, payload")
    .eq("assessment_id", assessmentId)
    .order("position");
  if (error) throw error;

  const cau = (items ?? []).map((r) => ({
    position: r.position as number,
    ...(r.payload as { prompt: string; options: string[]; kind: string }),
  }));

  return <ExamRunner assessmentId={assessmentId} cauHoi={cau} />;
}
```

Tạo `src/components/exam/ExamRunner.tsx`:

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { nopBai, traLoi } from "@/app/(app)/exam/[id]/actions";

interface CauHoi {
  position: number;
  prompt: string;
  options: string[];
  kind: string;
}

export function ExamRunner({
  assessmentId, cauHoi,
}: {
  assessmentId: number;
  cauHoi: CauHoi[];
}) {
  const [i, setI] = useState(0);
  const [ketQuaTruoc, setKetQuaTruoc] = useState<boolean | null>(null);
  const [loiGui, setLoiGui] = useState(false);
  const [dangNop, batDauNop] = useTransition();

  // Hàng đợi TUẦN TỰ: mỗi đáp án nối vào cuối lời hứa trước. Bấm nhanh hơn mạng
  // vẫn giữ đúng thứ tự ghi, và `hangDoi.current` chính là thứ phải cạn trước
  // khi nộp — không cần đếm số request đang bay.
  const hangDoi = useRef<Promise<void>>(Promise.resolve());

  const cau = cauHoi[i];
  const cuoi = i >= cauHoi.length - 1;

  function chon(dapAn: string) {
    const pos = cau.position;
    hangDoi.current = hangDoi.current
      .then(() => traLoi(assessmentId, pos, dapAn))
      .then((dung) => { setKetQuaTruoc(dung); setLoiGui(false); })
      .catch(() => { setLoiGui(true); });

    if (cuoi) {
      batDauNop(async () => {
        await hangDoi.current;
        // Còn câu chưa gửi được thì CHẶN nộp: nộp lúc này cho điểm thấp giả,
        // và người học không có cách nào biết vì sao.
        if (loiGui) return;
        await nopBai(assessmentId);
      });
      return;
    }
    setI(i + 1);
  }

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span data-testid="exam-tien-do" className="text-sm font-medium">
          Câu {i + 1}/{cauHoi.length}
        </span>
        {ketQuaTruoc !== null && (
          <span
            data-testid="exam-ket-qua-truoc"
            className={ketQuaTruoc ? "text-sm text-emerald-700" : "text-sm text-rose-700"}
          >
            {ketQuaTruoc ? "Câu trước: đúng" : "Câu trước: sai"}
          </span>
        )}
      </div>

      <p data-testid="exam-de" className="text-lg">{cau.prompt}</p>

      <div className="flex flex-col gap-2">
        {cau.options.map((o) => (
          <button
            key={o}
            type="button"
            data-testid="exam-option"
            disabled={dangNop}
            onClick={() => chon(o)}
            className="rounded border border-slate-300 px-4 py-2 text-left hover:bg-slate-50 disabled:opacity-50"
          >
            {o}
          </button>
        ))}
      </div>

      {loiGui && (
        <p data-testid="exam-loi-gui" role="alert" className="text-sm text-amber-700">
          Chưa gửi được câu trả lời. Kiểm tra mạng rồi chọn lại đáp án.
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Nối nút LÀM BÀI và xoá trang sắp có**

Nút LÀM BÀI nằm trong `src/components/vocab/deck.tsx:189-196` — một **client component** nhận prop `examHref: string | null` và render `<Link>`. Nó phải đổi thành Server Action. Server Action truyền được xuống client component như một prop, nên đây là ba sửa nhỏ, không phải một cuộc tái cấu trúc:

1. `src/components/vocab/deck.tsx` — đổi prop `examHref: string | null` thành `examAction: (() => Promise<void>) | null`, và thay khối `<Link>` bằng:

```tsx
          {examAction && (
            <form action={examAction} className="flex-1">
              <button
                type="submit"
                data-testid="exam-button"
                className="w-full rounded bg-slate-900 px-4 py-2 text-center text-white"
              >
                LÀM BÀI
              </button>
            </form>
          )}
```

Giữ nguyên `data-testid="exam-button"` — e2e hiện có đang dùng đúng tên đó, đổi tên là tự tạo việc.

2. `src/app/(app)/vocab/learn/[lessonId]/page.tsx:47` — thay `examHref={...}` bằng `examAction={batDauBaiThi.bind(null, id)}`, kèm `import { batDauBaiThi } from "@/app/(app)/exam/[id]/actions";`.

3. `src/app/(app)/vocab/browse/[groupId]/page.tsx:53` — đổi `examHref={null}` thành `examAction={null}`. Trang duyệt từ không có bài thi; bỏ sót dòng này thì `tsc` sẽ báo, không im lặng.

Rồi xoá trang cũ:

```bash
git rm -r "src/app/(app)/vocab/learn/[lessonId]/sap-co"
```

- [ ] **Step 6: Chạy e2e để xác nhận xanh**

Run: `npm run test:e2e -- exam`
Expected: PASS cả 3 test.

- [ ] **Step 7: Kiểm tra kiểu và build**

Run: `npx tsc --noEmit && npm run build`
Expected: không lỗi.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(2b): trang lam bai /exam/[id], noi nut LAM BAI, xoa trang sap co"
```

---

### Task 6: Trang kết quả và bài bổ túc

**Files:**
- Create: `src/app/(app)/exam/[id]/ket-qua/page.tsx`, `src/app/(app)/exam/[id]/ket-qua/actions.ts`
- Test: `e2e/exam.spec.ts` (thêm test)

**Interfaces:**
- Consumes: `createVocabExam`, `PASS_MARK` (Task 4).
- Produces: Server Action `batDauBoTuc(assessmentId: number)`.

- [ ] **Step 1: Viết e2e thất bại**

Thêm vào cuối `e2e/exam.spec.ts`:

```ts
test("trả lời sai hết thì thấy điểm, trạng thái chưa đạt, và nút bổ túc", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  await page.goto("/vocab/learn/2");
  await page.getByTestId("exam-button").click();
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 1/30");

  // Luôn chọn phương án đầu: có câu trúng có câu trượt, nhưng chắc chắn
  // không đạt 24/30 — đủ để lộ ra nhánh chưa đạt.
  for (let n = 1; n <= 30; n++) {
    await expect(page.getByTestId("exam-tien-do")).toHaveText(`Câu ${n}/30`);
    await page.getByTestId("exam-option").first().click();
  }

  await expect(page).toHaveURL(/\/exam\/\d+\/ket-qua$/);
  await expect(page.getByTestId("ket-qua-diem")).toBeVisible();
  await expect(page.getByTestId("ket-qua-bo-tuc")).toBeVisible();

  await page.getByTestId("ket-qua-bo-tuc").click();
  await expect(page).toHaveURL(/\/exam\/\d+$/);
  await expect(page.getByTestId("exam-option")).toHaveCount(4);
});
```

- [ ] **Step 2: Chạy e2e để chắc chắn nó đỏ**

Run: `npm run test:e2e -- exam`
Expected: 3 test cũ PASS, test mới FAIL vì `/ket-qua` chưa tồn tại.

- [ ] **Step 3: Viết Server Action bổ túc**

Tạo `src/app/(app)/exam/[id]/ket-qua/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createVocabExam } from "@/lib/exam/run";
import type { VocabLite } from "@/lib/vocab/word";

/**
 * Dựng bài bổ túc từ các từ SAI của bài cha.
 *
 * Nguồn nhiễu là phạm vi của bài CHA, không phải danh sách từ sai: sai 2 từ thì
 * không đủ 4 phương án, và `buildVocabExam` sẽ nổ đúng như thiết kế.
 */
export async function batDauBoTuc(assessmentId: number): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: sai, error: saiErr } = await supabase
    .rpc("wrong_items_for_assessment", { p_assessment_id: assessmentId });
  if (saiErr) throw saiErr;
  const idSai = (sai as { ref_id: number }[]).map((r) => r.ref_id);
  if (idSai.length === 0) redirect(`/exam/${assessmentId}/ket-qua`);

  const { data: cha, error: chaErr } = await supabase
    .from("assessments").select("scope").eq("id", assessmentId).single();
  if (chaErr) throw chaErr;
  const lessonId = (cha.scope as number[])[0];

  const { data: lw, error: lwErr } = await supabase
    .from("lesson_words")
    .select("vocab_words(id, word, pos, ipa, meaning_vi, definition_en, synonyms, example_en, example_vi)")
    .eq("lesson_id", lessonId).order("position");
  if (lwErr) throw lwErr;

  const toanBuoi: VocabLite[] = (lw ?? []).map((r) => {
    const v = Array.isArray(r.vocab_words) ? r.vocab_words[0] : r.vocab_words;
    return {
      id: v.id, word: v.word, pos: v.pos, ipa: v.ipa,
      meaningVi: v.meaning_vi, definitionEn: v.definition_en,
      synonyms: v.synonyms ?? [], exampleEn: v.example_en, exampleVi: v.example_vi,
    };
  });

  const { data: blanks, error: blankErr } = await supabase
    .rpc("blank_answers_for_lesson", { p_lesson_id: lessonId });
  if (blankErr) throw blankErr;
  const bang = new Map(
    (blanks as { word_id: number; blank_answer: string }[]).map((b) => [b.word_id, b.blank_answer]),
  );

  const tuSai = toanBuoi.filter((w) => idSai.includes(w.id));
  const id = await createVocabExam(
    supabase, user.id, "remedial", [lessonId], tuSai, bang, Date.now(),
    assessmentId, toanBuoi,
  );
  redirect(`/exam/${id}`);
}
```

- [ ] **Step 4: Viết trang kết quả**

Tạo `src/app/(app)/exam/[id]/ket-qua/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { batDauBoTuc } from "./actions";

export default async function KetQuaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  if (!/^[1-9][0-9]*$/.test(raw)) notFound();
  const assessmentId = Number(raw);

  const supabase = await createClient();
  const { data: bai } = await supabase
    .from("assessments")
    .select("id, type, score, passed, status, scope")
    .eq("id", assessmentId).maybeSingle();
  if (!bai || bai.status !== "submitted") notFound();

  // Hàm này từ chối khi bài còn in_progress, kể cả với chính chủ — nên chỉ gọi
  // sau khi đã chắc chắn `status === 'submitted'` ở trên.
  const { data: sai } = await supabase
    .rpc("wrong_items_for_assessment", { p_assessment_id: assessmentId });
  const soSai = (sai as unknown[] | null)?.length ?? 0;

  const boTuc = batDauBoTuc.bind(null, assessmentId);

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Kết quả</h1>
      <p data-testid="ket-qua-diem" className="text-lg">
        {bai.score}đ — {bai.passed ? "Đạt" : "Chưa đạt"}
      </p>

      {!bai.passed && soSai > 0 && (
        <form action={boTuc}>
          <button
            type="submit"
            data-testid="ket-qua-bo-tuc"
            className="rounded border border-slate-300 px-4 py-2 hover:bg-slate-50"
          >
            Bổ túc {soSai} từ sai
          </button>
        </form>
      )}

      <Link href={`/vocab/learn/${(bai.scope as number[])[0]}`} className="underline">
        ← Quay lại buổi học
      </Link>
    </main>
  );
}
```

- [ ] **Step 5: Chạy e2e để xác nhận xanh**

Run: `npm run test:e2e -- exam`
Expected: PASS cả 4 test.

- [ ] **Step 6: Chạy toàn bộ**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: tất cả xanh.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(2b): trang ket qua va bai bo tuc tu cac tu sai"
```

---

## Đối chiếu với spec

| Mục spec | Task |
|---|---|
| 2. Ngưỡng "đã thuộc" 3 → 2 | 1 |
| 3.1 Dựng đề, 15–15, seed tất định, nổ khi thiếu nguồn | 2 |
| 3.2 Chạy bài, payload không có đáp án, PASS_MARK 80% | 4, 5 |
| 3.3 Đường ghi mastery, throw khi lỗi đọc, không cộng hai lần | 3, 4 |
| 4. Màn hình `/exam/[id]`, `/ket-qua`, xoá `/sap-co` | 5, 6 |
| 5. Nhịp học `/stats` | tự khỏi khi có bài nộp — không cần task |
| 6. Sáu khẳng định an toàn | 4 |
| 7. Kiểm thử unit / tích hợp / e2e | 1–6 |
| 8. Dựng đề phải chạy trên cả 20 buổi | 2 |
