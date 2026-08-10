# Kế hoạch triển khai: Phase 1c — ôn tập, kiểm tra, bổ túc

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Người học đi hết một chu kỳ đầy đủ — 4 buổi, 2 bài ôn tập, 1 bài kiểm tra 60 phút — và khi trượt thì có đường bổ túc rồi làm lại để đi tiếp.

**Architecture:** Chuỗi 35 hoạt động là tất định, suy ra từ chỉ số slot bằng phép chia — cùng khuôn `itemAt` ở 1b. `nextStep()` là hàm thuần đọc tiến độ buổi học và danh sách bài đánh giá rồi trả về bước kế tiếp, kể cả nhánh bổ túc và làm lại. Khác 1b ở một điểm cốt lõi: đề bài đánh giá được **sinh sẵn và lưu xuống** `assessment_items`, vì có đồng hồ nên bộ câu phải cố định. Đồng hồ nằm ở server qua `assessments.expires_at`.

**Tech Stack:** Next 16.3 · React 19.2 · Tailwind 4.3 · `@supabase/ssr` 0.12 · Vitest 2.1 · Playwright 1.62 · Supabase

**Spec:** [`docs/superpowers/specs/2026-08-08-phase1c-review-test-remedial-design.md`](../specs/2026-08-08-phase1c-review-test-remedial-design.md)

## Global Constraints

- **Không dùng `Math.random()` ở bất kỳ đâu.** Mọi ngẫu nhiên gieo hạt tất định bằng `hashString` + `seededShuffle` trong `src/content/shuffle-options.ts`.
- **Server không bao giờ nhận trạng thái từ client làm nguồn sự thật.** Vị trí, thời gian còn lại, điểm — tất cả đọc từ database.
- **Đồng hồ ở server.** `expires_at` là nguồn duy nhất. Không bao giờ hỏi trình duyệt bây giờ là mấy giờ.
- **Mã ứng dụng trong `src/` không được đụng `SUPABASE_SERVICE_ROLE_KEY`.** Đáp án lấy qua hai RPC `security definer` đã có: `answer_for_word(bigint)`, `answer_for_question(bigint)`.
- Trên server luôn `supabase.auth.getUser()`, không bao giờ `getSession()`.
- **Mọi lệnh xoá trong test phải giới hạn theo `user_id` của chính tài khoản test nó vừa tạo.** Database production có tài khoản thật của chủ dự án.
- Tài khoản test mang đuôi `@test.local` và có timestamp.
- Giao diện tiếng Việt; nội dung tiếng Anh giữ nguyên. Giữ thuật ngữ: `danh từ`, `tính từ`, `trạng từ`, `mệnh đề quan hệ`.
- Không thêm thư viện nào.
- Không đổi `data-testid` đã có: `lesson-row`, `continue-link`, `learn-heading`, `auth-error`, `auth-success`, `lesson-progress`, `flashcard-word`, `choice-option`, `fill-input`, `fill-sentence`, `answer-feedback`, `next-button`, `lesson-score`.

## Bản đồ tệp

| Tệp | Trách nhiệm |
|---|---|
| `supabase/migrations/0007_assessment_parent.sql` | Cột `parent_id` nối bài bổ túc với lần thử đã trượt |
| `src/lib/assessment/slots.ts` | `slotAt(index)` — chuỗi 35 hoạt động |
| `src/lib/assessment/next-step.ts` | `nextStep()` — máy trạng thái, kể cả nhánh trượt |
| `src/lib/assessment/build.ts` | `buildAssessmentItems()` — sinh đề, tái dùng `pickDistractors` |
| `src/lib/assessment/run.ts` | `startAssessment` · `answerItem` · `submitAssessment` — **không** `"use server"` |
| `src/app/(app)/assessment/[id]/actions.ts` | Server Action bọc `run.ts` |
| `src/app/(app)/assessment/[id]/page.tsx` | Một trang cho cả ba loại bài |
| `src/components/assessment/assessment-runner.tsx` | Điều phối làm bài |
| `src/components/assessment/countdown.tsx` | Đồng hồ đếm ngược, chỉ hiển thị |
| `src/components/assessment/assessment-done.tsx` | Màn hình kết quả |
| `src/app/(app)/dashboard/page.tsx` | **Sửa**: 35 dòng thay vì 20 |
| `tests/corpus.test.ts` | **Sửa**: thêm nhánh quét đề ôn tập và kiểm tra |
| `src/app/(auth)/actions.ts` | **Sửa**: xử lý mã lỗi `email_exists` |
| `src/lib/lesson/build-item.ts` | **Sửa**: guard khi thiếu phương án nhiễu |
| `src/lib/lesson/session.ts` · `src/components/lesson/flashcard.tsx` | **Sửa**: RPC theo buổi trả `blank_answer`, sửa biến cách thẻ gặp từ |

**Sai lệch có chủ ý so với spec mục 6.5:** spec liệt kê ba route `review/[id]`, `test/[id]`, `remedial/[id]`. Kế hoạch dùng **một** route `assessment/[id]`. Ba route render cùng một component từ cùng một dữ liệu, chỉ khác URL, là trùng lặp thuần tuý — và `assessments.type` đã mang sẵn thông tin phân loại. Nếu bạn muốn ba URL riêng cho dễ đọc, nói trước khi bắt đầu.

---

### Task 1: Chuỗi 35 hoạt động

**Files:**
- Create: `src/lib/assessment/slots.ts`
- Test: `tests/slots.test.ts`

**Interfaces:**
- Consumes: không có
- Produces:
  - `type SlotKind = "lesson" | "review" | "test"`
  - `interface Slot { kind: SlotKind; lessons: number[] }` — `lessons` là số thứ tự buổi (1..20)
  - `const TOTAL_SLOTS = 35`
  - `slotAt(index: number): Slot` — ném `RangeError` ngoài `0..34`

- [ ] **Step 1: Viết test đỏ**

Tạo `tests/slots.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { slotAt, TOTAL_SLOTS } from "@/lib/assessment/slots";

describe("slotAt", () => {
  it("chương trình có đúng 35 hoạt động", () => {
    expect(TOTAL_SLOTS).toBe(35);
  });

  it("chu kỳ 1 đúng thứ tự spec mục 5.1", () => {
    expect(slotAt(0)).toEqual({ kind: "lesson", lessons: [1] });
    expect(slotAt(1)).toEqual({ kind: "lesson", lessons: [2] });
    expect(slotAt(2)).toEqual({ kind: "review", lessons: [1, 2] });
    expect(slotAt(3)).toEqual({ kind: "lesson", lessons: [3] });
    expect(slotAt(4)).toEqual({ kind: "lesson", lessons: [4] });
    expect(slotAt(5)).toEqual({ kind: "review", lessons: [3, 4] });
    expect(slotAt(6)).toEqual({ kind: "test", lessons: [1, 2, 3, 4] });
  });

  it("chu kỳ 2 bắt đầu ở slot 7 với buổi 5", () => {
    expect(slotAt(7)).toEqual({ kind: "lesson", lessons: [5] });
    expect(slotAt(9)).toEqual({ kind: "review", lessons: [5, 6] });
    expect(slotAt(13)).toEqual({ kind: "test", lessons: [5, 6, 7, 8] });
  });

  it("chu kỳ cuối kết thúc ở slot 34 với bài kiểm tra buổi 17-20", () => {
    expect(slotAt(28)).toEqual({ kind: "lesson", lessons: [17] });
    expect(slotAt(34)).toEqual({ kind: "test", lessons: [17, 18, 19, 20] });
  });

  it("mọi slot buổi học phủ đúng 20 buổi, mỗi buổi một lần", () => {
    const seen: number[] = [];
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const s = slotAt(i);
      if (s.kind === "lesson") seen.push(s.lessons[0]!);
    }
    expect(seen).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("có đúng 10 bài ôn tập và 5 bài kiểm tra", () => {
    const kinds = Array.from({ length: TOTAL_SLOTS }, (_, i) => slotAt(i).kind);
    expect(kinds.filter((k) => k === "review")).toHaveLength(10);
    expect(kinds.filter((k) => k === "test")).toHaveLength(5);
  });

  it("ném lỗi khi ngoài biên", () => {
    expect(() => slotAt(-1)).toThrow(RangeError);
    expect(() => slotAt(35)).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

Run: `npx vitest run tests/slots.test.ts`
Expected: FAIL — không phân giải được `@/lib/assessment/slots`.

- [ ] **Step 3: Viết cài đặt**

Tạo `src/lib/assessment/slots.ts`:

```ts
/**
 * Chuỗi 35 hoạt động của chương trình, TẤT ĐỊNH — suy ra từ chỉ số bằng phép
 * chia, không lưu xuống database. Cùng khuôn `itemAt` ở lát 1b.
 *
 * 20 buổi chia 5 chu kỳ, mỗi chu kỳ 7 hoạt động:
 *   Buổi b, Buổi b+1, ÔN(b,b+1), Buổi b+2, Buổi b+3, ÔN(b+2,b+3), KIỂM TRA(b..b+3)
 */

