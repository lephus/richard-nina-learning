# Lát 1d — Trang thống kê `/stats`: kế hoạch triển khai

> **Cho người thực thi:** dùng skill `superpowers:subagent-driven-development`
> để chạy kế hoạch này theo từng task.

**Mục tiêu:** dựng `/stats` theo mục 6.6 spec tổng thể, từ dữ liệu đã có, không
thêm bảng và không thêm migration.

**Kiến trúc:** logic tính toán là hàm thuần ở `src/lib/stats/compute.ts`; trang
là Server Component đọc bốn bảng rồi gọi các hàm đó; component chỉ hiển thị.

**Spec:** `docs/superpowers/specs/2026-08-09-phase1d-stats-design.md`

## Ràng buộc toàn cục

- Không `Math.random()` ở bất cứ đâu dưới `src/`.
- `SUPABASE_SERVICE_ROLE_KEY` không được xuất hiện dưới `src/`; chỉ cho phép ở
  `tests/`, `e2e/`, `scripts/phase0/`.
- Xác thực phía server luôn dùng `supabase.auth.getUser()`, không dùng `getSession()`.
- Không nuốt lỗi Supabase — kiểm `error` và `throw`.
- Mọi truy vấn của người dùng lọc `.eq("user_id", user.id)` tường minh dù RLS đã chặn.
- **Không đọc bảng `assessment_items` ở lát này.** Cột `is_correct` đã bị thu
  hồi quyền đọc ở `0008`; không có nhu cầu nào ở đây cần tới nó.
- Không thêm dependency nào. Biểu đồ vẽ bằng `div` + Tailwind hoặc SVG nội tuyến.
- `now` là tham số của mọi hàm thuần, không đọc `Date.now()` bên trong.
- Chữ hiển thị bằng tiếng Việt; chú thích tiếng Việt giải thích **vì sao**.
- Mọi lệnh xoá trong test buộc theo `user_id` do chính test đó tạo ra — không
  bao giờ rộng hơn. Đây là database production của chủ dự án.
- **Không migration nào ở lát này.** Nếu thấy mình đang viết SQL DDL, dừng lại
  và báo — nghĩa là đã hiểu sai đề.

---

### Task 1: Hàm thuần `src/lib/stats/compute.ts`

**Files:**
- Create: `src/lib/stats/compute.ts`, `tests/stats-compute.test.ts`

**Interfaces — Produces:**

```ts
export const WEEKLY_TARGET = 2;
export const TOP_WRONG_LIMIT = 10;

export interface MasteryLite { wordId: number; correctCount: number; wrongCount: number; mastered: boolean }
export interface WordLite { id: number; word: string; meaningVi: string }
export interface AssessmentLite {
  id: number;
  type: "review" | "test" | "remedial";
  scope: number[];
  score: number;
  passed: boolean;
  submittedAt: string;   // ISO 8601
}

export interface VocabProgress { mastered: number; seen: number; total: number }
export function vocabProgress(rows: readonly MasteryLite[], total: number): VocabProgress;

export interface Rhythm { streakWeeks: number; thisWeekSessions: number; target: number }
export function rhythm(eventTimes: readonly string[], now: Date): Rhythm;

export interface ScorePoint { id: number; label: string; score: number; passed: boolean }
export function scoreSeries(rows: readonly AssessmentLite[]): ScorePoint[];

export interface WrongWord { wordId: number; word: string; meaningVi: string; wrongCount: number }
export function topWrongWords(
  mastery: readonly MasteryLite[],
  words: readonly WordLite[],
  limit?: number,
): WrongWord[];
```

- [ ] **Step 1: Múi giờ — một hàm, một chỗ**

Việt Nam ở `+07:00` cố định và **không có giờ mùa hè** kể từ 1975, nên không
cần `Intl` hay thư viện múi giờ: cộng thẳng 7 tiếng rồi tính theo UTC là đúng.
Ghi lý do đó vào chú thích, vì "cộng cứng 7 tiếng" trông như một chỗ cẩu thả
nếu không nói rõ.