export type SlotKind = "lesson" | "review" | "test";

export interface Slot {
  kind: SlotKind;
  /** Số thứ tự buổi, 1..20. Một phần tử với `lesson`, hai với `review`, bốn với `test`. */
  lessons: number[];
}

const SLOTS_PER_CYCLE = 7;
const LESSONS_PER_CYCLE = 4;
const CYCLES = 5;
export const TOTAL_SLOTS = CYCLES * SLOTS_PER_CYCLE; // 35

/** Vị trí trong chu kỳ → hoạt động, tính theo buổi cơ sở `b`. */
const PATTERN: ReadonlyArray<(b: number) => Slot> = [
  (b) => ({ kind: "lesson", lessons: [b] }),
  (b) => ({ kind: "lesson", lessons: [b + 1] }),
  (b) => ({ kind: "review", lessons: [b, b + 1] }),
  (b) => ({ kind: "lesson", lessons: [b + 2] }),
  (b) => ({ kind: "lesson", lessons: [b + 3] }),
  (b) => ({ kind: "review", lessons: [b + 2, b + 3] }),
  (b) => ({ kind: "test", lessons: [b, b + 1, b + 2, b + 3] }),
];

export function slotAt(index: number): Slot {
  if (!Number.isInteger(index) || index < 0 || index >= TOTAL_SLOTS) {
    throw new RangeError(`slot ${index} ngoài biên 0..${TOTAL_SLOTS - 1}`);
  }
  const cycle = Math.floor(index / SLOTS_PER_CYCLE);
  const within = index % SLOTS_PER_CYCLE;
  const baseLesson = cycle * LESSONS_PER_CYCLE + 1;
  return PATTERN[within]!(baseLesson);
}
```

- [ ] **Step 4: Chạy test để xác nhận xanh**

Run: `npx vitest run tests/slots.test.ts`
Expected: PASS — 7 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assessment/slots.ts tests/slots.test.ts
git commit -m "feat(1c): chuoi 35 hoat dong cua chuong trinh"
```

---

### Task 2: Migration `0007` — nối bài bổ túc với lần thử đã trượt

**Files:**
- Create: `supabase/migrations/0007_assessment_parent.sql`
- Test: `tests/assessment-parent-schema.test.ts`

**Interfaces:**
- Consumes: không có
- Produces: `assessments.parent_id bigint references assessments(id) on delete cascade`, `null` với bài thường

- [ ] **Step 1: Viết test đỏ**

Tạo `tests/assessment-parent-schema.test.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(URL && SERVICE);

describe.skipIf(!hasEnv)("schema parent_id cua assessments", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "noop", {
    auth: { persistSession: false },
  });
  const email = `parent-probe-${Date.now()}@test.local`;
  let userId = "";

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email, password: "parent-pass-1234", email_confirm: true,
      user_metadata: { display_name: "Người thử parent" },
    });
    if (error) throw error;
    userId = data.user!.id;
  });

  afterAll(async () => {
    // CHỈ xoá theo user_id của chính tài khoản này.
    if (userId) {
      await admin.from("assessments").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("bài bổ túc trỏ được tới lần thử đã trượt", async () => {
    const later = new Date(Date.now() + 60_000).toISOString();

    const { data: parent, error: pErr } = await admin.from("assessments").insert({
      user_id: userId, type: "review", scope: [1, 2],
      status: "submitted", score: 60, passed: false, expires_at: later,
    }).select("id").single();
    expect(pErr).toBeNull();

    const { data: child, error: cErr } = await admin.from("assessments").insert({
      user_id: userId, type: "remedial", scope: [1, 2],
      parent_id: parent!.id, expires_at: later,
    }).select("id, parent_id").single();
    expect(cErr).toBeNull();
    expect(child!.parent_id).toBe(parent!.id);
  });

  it("bài thường có parent_id null", async () => {
    const later = new Date(Date.now() + 60_000).toISOString();
    const { data } = await admin.from("assessments").insert({
      user_id: userId, type: "test", scope: [1, 2, 3, 4], expires_at: later,
    }).select("parent_id").single();
    expect(data!.parent_id).toBeNull();
  });

  it("xoá lần thử gốc thì bài bổ túc biến mất theo", async () => {
    const later = new Date(Date.now() + 60_000).toISOString();
    const { data: p } = await admin.from("assessments").insert({
      user_id: userId, type: "review", scope: [5, 6],
      status: "submitted", passed: false, expires_at: later,
    }).select("id").single();
    const { data: c } = await admin.from("assessments").insert({
      user_id: userId, type: "remedial", scope: [5, 6],
      parent_id: p!.id, expires_at: later,
    }).select("id").single();

    await admin.from("assessments").delete().eq("id", p!.id);
    const { data: gone } = await admin.from("assessments").select("id").eq("id", c!.id);
    expect(gone).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

Run: `npx vitest run tests/assessment-parent-schema.test.ts`
Expected: FAIL — PostgREST báo không tìm thấy cột `parent_id`.

- [ ] **Step 3: Viết migration**

Tạo `supabase/migrations/0007_assessment_parent.sql`:

```sql
-- Bai bo tuc luon gan voi MOT lan thu da truot. Khong co cot nay, nextStep phai
-- doan moi lien he bang (type, scope, started_at) — va khi mot nguoi truot cung
-- mot bai HAI lan, hai bai bo tuc cung scope chi phan biet duoc bang thu tu thoi
-- gian. Do la loai logic dung cho toi lan dau tien no sai, va khi sai thi nguoi
-- hoc bi dua vao bai bo tuc cua lan truot cu.
--
-- on delete cascade: xoa lan thu goc thi bai bo tuc cua no khong con y nghia.

alter table assessments
  add column if not exists parent_id bigint references assessments(id) on delete cascade;

create index if not exists assessments_parent_id_idx on assessments (parent_id);
```

- [ ] **Step 4: Áp migration lên Supabase**

CLI trên máy đăng nhập tài khoản khác nên `supabase link` không dùng được. Đi đường dashboard:

```bash
pbcopy < supabase/migrations/0007_assessment_parent.sql
```

Mở https://supabase.com/dashboard/project/efouimcmdufsaywudcgx/sql/new → dán **nguyên cả tệp, chạy một lần** → **Run**.
Expected: *Success. No rows returned*.

- [ ] **Step 5: Chạy test để xác nhận xanh**

Run: `npx vitest run tests/assessment-parent-schema.test.ts`
Expected: PASS — 3 test.

- [ ] **Step 6: Không phá bộ test sẵn có**

Run: `npm test`
Expected: toàn bộ xanh.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0007_assessment_parent.sql tests/assessment-parent-schema.test.ts
git commit -m "feat(1c): migration 0007 — noi bai bo tuc voi lan thu da truot"
```

---

### Task 3: `nextStep()` — máy trạng thái

**Files:**
- Create: `src/lib/assessment/next-step.ts`
- Test: `tests/next-step.test.ts`

**Interfaces:**
- Consumes: `slotAt`, `TOTAL_SLOTS`, `Slot`, `SlotKind` từ `@/lib/assessment/slots`
- Produces:
  - `type AssessmentType = "review" | "test" | "remedial"`
  - `type AssessmentStatus = "in_progress" | "submitted" | "expired"`
  - `interface AssessmentRow { id: number; type: AssessmentType; scope: number[]; status: AssessmentStatus; passed: boolean | null; expiresAt: string; parentId: number | null }`
  - `interface LessonDone { ordinal: number; completed: boolean }`
  - `type Action = { kind: "lesson"; lesson: number } | { kind: "start"; type: AssessmentType; scope: number[]; parentId: number | null } | { kind: "resume"; assessmentId: number } | { kind: "close-expired"; assessmentId: number } | { kind: "done" }`
  - `nextStep(lessons: readonly LessonDone[], assessments: readonly AssessmentRow[], now: Date): { slotIndex: number; action: Action }`

  `now` truyền vào chứ không đọc `Date.now()` bên trong — để test kiểm được nhánh quá hạn mà không phải chờ.

- [ ] **Step 1: Viết test đỏ**

Tạo `tests/next-step.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextStep } from "@/lib/assessment/next-step";
import type { AssessmentRow, LessonDone } from "@/lib/assessment/next-step";

const NOW = new Date("2026-08-08T10:00:00Z");
const LATER = new Date("2026-08-08T11:00:00Z").toISOString();
const EARLIER = new Date("2026-08-08T09:00:00Z").toISOString();

const lessons = (doneUpTo: number): LessonDone[] =>
  Array.from({ length: 20 }, (_, i) => ({ ordinal: i + 1, completed: i + 1 <= doneUpTo }));

const review = (over: Partial<AssessmentRow> = {}): AssessmentRow => ({
  id: 1, type: "review", scope: [1, 2], status: "submitted",
  passed: true, expiresAt: LATER, parentId: null, ...over,
});

describe("nextStep", () => {
  it("chưa học gì thì bước đầu là buổi 1", () => {
    expect(nextStep(lessons(0), [], NOW)).toEqual({
      slotIndex: 0, action: { kind: "lesson", lesson: 1 },
    });
  });

  it("xong buổi 1 thì sang buổi 2", () => {
    expect(nextStep(lessons(1), [], NOW).action).toEqual({ kind: "lesson", lesson: 2 });
  });

  it("xong buổi 1 và 2 thì tới bài ôn tập, chưa có lần thử nào", () => {
    expect(nextStep(lessons(2), [], NOW)).toEqual({
      slotIndex: 2,
      action: { kind: "start", type: "review", scope: [1, 2], parentId: null },
    });
  });

  it("bài ôn tập đang dở và còn hạn thì tiếp tục", () => {
    const a = review({ id: 7, status: "in_progress", passed: null, expiresAt: LATER });
    expect(nextStep(lessons(2), [a], NOW).action).toEqual({ kind: "resume", assessmentId: 7 });
  });

  it("bài ôn tập đang dở nhưng quá hạn thì đóng nó lại", () => {
    const a = review({ id: 8, status: "in_progress", passed: null, expiresAt: EARLIER });
    expect(nextStep(lessons(2), [a], NOW).action).toEqual({
      kind: "close-expired", assessmentId: 8,
    });
  });

  it("ôn tập đã qua thì sang buổi 3", () => {
    expect(nextStep(lessons(2), [review()], NOW).action).toEqual({ kind: "lesson", lesson: 3 });
  });

  it("ôn tập trượt và chưa có bổ túc thì làm bổ túc, trỏ về lần thử đó", () => {
    const a = review({ id: 9, passed: false });
    expect(nextStep(lessons(2), [a], NOW).action).toEqual({
      kind: "start", type: "remedial", scope: [1, 2], parentId: 9,
    });
  });

  it("bổ túc đã qua thì làm lại chính bài đã trượt, đề mới", () => {
    const failed = review({ id: 9, passed: false });
    const rem: AssessmentRow = {
      id: 10, type: "remedial", scope: [1, 2], status: "submitted",
      passed: true, expiresAt: LATER, parentId: 9,
    };
    expect(nextStep(lessons(2), [failed, rem], NOW).action).toEqual({
      kind: "start", type: "review", scope: [1, 2], parentId: null,
    });
  });

  it("bổ túc cũng trượt thì làm lại chính bài bổ túc, không sinh tầng mới", () => {
    const failed = review({ id: 9, passed: false });
    const rem: AssessmentRow = {
      id: 10, type: "remedial", scope: [1, 2], status: "submitted",
      passed: false, expiresAt: LATER, parentId: 9,
    };
    expect(nextStep(lessons(2), [failed, rem], NOW).action).toEqual({
      kind: "start", type: "remedial", scope: [1, 2], parentId: 9,
    });
  });

  it("làm lại rồi qua thì mới sang buổi 3", () => {
    const failed = review({ id: 9, passed: false });
    const rem: AssessmentRow = {
      id: 10, type: "remedial", scope: [1, 2], status: "submitted",
      passed: true, expiresAt: LATER, parentId: 9,
    };
    const retry = review({ id: 11, passed: true });
    expect(nextStep(lessons(2), [failed, rem, retry], NOW).action).toEqual({
      kind: "lesson", lesson: 3,
    });
  });

  it("xong hết 20 buổi và mọi bài đánh giá thì trả về done", () => {
    const all: AssessmentRow[] = [];
    let id = 100;
    for (const scope of [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20]]) {
      all.push({ id: id++, type: "review", scope, status: "submitted", passed: true, expiresAt: LATER, parentId: null });
    }
    for (const scope of [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]) {
      all.push({ id: id++, type: "test", scope, status: "submitted", passed: true, expiresAt: LATER, parentId: null });
    }
    expect(nextStep(lessons(20), all, NOW).action).toEqual({ kind: "done" });
  });

  it("lần thử gần nhất mới là lần được xét, không phải lần đầu", () => {
    const first = review({ id: 1, passed: false });
    const rem: AssessmentRow = {
      id: 2, type: "remedial", scope: [1, 2], status: "submitted",
      passed: true, expiresAt: LATER, parentId: 1,
    };
    const second = review({ id: 3, passed: true });
    expect(nextStep(lessons(2), [first, rem, second], NOW).action).toEqual({
      kind: "lesson", lesson: 3,
    });
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

Run: `npx vitest run tests/next-step.test.ts`
Expected: FAIL — không phân giải được `@/lib/assessment/next-step`.

- [ ] **Step 3: Viết cài đặt**

Tạo `src/lib/assessment/next-step.ts`:

```ts
import { slotAt, TOTAL_SLOTS, type Slot } from "./slots";

export type AssessmentType = "review" | "test" | "remedial";
export type AssessmentStatus = "in_progress" | "submitted" | "expired";

export interface AssessmentRow {
  id: number;
  type: AssessmentType;
  scope: number[];
  status: AssessmentStatus;
  passed: boolean | null;
  /** ISO 8601. Nguồn sự thật duy nhất về thời hạn — xem spec mục 6.2. */
  expiresAt: string;
  parentId: number | null;
}

export interface LessonDone {
  ordinal: number;
  completed: boolean;
}

export type Action =
  | { kind: "lesson"; lesson: number }
  | { kind: "start"; type: AssessmentType; scope: number[]; parentId: number | null }
  | { kind: "resume"; assessmentId: number }
  | { kind: "close-expired"; assessmentId: number }
  | { kind: "done" };

const sameScope = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Lần thử gần nhất khớp điều kiện. Mảng vào theo thứ tự tăng dần của id. */
function latest(
  rows: readonly AssessmentRow[],
  match: (r: AssessmentRow) => boolean,
): AssessmentRow | null {
  let found: AssessmentRow | null = null;
  for (const r of rows) if (match(r) && (found === null || r.id > found.id)) found = r;
  return found;
}

/**
 * Bước kế tiếp của người học trên chuỗi 35 hoạt động.
 *
 * `now` là tham số chứ không đọc Date.now() bên trong — để test kiểm được nhánh
 * quá hạn mà không phải chờ, và để mọi so sánh thời gian có một nguồn duy nhất.
 *
 * Bổ túc và bài làm lại KHÔNG chiếm slot riêng: chúng là nhánh chèn động vào
 * slot đang đứng. Chuỗi 35 slot không đổi; chỉ đường đi qua nó dài ra khi trượt.
 */