```ts
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Khoá tuần theo giờ Việt Nam, tuần bắt đầu thứ Hai. Trả về mốc mili-giây của
 * 00:00 thứ Hai (đã dời sang hệ VN) để so sánh và trừ nhau được.
 */
function vnWeekStart(iso: string | Date): number {
  const t = (typeof iso === "string" ? new Date(iso) : iso).getTime() + VN_OFFSET_MS;
  const d = new Date(t);
  // getUTCDay(): 0 = Chủ nhật. Đưa về 0 = thứ Hai.
  const dayFromMonday = (d.getUTCDay() + 6) % 7;
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return midnight - dayFromMonday * 24 * 60 * 60 * 1000;
}
```

- [ ] **Step 2: Viết test TRƯỚC cho ranh giới tuần**

Hai test này là lý do cả module tồn tại — gộp theo UTC sẽ làm chúng đỏ:

```ts
it("23h Chủ nhật giờ VN và 00h30 thứ Hai giờ VN là HAI tuần khác nhau", () => {
  // 2026-08-09 là Chủ nhật. 23:00 VN = 16:00Z cùng ngày.
  // 2026-08-10 00:30 VN = 2026-08-09 17:30Z — vẫn Chủ nhật theo UTC.
  const now = new Date("2026-08-10T01:00:00Z");
  const r = rhythm(["2026-08-09T16:00:00Z", "2026-08-09T17:30:00Z"], now);
  expect(r.thisWeekSessions).toBe(1); // chỉ sự kiện 00h30 thứ Hai thuộc tuần này
});

it("hai buổi cùng một tuần VN đếm là hai", () => {
  const now = new Date("2026-08-12T03:00:00Z");
  const r = rhythm(["2026-08-10T01:00:00Z", "2026-08-12T02:00:00Z"], now);
  expect(r.thisWeekSessions).toBe(2);
});
```

Run: `npx vitest run tests/stats-compute.test.ts`
Expected: đỏ vì `compute.ts` chưa có hàm.

- [ ] **Step 3: `rhythm` — định nghĩa chuỗi phải nói rõ**

Chuỗi = số **tuần liên tiếp có ít nhất một sự kiện học**, đếm ngược từ tuần
hiện tại. Nếu tuần hiện tại **chưa** có sự kiện nào thì đếm ngược từ tuần
trước — nếu không, chuỗi của mọi người tụt về 0 vào sáng thứ Hai hàng tuần, một
hành vi vừa sai vừa làm nản. Cả tuần này lẫn tuần trước đều rỗng thì chuỗi là 0.

```ts
export function rhythm(eventTimes: readonly string[], now: Date): Rhythm {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const current = vnWeekStart(now);
  const weeks = new Set<number>();
  for (const t of eventTimes) weeks.add(vnWeekStart(t));

  const thisWeekSessions = eventTimes.filter((t) => vnWeekStart(t) === current).length;

  // Neo chuỗi ở tuần này nếu tuần này đã học, ngược lại ở tuần trước.
  let anchor = weeks.has(current) ? current : current - WEEK_MS;
  let streakWeeks = 0;
  while (weeks.has(anchor)) {
    streakWeeks++;
    anchor -= WEEK_MS;
  }

  return { streakWeeks, thisWeekSessions, target: WEEKLY_TARGET };
}
```

- [ ] **Step 4: Ba hàm còn lại**

```ts
export function vocabProgress(rows: readonly MasteryLite[], total: number): VocabProgress {
  return {
    mastered: rows.filter((r) => r.mastered).length,
    seen: rows.length,
    total,
  };
}

const TYPE_LABEL: Record<AssessmentLite["type"], string> = {
  review: "Ôn tập",
  test: "Kiểm tra",
  remedial: "Bổ túc",
};

export function scoreSeries(rows: readonly AssessmentLite[]): ScorePoint[] {
  return [...rows]
    .sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt) || a.id - b.id)
    .map((r) => ({
      id: r.id,
      label: `${TYPE_LABEL[r.type]} buổi ${r.scope[0]}${
        r.scope.length > 1 ? `–${r.scope[r.scope.length - 1]}` : ""
      }`,
      score: r.score,
      passed: r.passed,
    }));
}

export function topWrongWords(
  mastery: readonly MasteryLite[],
  words: readonly WordLite[],
  limit: number = TOP_WRONG_LIMIT,
): WrongWord[] {
  const byId = new Map(words.map((w) => [w.id, w]));
  return mastery
    .filter((m) => m.wrongCount > 0)
    // Sai nhiều trước; bằng nhau thì theo wordId để thứ tự TẤT ĐỊNH — không có
    // tie-break thì hai lần tải trang cho ra hai thứ tự khác nhau.
    .sort((a, b) => b.wrongCount - a.wrongCount || a.wordId - b.wordId)
    .slice(0, limit)
    .flatMap((m) => {
      const w = byId.get(m.wordId);
      return w ? [{ wordId: m.wordId, word: w.word, meaningVi: w.meaningVi, wrongCount: m.wrongCount }] : [];
    });
}
```