export function nextStep(
  lessons: readonly LessonDone[],
  assessments: readonly AssessmentRow[],
  now: Date,
): { slotIndex: number; action: Action } {
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const slot: Slot = slotAt(i);

    if (slot.kind === "lesson") {
      const ordinal = slot.lessons[0]!;
      const done = lessons.find((l) => l.ordinal === ordinal)?.completed ?? false;
      if (!done) return { slotIndex: i, action: { kind: "lesson", lesson: ordinal } };
      continue;
    }

    const attempt = latest(
      assessments,
      (r) => r.type === slot.kind && sameScope(r.scope, slot.lessons),
    );

    if (attempt === null) {
      return {
        slotIndex: i,
        action: { kind: "start", type: slot.kind, scope: slot.lessons, parentId: null },
      };
    }

    if (attempt.status === "in_progress") {
      const expired = new Date(attempt.expiresAt).getTime() <= now.getTime();
      return {
        slotIndex: i,
        action: expired
          ? { kind: "close-expired", assessmentId: attempt.id }
          : { kind: "resume", assessmentId: attempt.id },
      };
    }

    if (attempt.passed === true) continue;

    // Trượt. Xét bài bổ túc gần nhất trỏ về chính lần thử này.
    const rem = latest(
      assessments,
      (r) => r.type === "remedial" && r.parentId === attempt.id,
    );

    if (rem === null || rem.passed === false) {
      // Chưa bổ túc, hoặc bổ túc cũng trượt → làm (lại) bổ túc. Nhánh PHẲNG:
      // parentId vẫn trỏ lần thử gốc, không sinh bổ túc-của-bổ túc.
      return {
        slotIndex: i,
        action: { kind: "start", type: "remedial", scope: slot.lessons, parentId: attempt.id },
      };
    }

    if (rem.status === "in_progress") {
      const expired = new Date(rem.expiresAt).getTime() <= now.getTime();
      return {
        slotIndex: i,
        action: expired
          ? { kind: "close-expired", assessmentId: rem.id }
          : { kind: "resume", assessmentId: rem.id },
      };
    }

    // Bổ túc đã qua → làm lại chính bài đã trượt, đề mới.
    return {
      slotIndex: i,
      action: { kind: "start", type: slot.kind, scope: slot.lessons, parentId: null },
    };
  }

  return { slotIndex: TOTAL_SLOTS - 1, action: { kind: "done" } };
}
```

- [ ] **Step 4: Chạy test để xác nhận xanh**

Run: `npx vitest run tests/next-step.test.ts`
Expected: PASS — 12 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assessment/next-step.ts tests/next-step.test.ts
git commit -m "feat(1c): nextStep — may trang thai cua chuoi 35 hoat dong"
```

---

### Task 4: Sinh đề bài đánh giá

**Files:**
- Create: `src/lib/assessment/build.ts`
- Modify: `tests/corpus.test.ts`
- Test: `tests/build-assessment.test.ts`

**Interfaces:**
- Consumes: `VocabLite`, `GrammarLite`, `pickDistractors` từ `@/lib/lesson/build-item`; `hashString`, `seededShuffle` từ `@content/shuffle-options`; `AssessmentType` từ `@/lib/assessment/next-step`
- Produces:
  - `interface AssessmentItemSpec { position: number; itemType: "vocab" | "grammar"; refId: number; payload: { prompt: string; options: string[] } }`
  - `const COUNTS: Record<"review" | "test", { vocab: number; grammar: number }>` = `{ review: { vocab: 20, grammar: 5 }, test: { vocab: 48, grammar: 12 } }`
  - `buildAssessmentItems(type: "review" | "test", words: readonly VocabLite[], grammar: readonly GrammarLite[], seed: number): AssessmentItemSpec[]`
  - `buildRemedialItems(wrong: readonly AssessmentItemSpec[]): AssessmentItemSpec[]` — đánh số lại `position` từ 0

- [ ] **Step 1: Viết test đỏ**

Tạo `tests/build-assessment.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildAssessmentItems, buildRemedialItems, COUNTS } from "@/lib/assessment/build";
import type { VocabLite, GrammarLite } from "@/lib/lesson/build-item";

const w = (id: number, pos: string): VocabLite => ({
  id, word: `word${id}`, pos, ipa: `/w${id}/`,
  meaningVi: `nghĩa ${id}`, definitionEn: `def ${id}`,
  synonyms: [`syn${id}`], exampleEn: `A ___ sentence ${id}.`,
  exampleVi: `Câu ví dụ ${id}.`, blankAnswer: `answer${id}`,
});

// 120 từ, đủ cho cả bài kiểm tra
const words: VocabLite[] = Array.from({ length: 120 }, (_, i) =>
  w(i + 1, ["n", "v", "adj", "adv"][i % 4]!),
);
const grammar: GrammarLite[] = Array.from({ length: 80 }, (_, i) => ({
  id: i + 1, stem: `Grammar ${i + 1}?`, options: [`A${i}`, `B${i}`, `C${i}`, `D${i}`],
}));

describe("buildAssessmentItems", () => {
  it("bài ôn tập đúng 25 câu: 20 từ vựng + 5 ngữ pháp", () => {
    const items = buildAssessmentItems("review", words.slice(0, 60), grammar.slice(0, 40), 42);
    expect(items).toHaveLength(25);
    expect(items.filter((i) => i.itemType === "vocab")).toHaveLength(COUNTS.review.vocab);
    expect(items.filter((i) => i.itemType === "grammar")).toHaveLength(COUNTS.review.grammar);
  });

  it("bài kiểm tra đúng 60 câu: 48 từ vựng + 12 ngữ pháp", () => {
    const items = buildAssessmentItems("test", words, grammar, 42);
    expect(items).toHaveLength(60);
    expect(items.filter((i) => i.itemType === "vocab")).toHaveLength(COUNTS.test.vocab);
    expect(items.filter((i) => i.itemType === "grammar")).toHaveLength(COUNTS.test.grammar);
  });

  it("position đánh số liên tục từ 0", () => {
    const items = buildAssessmentItems("review", words.slice(0, 60), grammar.slice(0, 40), 42);
    expect(items.map((i) => i.position)).toEqual(Array.from({ length: 25 }, (_, i) => i));
  });

  it("không câu nào hỏi lại cùng một từ hoặc cùng một câu ngữ pháp", () => {
    const items = buildAssessmentItems("test", words, grammar, 42);
    const vocabIds = items.filter((i) => i.itemType === "vocab").map((i) => i.refId);
    const grammarIds = items.filter((i) => i.itemType === "grammar").map((i) => i.refId);
    expect(new Set(vocabIds).size).toBe(vocabIds.length);
    expect(new Set(grammarIds).size).toBe(grammarIds.length);
  });

  it("mỗi câu có đúng 4 phương án, phân biệt theo nội dung", () => {
    const items = buildAssessmentItems("test", words, grammar, 42);
    for (const it of items) {
      expect(it.payload.options).toHaveLength(4);
      expect(new Set(it.payload.options).size).toBe(4);
    }
  });

  it("tất định: cùng seed cho cùng đề", () => {
    const a = buildAssessmentItems("review", words.slice(0, 60), grammar.slice(0, 40), 7);
    const b = buildAssessmentItems("review", words.slice(0, 60), grammar.slice(0, 40), 7);
    expect(a).toEqual(b);
  });

  it("seed khác cho đề khác — bài làm lại không trùng đề cũ", () => {
    const a = buildAssessmentItems("review", words.slice(0, 60), grammar.slice(0, 40), 1);
    const b = buildAssessmentItems("review", words.slice(0, 60), grammar.slice(0, 40), 999);
    expect(a.map((i) => i.refId)).not.toEqual(b.map((i) => i.refId));
  });
});

describe("buildRemedialItems", () => {
  it("giữ nguyên nội dung câu sai và đánh số lại từ 0", () => {
    const all = buildAssessmentItems("review", words.slice(0, 60), grammar.slice(0, 40), 42);
    const wrong = [all[3]!, all[10]!, all[22]!];
    const rem = buildRemedialItems(wrong);
    expect(rem).toHaveLength(3);
    expect(rem.map((i) => i.position)).toEqual([0, 1, 2]);
    expect(rem.map((i) => i.refId)).toEqual(wrong.map((i) => i.refId));
    expect(rem[0]!.payload).toEqual(wrong[0]!.payload);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

Run: `npx vitest run tests/build-assessment.test.ts`
Expected: FAIL — không phân giải được `@/lib/assessment/build`.

- [ ] **Step 3: Viết cài đặt**

Tạo `src/lib/assessment/build.ts`:

```ts
import { hashString, seededShuffle } from "@content/shuffle-options";
import { pickDistractors, type GrammarLite, type VocabLite } from "@/lib/lesson/build-item";

export interface AssessmentItemSpec {
  position: number;
  itemType: "vocab" | "grammar";
  /** id của `vocab_words` hoặc `grammar_questions`. */
  refId: number;
  /** Gửi xuống trình duyệt nguyên vẹn. KHÔNG chứa đáp án. */
  payload: { prompt: string; options: string[] };
}

/**
 * Tỷ lệ 80/20 giữa từ vựng và ngữ pháp phản ánh trọng số chương trình: mỗi buổi
 * có 30 từ nhưng chỉ 1 bài ngữ pháp. Xem spec mục 4.
 */
export const COUNTS = {
  review: { vocab: 20, grammar: 5 },
  test: { vocab: 48, grammar: 12 },
} as const;

export function buildAssessmentItems(
  type: "review" | "test",
  words: readonly VocabLite[],
  grammar: readonly GrammarLite[],
  seed: number,
): AssessmentItemSpec[] {
  const need = COUNTS[type];

  const chosenWords = seededShuffle(words, seed).slice(0, need.vocab);
  const chosenGrammar = seededShuffle(grammar, seed + 1).slice(0, need.grammar);

  const vocabItems: AssessmentItemSpec[] = chosenWords.map((word, i) => {
    const itemSeed = hashString(`${seed}:vocab:${word.id}`);
    const distractors = pickDistractors(word, words, itemSeed, {
      textOf: (c) => c.meaningVi,
      taken: [word.meaningVi],
    });
    return {
      position: i,
      itemType: "vocab" as const,
      refId: word.id,
      payload: {
        prompt: `"${word.word}" nghĩa là gì?`,
        options: seededShuffle(
          [word.meaningVi, ...distractors.map((d) => d.meaningVi)],
          itemSeed,
        ),
      },
    };
  });

  const grammarItems: AssessmentItemSpec[] = chosenGrammar.map((q, i) => ({
    position: need.vocab + i,
    itemType: "grammar" as const,
    refId: q.id,
    payload: {
      prompt: q.stem,
      options: seededShuffle(q.options, hashString(`${seed}:grammar:${q.id}`)),
    },
  }));

  return [...vocabItems, ...grammarItems];
}

/**
 * Bài bổ túc lấy nguyên các câu đã sai — cùng đề, cùng phương án — và chỉ đánh
 * số lại `position`. Giữ nguyên nội dung là có chủ ý: người học phải đối mặt
 * đúng câu họ đã sai, không phải một câu khác về cùng từ.
 */
export function buildRemedialItems(
  wrong: readonly AssessmentItemSpec[],
): AssessmentItemSpec[] {
  return wrong.map((item, i) => ({ ...item, position: i }));
}
```

- [ ] **Step 4: Chạy test để xác nhận xanh**

Run: `npx vitest run tests/build-assessment.test.ts`
Expected: PASS — 8 test.

- [ ] **Step 5: Mở rộng corpus test sang đề bài đánh giá**

Trong `tests/corpus.test.ts`, thêm một `describe` mới quét đề ôn tập và kiểm tra của cả 5 chu kỳ trên dữ liệu thật `data/clean/*.json`, khẳng định đúng những bất biến đã dùng cho buổi học:

```ts
import { buildAssessmentItems } from "@/lib/assessment/build";
import { slotAt, TOTAL_SLOTS } from "@/lib/assessment/slots";

describe("corpus — đề ôn tập và kiểm tra trên dữ liệu thật", () => {
  it("mọi bài đánh giá của cả 5 chu kỳ đều đúng bất biến", () => {
    for (let s = 0; s < TOTAL_SLOTS; s++) {
      const slot = slotAt(s);
      if (slot.kind === "lesson") continue;

      const words = wordsForLessons(slot.lessons);
      const grammar = grammarForLessons(slot.lessons);
      const items = buildAssessmentItems(slot.kind, words, grammar, s * 7919);

      for (const it of items) {
        expect(it.payload.options).toHaveLength(4);
        expect(new Set(it.payload.options).size).toBe(4);
      }
      const ids = items.filter((i) => i.itemType === "vocab").map((i) => i.refId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
```

`wordsForLessons` và `grammarForLessons` dựng từ `data/clean/lesson-plan.json`, `vocab.json`, `grammar.json`, `questions.json` — cùng cách `tests/corpus.test.ts` đã dựng dữ liệu buổi học. Tái dùng helper sẵn có trong tệp đó thay vì viết lại.

- [ ] **Step 6: Chạy corpus test**

Run: `npx vitest run tests/corpus.test.ts`
Expected: PASS. Nếu đỏ ở khẳng định "4 phương án phân biệt", đó là lỗi thật trong dữ liệu hoặc trong `pickDistractors` với phạm vi rộng hơn — **báo cáo, đừng nới lỏng assertion**. Đúng loại lỗi này đã thoát qua mọi tầng ở lát 1b.

- [ ] **Step 7: Commit**

```bash
git add src/lib/assessment/build.ts tests/build-assessment.test.ts tests/corpus.test.ts
git commit -m "feat(1c): sinh de bai danh gia + mo rong corpus test"
```

---

### Task 5: `run.ts` — bắt đầu, trả lời, nộp bài

**Files:**
- Create: `src/lib/assessment/run.ts`
- Test: `tests/assessment-run.test.ts`

**Interfaces:**
- Consumes: `buildAssessmentItems`, `buildRemedialItems`, `AssessmentItemSpec` từ `@/lib/assessment/build`; `nextStep`, `AssessmentRow` từ `@/lib/assessment/next-step`; `gradeItem` từ `@/lib/lesson/grade`; `masteryDelta` từ `@/lib/mastery/apply`; `SupabaseClient` từ `@supabase/supabase-js`
- Produces:
  - `const DURATION_MS: Record<AssessmentType, number>` = `{ review: 15*60*1000, test: 60*60*1000, remedial: 15*60*1000 }`
  - `const PASS_MARK: Record<AssessmentType, number>` = `{ review: 80, test: 70, remedial: 80 }`
  - `startAssessment(supabase, userId, type, scope, parentId, now): Promise<number>` — trả về id bài mới
  - `answerItem(supabase, userId, assessmentId, position, answer, now): Promise<{ ok: boolean; correct?: boolean }>`
  - `submitAssessment(supabase, userId, assessmentId, now): Promise<{ score: number; passed: boolean }>`
  - `closeExpired(supabase, userId, assessmentId, now): Promise<{ score: number; passed: boolean }>`

  **Không** `"use server"` trong tệp này — cùng lý do `run-submit.ts` ở 1b: trong tệp `"use server"` mọi export đều thành endpoint công khai, nên một hàm nhận `SupabaseClient` sẽ tạo ra endpoint hỏng.

  Chỉ khoá cứng thời gian với `type === "test"`. Với `review` và `remedial`, `expires_at` vẫn được ghi (cột `not null`) nhưng `answerItem` không từ chối sau mốc đó — xem spec mục 4.

- [ ] **Step 1: Viết test đỏ — chạy thật trên database**

Tạo `tests/assessment-run.test.ts`. Test này gọi thẳng logic, không qua trình duyệt.

```ts
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startAssessment, answerItem, submitAssessment, closeExpired, PASS_MARK,
} from "@/lib/assessment/run";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const hasEnv = Boolean(URL && SERVICE && ANON);

describe.skipIf(!hasEnv)("vong lam bai danh gia", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "noop", {
    auth: { persistSession: false },
  });
  const email = `assess-run-${Date.now()}@test.local`;
  const password = "assess-pass-1234";
  let userId = "";
  let user: ReturnType<typeof createClient>;

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: "Người làm bài" },
    });
    if (error) throw error;
    userId = data.user!.id;

    user = createClient(URL!, ANON!, { auth: { persistSession: false } });
    const { error: sErr } = await user.auth.signInWithPassword({ email, password });
    if (sErr) throw sErr;
  });

  afterAll(async () => {
    // CHỈ xoá theo user_id của chính tài khoản này — xem Global Constraints.
    if (userId) {
      await admin.from("assessments").delete().eq("user_id", userId);
      await admin.from("word_mastery").delete().eq("user_id", userId);
      await admin.from("grammar_mastery").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("bắt đầu bài ôn tập thì sinh đủ 25 câu, chưa câu nào có đáp án", async () => {
    const now = new Date();
    const id = await startAssessment(user, userId, "review", [1, 2], null, now);

    const { data } = await admin
      .from("assessment_items")
      .select("position, item_type, user_answer, is_correct")
      .eq("assessment_id", id)
      .order("position");

    expect(data).toHaveLength(25);
    expect(data!.every((r) => r.user_answer === null)).toBe(true);
    expect(data!.every((r) => r.is_correct === null)).toBe(true);
    expect(data!.filter((r) => r.item_type === "vocab")).toHaveLength(20);
  });

  it("trả lời sai hết thì trượt, điểm 0", async () => {
    const now = new Date();
    const id = await startAssessment(user, userId, "review", [3, 4], null, now);

    for (let p = 0; p < 25; p++) {
      await answerItem(user, userId, id, p, "chắc chắn không phải đáp án", now);
    }
    const r = await submitAssessment(user, userId, id, now);
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
    expect(PASS_MARK.review).toBe(80);
  });

  it("bài kiểm tra quá hạn thì tự đóng, câu chưa làm tính sai", async () => {
    const start = new Date();
    const id = await startAssessment(user, userId, "test", [5, 6, 7, 8], null, start);

    // Quá hạn: 61 phút sau.
    const after = new Date(start.getTime() + 61 * 60 * 1000);
    const r = await closeExpired(user, userId, id, after);

    expect(r.score).toBe(0); // không câu nào được trả lời
    expect(r.passed).toBe(false);

    const { data } = await admin
      .from("assessments").select("status, submitted_at")
      .eq("id", id).single();
    expect(data!.status).toBe("submitted");
    expect(data!.submitted_at).not.toBeNull();
  });

  it("bài kiểm tra từ chối câu trả lời sau khi hết giờ", async () => {
    const start = new Date();
    const id = await startAssessment(user, userId, "test", [9, 10, 11, 12], null, start);
    const after = new Date(start.getTime() + 61 * 60 * 1000);

    const r = await answerItem(user, userId, id, 0, "bất kỳ", after);
    expect(r.ok).toBe(false);

    const { data } = await admin
      .from("assessment_items").select("user_answer")
      .eq("assessment_id", id).eq("position", 0).single();
    expect(data!.user_answer).toBeNull();
  });

  it("bài ôn tập KHÔNG khoá cứng thời gian", async () => {
    const start = new Date();
    const id = await startAssessment(user, userId, "review", [13, 14], null, start);
    const after = new Date(start.getTime() + 61 * 60 * 1000);

    const r = await answerItem(user, userId, id, 0, "bất kỳ", after);
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

Run: `npx vitest run tests/assessment-run.test.ts`
Expected: FAIL — không phân giải được `@/lib/assessment/run`.

- [ ] **Step 3: Viết cài đặt**

Tạo `src/lib/assessment/run.ts`. Cấu trúc bắt buộc, mỗi hàm một trách nhiệm:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAssessmentItems, buildRemedialItems, type AssessmentItemSpec } from "./build";
import type { AssessmentType } from "./next-step";
import { masteryDelta } from "@/lib/mastery/apply";

export const DURATION_MS: Record<AssessmentType, number> = {
  review: 15 * 60 * 1000,
  test: 60 * 60 * 1000,
  remedial: 15 * 60 * 1000,
};

/** Ngưỡng đạt, tính theo phần trăm. Xem spec mục 4. */
export const PASS_MARK: Record<AssessmentType, number> = {
  review: 80,
  test: 70,
  remedial: 80,
};