- [ ] **Step 5: Phủ nốt các nhánh còn lại bằng test**

Bắt buộc có: chuỗi bị đứt một tuần ở giữa (chỉ đếm đoạn liền kề gần nhất);
tuần này rỗng nhưng tuần trước có → chuỗi vẫn tính; cả hai rỗng → 0; danh sách
rỗng ở cả bốn hàm; `topWrongWords` bỏ qua từ không có trong `words`;
`scoreSeries` sắp đúng thứ tự thời gian kể cả khi mảng vào đảo lộn; hai từ bằng
`wrongCount` thì thứ tự tất định.

Run: `npx vitest run tests/stats-compute.test.ts`
Expected: tất cả xanh.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stats/compute.ts tests/stats-compute.test.ts
git commit -m "feat(1d): ham thuan tinh so lieu thong ke"
```

---

### Task 2: Trang `/stats` và các khối hiển thị

**Files:**
- Create: `src/app/(app)/stats/page.tsx`, `src/components/stats/vocab-progress.tsx`,
  `src/components/stats/rhythm-card.tsx`, `src/components/stats/score-chart.tsx`,
  `src/components/stats/wrong-words.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces — Consumes:** mọi thứ Task 1 xuất ra.

**Produces các `data-testid` mà Task 3 chọn theo:**
- `stats-mastered` — `N / 605`
- `stats-streak` — số tuần liên tiếp
- `stats-week-progress` — số buổi tuần này trên mục tiêu
- `score-bar` — mỗi bài một phần tử
- `wrong-word` — mỗi từ một phần tử
- `stats-link` — link ở header

- [ ] **Step 1: Trang đọc dữ liệu**

Server Component. Lấy `user` bằng `getUser()`, rồi đọc **song song** bằng
`Promise.all`:

1. `word_mastery` — `word_id, correct_count, wrong_count, mastered`, lọc `user_id`.
2. `assessments` — `id, type, scope, score, passed, submitted_at`, lọc `user_id`
   **và** `.eq("status", "submitted")`. Bài chưa nộp không có điểm để vẽ.
3. `user_lesson_progress` — `completed_at`, lọc `user_id` và `.eq("status", "completed")`.
4. `vocab_words` — `id, word, meaning_vi`. **Chỉ những từ cần tới**: dùng
   `.in("id", ids)` với `ids` là các `word_id` có `wrong_count > 0`, chứ không
   kéo cả 605 dòng về để hiển thị 10.
5. Tổng số từ: `.select("*", { count: "exact", head: true })` trên `vocab_words`
   — **không viết cứng 605**, để con số không trôi khi kho từ đổi.

Vướng thứ tự: (4) phụ thuộc (1). Nên chạy (1)(2)(3)(5) song song trước, rồi (4).

Kiểm `error` và `throw` ở **từng** truy vấn.

Sự kiện học đưa vào `rhythm` là hợp của `user_lesson_progress.completed_at` và
`assessments.submitted_at` — cả buổi học lẫn bài đánh giá đều là "một buổi học".
Bỏ giá trị `null`.

- [ ] **Step 2: Bốn component hiển thị**

Đều là component thường (không `"use client"` — không có tương tác nào).

`VocabProgress`: `N / TOTAL` với `data-testid="stats-mastered"`, thanh tiến độ
bằng một `div` nền xám và một `div` con rộng theo phần trăm. Phụ đề: `đã gặp M từ`.

`RhythmCard`: `data-testid="stats-streak"` mang số tuần; `data-testid="stats-week-progress"`
mang `X / 2`. Câu chữ khích lệ, không trách móc — đạt rồi thì "Đã đạt mục tiêu
tuần này", chưa đạt thì "Còn N buổi nữa là đạt mục tiêu tuần này", chuỗi bằng 0
thì "Bắt đầu chuỗi tuần học đều của bạn".