/** Chỉ bài kiểm tra bị khoá cứng thời gian — spec mục 4. */
const HARD_LOCKED: ReadonlySet<AssessmentType> = new Set<AssessmentType>(["test"]);
```

Bốn hàm phải làm đúng những việc sau:

**`startAssessment(supabase, userId, type, scope, parentId, now)`**
1. Từ chối nếu người này đã có một bài `in_progress` (spec mục 7) — ném lỗi kèm id bài đang dở.
2. Chèn dòng `assessments` với `expires_at = now + DURATION_MS[type]`, `parent_id = parentId`.
3. Với `remedial`: đọc `assessment_items` của `parentId` có `is_correct = false`, chạy qua `buildRemedialItems`. Với `review`/`test`: đọc từ vựng và câu ngữ pháp trong `scope`, gieo hạt bằng `hashString(\`${userId}:${assessmentId}\`)` — dùng chính id vừa tạo nên bài làm lại **chắc chắn khác đề**, chạy qua `buildAssessmentItems`.
4. Chèn toàn bộ items một lần.
5. Trả về id.

**`answerItem(supabase, userId, assessmentId, position, answer, now)`**
1. Đọc `assessments` theo id; RLS đã lọc theo người dùng, vẫn thêm `.eq("user_id", userId)` cho tường minh.
2. Nếu `status !== "in_progress"` → `{ ok: false }`.
3. Nếu `HARD_LOCKED.has(type)` và `now >= expires_at` → `{ ok: false }`, **không ghi gì**.
4. Đọc item ở `position`, lấy đáp án đúng qua RPC (`answer_for_word` với `vocab`, `answer_for_question` với `grammar`), chấm bằng `gradeItem`.
5. Ghi `user_answer` và `is_correct`.
6. Cập nhật `word_mastery` hoặc `grammar_mastery` bằng `masteryDelta`, đúng khuôn `run-submit.ts` ở 1b.
7. Trả `{ ok: true, correct }`.

**`submitAssessment(supabase, userId, assessmentId, now)`** và **`closeExpired(...)`** dùng chung một hàm nội bộ `finalize`:
1. Đếm `is_correct = true` trên toàn bộ items của bài — **điểm tính từ `is_correct`, không từ bộ đếm riêng**, nên không có hai nguồn sự thật.
2. `score = Math.round(correct / total * 100)`, `passed = score >= PASS_MARK[type]`.
3. Cập nhật `assessments`: `status = "submitted"`, `score`, `passed`, `submitted_at = now`.
4. Nếu `status` đã là `submitted` thì **không làm gì**, trả về kết quả đã có (spec mục 7, chống bấm nộp hai lần).

`closeExpired` khác `submitAssessment` duy nhất ở chỗ nó được gọi bởi `nextStep` chứ không bởi người dùng; logic chấm giống hệt, nên phải gọi cùng `finalize`.

- [ ] **Step 4: Chạy test để xác nhận xanh**

Run: `npx vitest run tests/assessment-run.test.ts`
Expected: PASS — 6 test.

- [ ] **Step 5: Toàn bộ suite**

Run: `npm test`
Expected: toàn bộ xanh.

- [ ] **Step 6: Xác nhận không sót dữ liệu**

```bash
node -e "
require('dotenv').config({path:'.env.local'});
const {createClient}=require('@supabase/supabase-js');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
(async()=>{
  const u=await db.auth.admin.listUsers({page:1,perPage:1000});
  console.log('tai khoan test con lai:', u.data.users.filter(x=>x.email.endsWith('@test.local')).length);
  for(const t of ['assessments','assessment_items','word_mastery','grammar_mastery']){
    const r=await db.from(t).select('*',{count:'exact',head:true});
    console.log(t+':',r.count);
  }
})();
"
```

Expected: 0 tài khoản test, và bốn bảng đều 0 — trừ khi bạn đã tự học thật.

- [ ] **Step 7: Commit**

```bash
git add src/lib/assessment/run.ts tests/assessment-run.test.ts
git commit -m "feat(1c): bat dau, tra loi, nop bai danh gia + dong ho o server"
```

---

### Task 6: Giao diện làm bài

**Files:**
- Create: `src/app/(app)/assessment/[id]/actions.ts`, `src/app/(app)/assessment/[id]/page.tsx`, `src/components/assessment/assessment-runner.tsx`, `src/components/assessment/countdown.tsx`, `src/components/assessment/assessment-done.tsx`

**Interfaces:**
- Consumes: `startAssessment`, `answerItem`, `submitAssessment`, `PASS_MARK` từ `@/lib/assessment/run`; `createClient` từ `@/lib/supabase/server`
- Produces các `data-testid` mà Task 8 chọn theo:
  - `assessment-progress` — `N / M`
  - `assessment-prompt` — đề bài câu hiện tại
  - `choice-option` — mỗi phương án (**dùng lại đúng tên của 1b**, cùng dạng nút)
  - `countdown` — đồng hồ, chỉ có với bài kiểm tra
  - `submit-button` — nút nộp bài
  - `assessment-score` — điểm ở màn hình kết quả
  - `assessment-verdict` — `data-passed="true"` hoặc `"false"`

- [ ] **Step 1: Server Action, mỏng**

Tạo `src/app/(app)/assessment/[id]/actions.ts` — cùng khuôn `learn/[lessonId]/actions.ts` ở 1b: lấy client và user rồi uỷ quyền cho `run.ts`, không chứa logic.

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { answerItem, submitAssessment } from "@/lib/assessment/run";

export async function answerAction(assessmentId: number, position: number, answer: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("chưa đăng nhập");
  return answerItem(supabase, user.id, assessmentId, position, answer, new Date());
}

export async function submitAction(assessmentId: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("chưa đăng nhập");
  return submitAssessment(supabase, user.id, assessmentId, new Date());
}
```

- [ ] **Step 2: Trang**

`src/app/(app)/assessment/[id]/page.tsx` là Server Component. Nó phải:

1. `await params`, ép `id` sang số, `notFound()` nếu không hợp lệ.
2. Đọc `assessments` theo id, lọc thêm `.eq("user_id", user.id)` cho tường minh dù RLS đã chặn. Không thấy → `notFound()`.
3. Đọc `assessment_items` theo `assessment_id`, `order("position")`. **Chỉ chọn `position, item_type, payload, user_answer`** — không chọn `is_correct`, vì hiện đúng/sai từng câu trong lúc làm bài là để lộ đáp án.
4. Nếu `status === "submitted"` → render `AssessmentDone` với `score` và `passed` đã lưu.
5. Ngược lại → render `AssessmentRunner`, truyền `expiresAt` xuống chỉ để hiển thị, và `hardLocked = type === "test"`.

Xử lý lỗi đọc: kiểm `error` và `throw` như `learn/[lessonId]/page.tsx` đang làm — **không nuốt lỗi**. Đây là lỗi đã bị bắt ở cả 1b và 1c trước đó.

- [ ] **Step 3: `countdown.tsx`**

Client component, nhận `expiresAt: string`. Đếm ngược bằng cách so `Date.now()` với `expiresAt` mỗi giây và hiển thị `mm:ss`.

```tsx
"use client";

import { useEffect, useState } from "react";

export function Countdown({ expiresAt }: { expiresAt: string }) {
  const target = new Date(expiresAt).getTime();
  const [left, setLeft] = useState(() => Math.max(0, target - Date.now()));

  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, target - Date.now())), 1000);
    return () => clearInterval(t);
  }, [target]);

  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);

  return (
    <span
      data-testid="countdown"
      className={left < 5 * 60 * 1000 ? "font-mono text-red-600" : "font-mono"}
    >
      {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}
```

**Đồng hồ này chỉ để hiển thị.** Nó không gửi gì lên server và server không hỏi nó. Hết giờ trên màn hình thì component gọi `submitAction` một lần — nhưng nếu người dùng chặn JavaScript, `answerItem` phía server vẫn từ chối sau `expires_at`, nên không có đường lách.

- [ ] **Step 4: `assessment-runner.tsx` và `assessment-done.tsx`**

`AssessmentRunner` giữ chỉ số câu hiện tại trong `useState`, hiện `payload.prompt` và các nút `choice-option`. Khác `LessonRunner` ở 1b một điểm quan trọng: **không hiện đúng/sai sau mỗi câu** — đây là bài đánh giá, không phải bài luyện. Chọn xong thì gọi `answerAction` rồi sang câu kế.

Câu đã trả lời hiện dấu đã làm; người học quay lại được câu trước để đổi đáp án. Nút `submit-button` bật khi đã trả lời hết, hoặc luôn bật với ghi chú "câu chưa làm tính sai".

`AssessmentDone` hiện `assessment-score` (phần trăm) và `assessment-verdict` mang `data-passed`, kèm một dòng tiếng Việt: đạt thì "Đạt yêu cầu", trượt thì "Chưa đạt — bạn sẽ làm bài bổ túc phần sai".

- [ ] **Step 5: Kiểm chứng build và chạy thử**

Run: `npm run build`
Expected: build thành công, route `/assessment/[id]` có mặt.

Chạy `npm run dev`, tạo một tài khoản đã xác nhận bằng admin API, cho nó xong 2 buổi bằng cách ghi thẳng `user_lesson_progress`, rồi bắt đầu bài ôn tập từ dashboard. Xác nhận: thấy câu đầu, chọn được đáp án, sang câu kế, nộp được, thấy điểm. Xoá tài khoản sau khi xong và xác nhận đã xoá.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/assessment" src/components/assessment
git commit -m "feat(1c): giao dien lam bai danh gia + dong ho hien thi"
```

---

### Task 7: Dashboard 35 dòng

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `slotAt`, `TOTAL_SLOTS` từ `@/lib/assessment/slots`; `nextStep` từ `@/lib/assessment/next-step`
- Produces: giữ nguyên `data-testid="lesson-row"` và `data-status`, thêm `data-kind` mang `lesson` / `review` / `test`; thêm giá trị trạng thái `failed`

- [ ] **Step 1: Sửa trang**

Thay phần dựng danh sách: thay vì đọc 20 dòng `lessons`, duyệt 35 slot bằng `slotAt`, và với mỗi slot tính trạng thái từ `user_lesson_progress` (slot buổi học) hoặc từ `assessments` (slot đánh giá).

Nhãn tiếng Việt theo `kind`:

```
lesson  → `Buổi ${lessons[0]}`
review  → `Ôn tập buổi ${lessons[0]}–${lessons[1]}`
test    → `Kiểm tra buổi ${lessons[0]}–${lessons[3]}`
```

Trạng thái hiển thị thêm một giá trị:

```ts
const LABEL = {
  locked: "Chưa mở",
  available: "Sẵn sàng",
  in_progress: "Đang làm",
  completed: "Đã xong",
  failed: "Chưa đạt",
} as const;
```

`failed` **chỉ là nhãn hiển thị**, suy ra từ `assessments`. Enum `lesson_status` trong database không đổi — nó chỉ dùng cho `user_lesson_progress`, và không bài đánh giá nào ghi vào bảng đó.

Nút "Học tiếp" trỏ theo `nextStep`: slot buổi học thì `/learn/{lessonId}`, slot đánh giá thì tạo bài rồi tới `/assessment/{id}`. Việc tạo bài phải là Server Action, không phải một `<Link>` — vì nó ghi database.

- [ ] **Step 2: Bộ e2e cũ không được vỡ**

Run: `npm run test:e2e`
Expected: 10/10 xanh. Kịch bản 3 của lát 1a đếm `lesson-row` và mong đợi **20** — giờ có 35, nên **kịch bản đó sẽ đỏ**.

Đây là thay đổi hành vi có chủ ý, không phải hồi quy. Sửa kịch bản đó để đếm `[data-kind="lesson"]` thay vì đếm mọi `lesson-row`, và thêm một khẳng định mới rằng tổng số dòng là 35. **Không** nới lỏng thành "ít nhất 20".

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx" e2e/auth.spec.ts
git commit -m "feat(1c): dashboard 35 hoat dong thay vi 20 buoi"
```

---

### Task 8: Playwright — 3 kịch bản

**Files:**
- Create: `e2e/assessment.spec.ts`

**Interfaces:**
- Consumes: `TEST_EMAIL`, `TEST_PASSWORD` từ `./test-user`; `adminClient` từ `./admin`; các `data-testid` từ Task 6
- Produces: không có

- [ ] **Step 1: Viết bộ kịch bản**

Ba kịch bản. Dùng `adminClient` để đặt tiến độ trước — ghi `user_lesson_progress` cho buổi 1 và 2 là `completed` — thay vì bấm qua 270 item bằng UI. Đó là cùng cơ chế `afterEach` đang dùng, và nó cắt thời gian chạy từ hàng chục phút xuống vài giây.

1. **Bắt đầu bài ôn tập và thấy câu đầu tiên** — đặt xong buổi 1–2, vào dashboard, bấm "Học tiếp", xác nhận `assessment-prompt` hiện và `assessment-progress` là `1 / 25`.
2. **Đồng hồ bài kiểm tra còn đúng sau khi tải lại** — đặt xong buổi 1–4 và cả hai bài ôn tập đã đạt, bắt đầu bài kiểm tra, đọc `countdown`, tải lại trang, xác nhận giá trị mới **nhỏ hơn** giá trị cũ và vẫn dương. Đó là bằng chứng đồng hồ đọc từ `expires_at` chứ không đếm lại từ lúc mở trang.
3. **Nộp bài rồi thấy điểm và kết quả** — trả lời hết 25 câu của bài ôn tập, bấm `submit-button`, xác nhận `assessment-score` hiện và `assessment-verdict` mang `data-passed` là `"true"` hoặc `"false"`.

Mỗi kịch bản cần `test.setTimeout(90_000)` — 25 câu là 25 round-trip thật, và bộ này cũng chạy với `PLAYWRIGHT_BASE_URL` trỏ tới Vercel, nơi mỗi vòng chậm hơn.

`afterEach` dọn theo `user_id` của tài khoản dùng chung: `assessments` (cascade sẽ xoá `assessment_items`), `user_lesson_progress`, `word_mastery`, `grammar_mastery`. **Chỉ theo `user_id` đó**, không bao giờ rộng hơn.

- [ ] **Step 2: Chạy bộ E2E đầy đủ**

Run: `npm run test:e2e`
Expected: 13 xanh — 10 cũ cộng 3 mới.

- [ ] **Step 3: Chạy lên production**

```bash
PLAYWRIGHT_BASE_URL=https://richard-nina-learning.vercel.app npm run test:e2e
```

Chỉ chạy sau khi nhánh đã merge và Vercel deploy xong. Nếu chạy trước, các kịch bản 1c sẽ đỏ vì production chưa có mã — đó là tín hiệu đúng, không phải lỗi.

- [ ] **Step 4: Commit**

```bash
git add e2e/assessment.spec.ts
git commit -m "feat(1c): Playwright — 3 kich ban bai danh gia"
```

---

### Task 9: Ba việc treo từ 1a và 1b

**Files:**
- Modify: `src/app/(auth)/actions.ts`, `src/lib/lesson/build-item.ts`, `src/lib/lesson/session.ts`, `src/components/lesson/flashcard.tsx`, `supabase/migrations/0007_assessment_parent.sql`

**Interfaces:**
- Consumes: không có
- Produces: RPC `blank_answers_for_lesson(bigint) → jsonb`

- [ ] **Step 1: `signUp` xử lý cả `email_exists`**

`src/app/(auth)/actions.ts` hiện chỉ nhận riêng `error.code === "user_already_exists"`. Supabase còn trả `email_exists` ở một số cấu hình "Confirm email", và mã đó rơi xuống `GENERIC_SIGNUP_ERROR` — mở lại kênh dò email ở tầng nội dung trang.

Sửa điều kiện để nhận **cả hai** mã, cùng dẫn tới thông báo trung tính.

- [ ] **Step 2: Guard khi thiếu phương án nhiễu**

`pickDistractors` trả `.slice(0, count)`, nên khi kho ứng viên cạn nó trả về ít hơn `count` mà không báo gì. Kho 605 từ đã bị bỏ khỏi `loadContext` ở 1b nên không còn lưới đỡ.

Thêm ở cuối `pickDistractors`: nếu `out.length < count` thì ném lỗi nêu rõ từ đích, số ứng viên tìm được và số cần. Corpus test đã canh trường hợp này trong CI; guard runtime là lớp thứ hai cho dữ liệu chưa từng chạy qua corpus test.

- [ ] **Step 3: RPC trả `blank_answer` theo buổi**

Thêm vào cuối `supabase/migrations/0007_assessment_parent.sql`:

```sql
-- The gap tu hien lai cau vi du bang cach thay '___' bang chinh tu do. Nhung
-- blank_answer doi khi la dang bien cach cua word (168/600 tu trong chuong
-- trinh), nen ghep bang `word` cho ra cau sai ngu phap nhe.
--
-- Ham nay tra ve 30 blank_answer cua mot buoi trong MOT luot goi. Khong mo lai
-- ca cot: chi tra dung nhung tu thuoc buoi duoc hoi.

create or replace function public.blank_answers_for_lesson(p_lesson_id bigint)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(v.id::text, v.blank_answer), '{}'::jsonb)
  from lesson_words lw
  join vocab_words v on v.id = lw.word_id
  where lw.lesson_id = p_lesson_id
$$;

revoke all on function public.blank_answers_for_lesson(bigint) from public, anon;
grant execute on function public.blank_answers_for_lesson(bigint) to authenticated;
```

Áp lại nguyên cả tệp `0007` lên SQL Editor — tệp idempotent nên chạy lại an toàn.

- [ ] **Step 4: Dùng RPC đó cho thẻ gặp từ**

Trong `loadContext`, gọi `blank_answers_for_lesson` một lần và điền `blankAnswer` thật vào từng `VocabLite`. Nhánh `flashcard` của `buildItem` thay `___` bằng `blankAnswer` thay vì `word`.

**Cẩn thận:** `blankAnswer` bây giờ có giá trị thật ở phía server, nên bảo đảm kiểu `blankAnswer?: never` trên nhánh flashcard càng quan trọng — nó là thứ ngăn giá trị đó lọt xuống trình duyệt. Không được nới lỏng.

Cập nhật corpus test: khẳng định câu trên thẻ gặp từ **không còn `___`** và **khớp `example_en` với `blank_answer` đã thay vào**.

- [ ] **Step 5: Chạy toàn bộ**

Run: `npx tsc --noEmit` · `npm test` · `npm run test:e2e` · `npm run build`
Expected: tất cả xanh.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(auth\)/actions.ts src/lib/lesson/build-item.ts src/lib/lesson/session.ts src/components/lesson/flashcard.tsx supabase/migrations/0007_assessment_parent.sql tests/corpus.test.ts
git commit -m "fix(1c): ba viec treo tu 1a va 1b"
```