`ScoreChart`: mỗi điểm một cột, `data-testid="score-bar"`, `data-passed` mang
`"true"`/`"false"`, chiều cao theo `score`, nhãn dưới là `label`. Màu phân biệt
đạt/chưa đạt. Rỗng → một dòng mời làm bài ôn tập đầu tiên, kèm link `/dashboard`.

`WrongWords`: danh sách, mỗi dòng `data-testid="wrong-word"` với `word`,
`meaning_vi`, và `sai N lần`. Rỗng → "Chưa có từ nào bạn sai."

- [ ] **Step 3: Link vào header**

Thêm vào `src/app/(app)/layout.tsx` một `<Link href="/stats" data-testid="stats-link">Thống kê</Link>`
cạnh nút Đăng xuất. **Không có link thì trang không tồn tại với người học** —
đúng lỗi đã xảy ra ở lát 1b.

- [ ] **Step 4: Kiểm chứng**

Run: `npx tsc --noEmit` · `npm run build`
Expected: xanh, route `/stats` có mặt.

Rồi **thật sự mở trang bằng trình duyệt**: `npm run dev`, tạo một tài khoản
`@test.local` có timestamp, gieo sẵn vài dòng `word_mastery` và một `assessments`
đã nộp bằng admin client, xem `/stats` hiển thị đúng. Xoá sạch theo đúng
`user_id` đó rồi xác nhận đã xoá. Nếu không mở được trình duyệt thì nói thẳng
là chưa mở, đừng mô tả một lần bấm không có thật.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/stats" src/components/stats "src/app/(app)/layout.tsx"
git commit -m "feat(1d): trang thong ke va link o header"
```

---

### Task 3: Playwright

**Files:**
- Create: `e2e/stats.spec.ts`

- [ ] **Step 1: Ba kịch bản**

Dùng `adminClient()` gieo dữ liệu, đúng khuôn `e2e/assessment.spec.ts`.

1. **Tài khoản chưa học gì vào `/stats` không thấy trang vỡ** — vào được, thấy
   `stats-mastered` là `0 / 605`, thấy câu mời làm bài ôn tập, không có
   `score-bar` nào, không có `wrong-word` nào. Đây là kịch bản quan trọng nhất:
   trạng thái rỗng là thứ người dùng thật gặp đầu tiên và là chỗ dễ vỡ nhất.
2. **Có dữ liệu thì hiện đúng số** — gieo 3 dòng `word_mastery` (2 `mastered`,
   1 có `wrong_count = 4`) và 1 `assessments` đã nộp `score = 88, passed = true`;
   khẳng định `stats-mastered` là `2 / 605`, đúng 1 `score-bar` mang
   `data-passed="true"`, đúng 1 `wrong-word`.
3. **Link ở header tới được `/stats`** — từ `/dashboard` bấm `stats-link`, xác
   nhận URL đổi và trang hiện.

`afterEach` xoá theo `user_id` của tài khoản dùng chung: `assessments`,
`word_mastery`, `grammar_mastery`, `user_lesson_progress`. **Chỉ theo `user_id`
đó**, không bao giờ rộng hơn.

- [ ] **Step 2: Chạy toàn bộ**

Run: `npx tsc --noEmit` · `npm test` · `npm run test:e2e` · `npm run build`
Expected: **tất cả xanh**. Lát này không có migration nào, nên không có lý do
chính đáng nào để một test đỏ. Một test đỏ ở đây là một lỗi thật.

- [ ] **Step 3: Commit**

```bash
git add e2e/stats.spec.ts
git commit -m "feat(1d): Playwright — 3 kich ban trang thong ke"
```

---

## Đối chiếu với spec

| Mục spec 6.6 | Task |
|---|---|
| Số từ đã thuộc / 605 | Task 1 `vocabProgress`, Task 2 `VocabProgress` |
| Biểu đồ điểm qua các bài | Task 1 `scoreSeries`, Task 2 `ScoreChart` |
| Danh sách từ hay sai nhất | Task 1 `topWrongWords`, Task 2 `WrongWords` |
| Chuỗi tuần học đều | Task 1 `rhythm`, Task 2 `RhythmCard` |
| Tiến độ so với 2 buổi/tuần | Task 1 `rhythm`, Task 2 `RhythmCard` |
| Link luyện đề thật | Task 2 |
| Trang phải tới được | Task 2 Step 3, Task 3 kịch bản 3 |