---

## Đối chiếu với spec

| Mục spec | Task |
|---|---|
| 4 ba loại bài, số câu, ngưỡng | Task 4 (`COUNTS`), Task 5 (`PASS_MARK`) |
| 5.1 chuỗi 35 hoạt động | Task 1 |
| 5.2 bảng trạng thái `nextStep` | Task 3 |
| 5.3 `parent_id` | Task 2 |
| 5.4 trượt chính bài bổ túc | Task 3 (nhánh `rem.passed === false`) |
| 5.5 dashboard 35 dòng, nhãn `failed` | Task 7 |
| 6.1 đề đóng băng, `payload` không chứa đáp án | Task 4, Task 5 |
| 6.2 đồng hồ ở server, tự đóng bài quá hạn | Task 5 (`closeExpired`), Task 3 (`close-expired`) |
| 6.3 lưu từng câu | Task 5 (`answerItem`) |
| 6.4 tái dùng `gradeItem`, `masteryDelta`, `pickDistractors` | Task 4, Task 5 |
| 6.5 route | Task 6 — **một** route thay vì ba, xem ghi chú ở Bản đồ tệp |
| 7 xử lý lỗi | Task 5 (nộp hai lần, một bài `in_progress`), Task 6 (mất mạng) |
| 8 kiểm thử | Task 1, 3, 4 (thuần), Task 5 (tích hợp), Task 4 (corpus), Task 8 (Playwright) |
| 9 ba việc treo | Task 9 |
| 3.2 ràng buộc xoá theo `user_id` | Task 2, 5, 8 |
