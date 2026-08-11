# Lát 2a — Nền mới + học từ vựng

> **Cho người thực thi:** dùng `superpowers:subagent-driven-development` (khuyến
> nghị) hoặc `superpowers:executing-plans`. Mỗi bước có ô đánh dấu `- [ ]`.

**Mục tiêu:** đổi khung chương trình từ 35 hoạt động khoá tuần tự sang 10 nhóm
học tự do, và thay luồng 135 item một chiều bằng 30 thẻ từ đi tới/lui được có
mục lục nhảy nhanh và ô ghi chú nhiều dòng.

**Kiến trúc:** nhóm suy ra bằng phép chia (nhóm `g` = buổi `2g−1`, `2g`), không
lưu bảng. Trạng thái mọi hoạt động suy từ `assessments`, không lưu song song.
Một buổi học tải **một lần** rồi chạy hoàn toàn ở trình duyệt; ghi chú và con
trỏ ghi ở nền.

**Thiết kế nguồn:** `docs/superpowers/specs/2026-08-11-phase2-vocab-first-restructure-design.md`

**Kết thúc lát này:** học được từ vựng theo cách mới. **Chưa thi được** — nút
"Làm bài" dẫn tới màn "sắp có", đó là lát 2b.

**Tech stack:** Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 ·
Supabase (Postgres + Auth + RLS) · Vitest · Playwright.

## Ràng buộc toàn cục

- **Không thêm thư viện nào.** `package.json` giữ nguyên Next / React / Supabase / Zod.
- Không `Math.random()` dưới `src/`.
- `SUPABASE_SERVICE_ROLE_KEY` không xuất hiện dưới `src/`.
- Luôn `getUser()`, không `getSession()`.
- Không nuốt lỗi Supabase — kiểm `error` và `throw`.
- Mọi truy vấn theo người dùng lọc `.eq("user_id", user.id)` tường minh, dù RLS đã lọc đúng.
- Đáp án (`vocab_words.blank_answer`, `grammar_questions.answer`) không bao giờ tới trình duyệt.
- Chữ hiển thị tiếng Việt; chú thích TypeScript tiếng Việt giải thích **vì sao**;
  chú thích SQL và thông điệp commit **không dấu**.
- Mọi lệnh xoá trong test buộc theo `user_id` do chính test đó tạo.
- **SQL phải được CHẠY THẬT trước khi giao** — PostgreSQL nội bộ (Postgres.app
  16.11 đã có sẵn tại `/Applications/Postgres.app/Contents/Versions/latest/bin/psql`),
  chạy `0001`→`0010` từ đầu, rồi chạy `0010` lần hai để kiểm idempotent.
- Ngân sách tốc độ: một thao tác trong buổi học **không được gọi mạng**.

---

## Cấu trúc tệp sau lát này

**Tạo mới**

| Tệp | Trách nhiệm |
|---|---|
| `supabase/migrations/0010_phase2_reset.sql` | Xoá tiến độ, dựng lại enum, `lesson_cursor`, `word_notes` |
| `src/lib/curriculum/groups.ts` | Số học nhóm ↔ buổi. Hàm thuần |
| `src/lib/curriculum/progress.ts` | `assessments[]` + `cursors[]` → trạng thái 3 hoạt động × 10 nhóm. Hàm thuần |
| `src/lib/vocab/word.ts` | `VocabLite`, `toVocabLite` (chuyển từ `lesson/build-item.ts`) |
| `src/lib/vocab/note.ts` | `NOTE_MAX` — hằng số, tách khỏi tệp `"use server"` |
| `src/lib/vocab/load-cards.ts` | `renderCard` (thuần) + `loadCards`: N từ + ghi chú + điền lại chỗ trống |
| `src/lib/exam/distractors.ts` | `pickDistractors` (chuyển từ `lesson/build-item.ts`), để dành lát 2b |
| `src/app/(app)/vocab/page.tsx` | 10 nhóm, danh sách dọc |
| `src/app/(app)/vocab/actions.ts` | Server Action: lưu ghi chú, lưu con trỏ |
| `src/app/(app)/vocab/learn/[lessonId]/page.tsx` | Pha học 30 thẻ |
| `src/app/(app)/vocab/browse/[groupId]/page.tsx` | Xem lại 60 từ |
| `src/components/vocab/deck.tsx` | Điều phối N thẻ: vị trí, phím ← →, tới/lui |
| `src/components/vocab/word-card.tsx` | Một thẻ từ |
| `src/components/vocab/word-index.tsx` | Cột phụ lục — cố định ≥1024px, trượt khi hẹp |
| `src/components/vocab/note-box.tsx` | Ô ghi chú tự lưu |

**Sửa:** `src/app/(app)/dashboard/page.tsx` · `src/app/(app)/layout.tsx` ·
`src/app/(app)/stats/page.tsx` · `src/lib/stats/compute.ts` · `e2e/auth.spec.ts`

**Xoá:** `src/lib/assessment/*` · `src/lib/lesson/*` · `src/lib/curriculum/lesson-status.ts` ·
`src/components/lesson/*` · `src/components/assessment/*` · `src/app/(app)/learn/` ·
`src/app/(app)/assessment/` · `src/app/api/assessment/` và các tệp test tương ứng.

**Viết lại:** `tests/corpus.test.ts` — xoá ở Task 3 (nó dựng 2700 item của luồng
đã chết), dựng lại ở Task 7 trên `renderCard`. Đây là lớp kiểm thử duy nhất chạy
trên **dữ liệu thật** trong `data/clean/` mà không cần database; lát 2a không
được coi là xong khi nó còn vắng.

---

### Task 1: Migration 0010 — xoá tiến độ, dựng lại schema

**Files:**
- Create: `supabase/migrations/0010_phase2_reset.sql`
- Create: `tests/phase2-schema.test.ts`
- Delete: `tests/lesson-position-schema.test.ts`

**Interfaces:**
- Produces: bảng `lesson_cursor(user_id, lesson_id, word_index, updated_at)`;
  bảng `word_notes(user_id, word_id, body, updated_at)`;
  enum `assessment_type = 'lesson'|'review'|'remedial'|'grammar'`;
  enum `assessment_status = 'in_progress'|'submitted'`;
  cột `assessments.grammar_lesson_id`. Bảng `user_lesson_progress` và enum
  `lesson_status` **không còn tồn tại**.

- [ ] **Bước 1: Viết test schema trước**

Tạo `tests/phase2-schema.test.ts`. Theo đúng khuôn `tests/lesson-position-schema.test.ts`
đang có: `describe.skipIf` khi thiếu biến môi trường, tạo một user riêng, dọn theo
đúng `user_id` đó.

```ts
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(URL && SERVICE);

describe.skipIf(!hasEnv)("schema lat 2a", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "noop", {
    auth: { persistSession: false },
  });
  const email = `phase2-schema-${Date.now()}@test.local`;
  let userId = "";
  let lessonId = 0;
  let wordId = 0;

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "schema-pass-1234",
      email_confirm: true,
      user_metadata: { display_name: "Người thử schema 2a" },
    });
    if (error) throw error;
    userId = data.user!.id;

    const { data: lesson } = await admin.from("lessons").select("id").eq("ordinal", 1).single();
    lessonId = lesson!.id as number;
    const { data: word } = await admin.from("vocab_words").select("id").eq("ordinal", 1).single();
    wordId = word!.id as number;
  });

  afterAll(async () => {
    // Chỉ xoá theo user_id của chính tài khoản này. Không bao giờ rộng hơn.
    if (userId) {
      await admin.from("word_notes").delete().eq("user_id", userId);
      await admin.from("lesson_cursor").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("bảng user_lesson_progress không còn tồn tại", async () => {
    const { error } = await admin.from("user_lesson_progress").select("user_id").limit(1);
    expect(error).not.toBeNull();
  });

  it("lesson_cursor ghi được và mặc định word_index = 0", async () => {
    const { error } = await admin.from("lesson_cursor").insert({ user_id: userId, lesson_id: lessonId });
    expect(error).toBeNull();

    const { data } = await admin
      .from("lesson_cursor").select("word_index")
      .eq("user_id", userId).eq("lesson_id", lessonId).single();
    expect(data).toEqual({ word_index: 0 });
  });

  it("lesson_cursor chặn word_index ngoài biên 0..29", async () => {
    const { error } = await admin
      .from("lesson_cursor").update({ word_index: 30 })
      .eq("user_id", userId).eq("lesson_id", lessonId);
    expect(error).not.toBeNull();
  });

  it("word_notes giữ được nhiều dòng", async () => {
    const body = "dòng một\ndòng hai\ndòng ba";
    const { error } = await admin.from("word_notes").insert({ user_id: userId, word_id: wordId, body });
    expect(error).toBeNull();

    const { data } = await admin
      .from("word_notes").select("body").eq("user_id", userId).eq("word_id", wordId).single();
    expect(data!.body).toBe(body);
  });

  it("word_notes chặn ghi chú dài quá 2000 ký tự", async () => {
    const { error } = await admin
      .from("word_notes").update({ body: "x".repeat(2001) })
      .eq("user_id", userId).eq("word_id", wordId);
    expect(error).not.toBeNull();
  });

  it("assessment_type nhận 'lesson' và 'grammar', từ chối 'test'", async () => {
    const mk = async (type: string, extra: Record<string, unknown>) =>
      admin.from("assessments").insert({ user_id: userId, type, scope: [1], ...extra }).select("id").single();

    const ok = await mk("lesson", {});
    expect(ok.error).toBeNull();
    if (ok.data) await admin.from("assessments").delete().eq("id", ok.data.id);

    const bad = await mk("test", {});
    expect(bad.error).not.toBeNull();
  });

  it("bài grammar buộc có grammar_lesson_id, bài từ vựng buộc không có", async () => {
    const { data: gl } = await admin.from("grammar_lessons").select("id").limit(1).single();

    const thieu = await admin
      .from("assessments").insert({ user_id: userId, type: "grammar", scope: [] });
    expect(thieu.error).not.toBeNull();

    const thua = await admin
      .from("assessments").insert({ user_id: userId, type: "lesson", scope: [1], grammar_lesson_id: gl!.id });
    expect(thua.error).not.toBeNull();

    const dung = await admin
      .from("assessments")
      .insert({ user_id: userId, type: "grammar", scope: [], grammar_lesson_id: gl!.id })
      .select("id").single();
    expect(dung.error).toBeNull();
    if (dung.data) await admin.from("assessments").delete().eq("id", dung.data.id);
  });

  it("cột expires_at không còn tồn tại", async () => {
    const { error } = await admin.from("assessments").select("expires_at").limit(1);
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Bước 2: Chạy test để xác nhận nó ĐỎ**

Run: `npx vitest run tests/phase2-schema.test.ts`
Expected: FAIL — `lesson_cursor` chưa tồn tại, `expires_at` vẫn còn.

- [ ] **Bước 3: Viết migration**

Tạo `supabase/migrations/0010_phase2_reset.sql`:

```sql
-- Lat 2a: doi khung chuong trinh tu 35 slot khoa tuan tu sang 10 nhom hoc tu do.
-- Xem docs/superpowers/specs/2026-08-11-phase2-vocab-first-restructure-design.md
--
-- THU TU BAT BUOC: xoa het du lieu nguoi hoc TRUOC, roi moi dung lai enum.
-- PostgreSQL khong xoa duoc mot gia tri enum, nen phai tao type moi va chuyen
-- cot bang `using ...::text::...` — phep chuyen do NO ngay khi con mot dong
-- mang gia tri 'test' hay 'expired'. Chi an toan khi bang da rong.

-- 1. Xoa sach tien do nguoi hoc. Giu auth.users va profiles.
delete from assessment_items;
delete from assessments;
delete from word_mastery;
delete from grammar_mastery;

-- 2. Bo dong ho khoa cung. Khong con bai thi nao bi gioi han thoi gian, nen
--    cot nay khong con nghia gi — de lai thi lan sau ai do se tin no.
alter table assessments drop column if exists expires_at;

-- 3. Hai chi so dung toi cot `status` phai bien mat TRUOC khi doi kieu cot,
--    roi dung lai y nguyen o buoc 5. Doi kieu mot cot dang co chi so phu
--    thuoc se bi tu choi.
drop index if exists assessments_user_id_status_idx;
drop index if exists assessments_one_in_progress;

-- 4. Dung lai hai enum.
--    assessment_type: bo 'test' (bai 60 phut da bo), them 'lesson' (bai cuoi
--    buoi hoc, truoc day khong phai mot assessment) va 'grammar'.
create type assessment_type_v2 as enum ('lesson','review','remedial','grammar');
alter table assessments
  alter column type type assessment_type_v2 using type::text::assessment_type_v2;
drop type assessment_type;
alter type assessment_type_v2 rename to assessment_type;

--    assessment_status: bo 'expired'. Phai go default truoc roi dat lai sau —
--    default la mot bieu thuc mang KIEU CU, no chan phep doi kieu.
create type assessment_status_v2 as enum ('in_progress','submitted');
alter table assessments alter column status drop default;
alter table assessments
  alter column status type assessment_status_v2 using status::text::assessment_status_v2;
alter table assessments alter column status set default 'in_progress';
drop type assessment_status;
alter type assessment_status_v2 rename to assessment_status;

-- 5. Dung lai hai chi so da xoa o buoc 3, y nguyen dinh nghia cu.
--    Chi so duy nhat MOT PHAN giu bat bien "mot nguoi chi co MOT bai dang lam"
--    o tang database — xem giai thich day du tai 0007_assessment_parent.sql.
create index if not exists assessments_user_id_status_idx on assessments (user_id, status);
create unique index if not exists assessments_one_in_progress
  on assessments (user_id) where status = 'in_progress';

-- 6. Cot rieng cho bai ngu phap. KHONG nhet id bai ngu phap vao `scope int[]`:
--    scope dang mang ordinal buoi tu vung (1..20), con id bai ngu phap la mot
--    he so hoan toan khac. Tron hai he vao mot cot la loi khong bao, khong vo,
--    chi sai — va sai vao dung luc thong ke doc nham.
alter table assessments
  add column if not exists grammar_lesson_id bigint references grammar_lessons(id);
alter table assessments drop constraint if exists assessments_grammar_scope;
alter table assessments add constraint assessments_grammar_scope
  check ((type = 'grammar') = (grammar_lesson_id is not null));

-- 7. user_lesson_progress -> lesson_cursor.
--    Moi cot cu tru khoa chinh deu bi bo (status, score, completed_at,
--    position, final_correct): trang thai buoi nay SUY TU `assessments` chu
--    khong luu song song. Drop roi create, khong alter dan tung cot — va viec
--    do cung xoa luon cai bay da ghi chu ky trong lesson-status.ts: cot
--    `status` mac dinh 'locked' khien mot INSERT khong set tuong minh khoa
--    nham mot buoi dang mo.
drop table if exists user_lesson_progress;
drop type if exists lesson_status;

create table if not exists lesson_cursor (
  user_id    uuid   not null references auth.users(id) on delete cascade,
  lesson_id  bigint not null references lessons(id),
  word_index int    not null default 0 check (word_index between 0 and 29),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- 8. Ghi chu nhieu dong cua nguoi hoc cho tung tu.
--    Tran 2000 ky tu dat o tang database chu khong chi o form: form la lop
--    chan de di vong nhat (Server Action goi duoc thang bang fetch).
create table if not exists word_notes (
  user_id    uuid   not null references auth.users(id) on delete cascade,
  word_id    bigint not null references vocab_words(id),
  body       text   not null default '' check (char_length(body) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (user_id, word_id)
);

-- 9. RLS cho hai bang moi — cung khuon voi 0004_rls.sql muc 1.
alter table lesson_cursor enable row level security;
alter table word_notes    enable row level security;

drop policy if exists own_cursor on lesson_cursor;
create policy own_cursor on lesson_cursor
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists own_notes on word_notes;
create policy own_notes on word_notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 10. `anon` khong co viec gi voi hai bang nay. RLS da chan (khong policy nao
--     cho anon thay dong nao), nhung quyen bang va RLS la HAI co che doc lap —
--     0004_rls.sql muc 4 da ghi chu dung cai bay nay. Thu hoi trang de sau nay
--     ai them mot policy cho `anon` cung khong mo duoc du lieu rieng tu.
revoke all on lesson_cursor from anon;
revoke all on word_notes    from anon;
```

- [ ] **Bước 4: Chạy thật trên PostgreSQL nội bộ**

Không dán lên Supabase trước khi bước này xanh.

```bash
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"
createdb phase2_probe
psql -d phase2_probe -c "create role anon; create role authenticated;"
for f in supabase/migrations/00*.sql; do
  echo "== $f"
  psql -v ON_ERROR_STOP=1 -d phase2_probe -f "$f" || break
done
```

Expected: `0001`→`0010` chạy sạch, không lỗi.

Rồi kiểm idempotent — dán lại **riêng** `0010` lần hai:

```bash
psql -v ON_ERROR_STOP=1 -d phase2_probe -f supabase/migrations/0010_phase2_reset.sql
```

Expected: lần hai cũng chạy sạch. Bước 2 (`drop column if exists`), bước 4 (dựng
enum) và bước 7 (drop/create bảng) đều đã có `if exists`/`if not exists`, **trừ**
`create type assessment_type_v2` — lần hai nó sẽ báo `type ... already exists`
nếu lần một dừng giữa chừng. Nếu gặp: `drop database phase2_probe`, tạo lại, chạy
lại từ `0001`. Đây là migration chạy **một lần** trên production nên tính idempotent
chỉ cần đúng ở mức "chạy lại toàn bộ chuỗi từ database sạch", không cần chạy lại
đè lên chính nó.

Dọn:
```bash
dropdb phase2_probe
```

- [ ] **Bước 5: Áp migration lên Supabase**

Supabase CLI trên máy đang đăng nhập tài khoản khác nên `supabase link` không
dùng được (xem `docs/superpowers/PHASE0-HOAN-TAT.md`). Đi đường dashboard:

```bash
pbcopy < supabase/migrations/0010_phase2_reset.sql
```

Mở https://supabase.com/dashboard/project/efouimcmdufsaywudcgx/sql/new → dán → **Run**.
Expected: *Success. No rows returned*.

- [ ] **Bước 6: Xoá test schema đã lỗi thời và chạy lại**

`tests/lesson-position-schema.test.ts` khẳng định các cột `position`/`final_correct`
của `user_lesson_progress` — bảng đó không còn. Xoá tệp.

```bash
rm tests/lesson-position-schema.test.ts
npx vitest run tests/phase2-schema.test.ts
```
Expected: PASS — 8 test.

- [ ] **Bước 7: Commit**

```bash
git add supabase/migrations/0010_phase2_reset.sql tests/phase2-schema.test.ts
git rm tests/lesson-position-schema.test.ts
git commit -m "feat(2a): migration xoa tien do va dung lai schema cho 10 nhom tu do"
```

---

### Task 2: Tách `VocabLite` và `pickDistractors` ra khỏi luồng cũ

**Files:**
- Create: `src/lib/vocab/word.ts`, `src/lib/exam/distractors.ts`
- Create: `tests/distractors.test.ts`
- Delete: `tests/build-item.test.ts`
- **Không** sửa `src/lib/lesson/build-item.ts` — chỉ SAO CHÉP ra. Cả thư mục
  `src/lib/lesson/` biến mất ở Task 3, nên hai bản tồn tại song song đúng một
  task; gỡ dần từng hàm ra khỏi tệp cũ chỉ tạo thêm một trạng thái trung gian
  có thể vỡ mà không đổi kết quả.

**Vì sao làm trước khi xoá:** Task 3 xoá cả `src/lib/lesson/`. Trong đó có hai
thứ vẫn còn giá trị: kiểu `VocabLite`/`toVocabLite` (lát này cần ngay để đọc từ)
và `pickDistractors` (~60 dòng có test đầy đủ, kèm guard "nổ khi thiếu ứng viên"
— lát 2b cần). Xoá rồi viết lại là phí và mất luôn phần đã kiểm chứng.

**Interfaces:**
- Produces: `VocabLite`, `toVocabLite(row: unknown): VocabLite` từ `@/lib/vocab/word`;
  `pickDistractors(target, pool, seed, opts): VocabLite[]` và `DistractorOptions`
  từ `@/lib/exam/distractors`.

- [ ] **Bước 1: Tạo `src/lib/vocab/word.ts`**

Chuyển nguyên văn khối `VocabLite` + `toVocabLite` từ
`src/lib/lesson/build-item.ts` (dòng 1–60), **giữ nguyên mọi chú thích**. Bỏ
`import type { ItemSpec }` — tệp mới không cần.

Sửa chú thích đầu tệp thành:

```ts
/**
 * Hình dạng chuẩn của một từ vựng đọc lên từ `vocab_words`, đúng những cột
 * `authenticated` được phép đọc (0004_rls.sql:41-44).
 *
 * Ở một tệp riêng chứ không nằm trong module đọc dữ liệu nào, vì cả pha học
 * (lib/vocab/load-cards.ts) lẫn việc dựng đề (lib/exam/) đều đọc chính bảng đó
 * và phải quy về cùng một hình dạng.
 */
```

- [ ] **Bước 2: Tạo `src/lib/exam/distractors.ts`**

Chuyển nguyên văn `DistractorOptions` + `pickDistractors` (và mọi chú thích của
chúng) từ `build-item.ts`. Import `VocabLite` từ `@/lib/vocab/word`, giữ import
`seededShuffle` từ `@content/shuffle-options`.

- [ ] **Bước 3: Tạo `tests/distractors.test.ts`**

Copy `tests/build-item.test.ts`, **giữ lại chỉ những `describe`/`it` gọi
`pickDistractors`**, đổi import sang `@/lib/exam/distractors`. Xoá mọi test của
`buildItem` (hàm đó bị xoá ở Task 3).

- [ ] **Bước 4: Chạy test**

Run: `npx vitest run tests/distractors.test.ts`
Expected: PASS. Ghi lại số test giữ được so với `build-item.test.ts` cũ, và nói
rõ trong báo cáo đã bỏ những khẳng định nào — không im lặng bỏ.

- [ ] **Bước 5: Commit**

```bash
git add src/lib/vocab/word.ts src/lib/exam/distractors.ts tests/distractors.test.ts
git commit -m "refactor(2a): tach VocabLite va pickDistractors khoi luong 135 item"
```

---

### Task 3: Gỡ luồng cũ, giữ build xanh

**Files:**
- Delete: `src/lib/assessment/` (cả thư mục), `src/lib/lesson/` (cả thư mục),
  `src/lib/curriculum/lesson-status.ts`, `src/components/lesson/`,
  `src/components/assessment/`, `src/app/(app)/learn/`,
  `src/app/(app)/assessment/`, `src/app/api/assessment/`
- Delete: `tests/slots.test.ts`, `tests/next-step.test.ts`, `tests/item-plan.test.ts`,
  `tests/lesson-session.test.ts`, `tests/lesson-status.test.ts`,
  `tests/lesson-completion.test.ts`, `tests/grade.test.ts`,
  `tests/build-assessment.test.ts`, `tests/assessment-run.test.ts`,
  `tests/assessment-items-grants.test.ts`, `tests/assessment-parent-schema.test.ts`
- Delete: `e2e/lesson.spec.ts`, `e2e/assessment.spec.ts`
- Modify: `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/layout.tsx`,
  `src/app/(app)/stats/page.tsx`, `src/lib/stats/compute.ts`,
  `tests/stats-compute.test.ts`, `e2e/auth.spec.ts`, `e2e/stats.spec.ts`

**Interfaces:**
- Produces: `/dashboard` render được với hai thẻ chọn lộ trình (cả hai tạm thời
  chưa dẫn đi đâu); `npm run build` và `npm test` xanh.

- [ ] **Bước 1: Xoá code luồng cũ**

```bash
git rm -r "src/app/(app)/learn" "src/app/(app)/assessment" "src/app/api/assessment"
git rm -r src/components/lesson src/components/assessment
git rm -r src/lib/assessment src/lib/lesson
git rm src/lib/curriculum/lesson-status.ts
```

- [ ] **Bước 2: Xoá test và e2e của luồng cũ**

```bash
git rm tests/slots.test.ts tests/next-step.test.ts tests/item-plan.test.ts \
       tests/lesson-session.test.ts tests/lesson-status.test.ts \
       tests/lesson-completion.test.ts tests/grade.test.ts \
       tests/build-assessment.test.ts tests/assessment-run.test.ts \
       tests/assessment-items-grants.test.ts tests/assessment-parent-schema.test.ts \
       tests/corpus.test.ts
git rm e2e/lesson.spec.ts e2e/assessment.spec.ts
```

Trong báo cáo, liệt kê từng tệp và một dòng nói nó khẳng định điều gì, để lát 2b
biết khẳng định nào cần dựng lại (đặc biệt `assessment-items-grants.test.ts` —
nó canh việc `is_correct` không rò ra client).

> **`tests/corpus.test.ts` là tệp đắt nhất trong danh sách này.** Nó dựng toàn
> bộ 2700 item từ `data/clean/*.json` — kho nội dung THẬT — và tồn tại vì lát 1b
> từng có một lỗi khiến **mọi** câu điền từ hiển thị vỡ vụn
> (`"___I___t___ ___i___s___…"`) mà không lớp kiểm thử nào bắt được: fixture của
> test đơn vị mô phỏng một kho dữ liệu không tồn tại, còn test tích hợp không
> chạm tới nội dung hiển thị. Nó import `itemAt`/`buildItem`/`slotAt` nên không
> biên dịch được sau lát này.
>
> **Task 7 dựng lại đúng lớp bảo vệ đó** cho đường hiển thị mới (`renderCard`
> trên cả 605 từ thật, không cần database). Không được coi lát 2a là xong khi
> `tests/corpus.test.ts` vẫn vắng mặt.

- [ ] **Bước 3: Dashboard tạm — hai thẻ chọn lộ trình**

Thay toàn bộ `src/app/(app)/dashboard/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Bản tạm của lát 2a. Hai thẻ đúng hình dạng cuối cùng, nhưng chưa có số liệu
 * và chưa có dòng "Tiếp tục" — cả hai cần `progress.ts` (Task 5) và trang
 * `/vocab` (Task 6) có thật trước đã. Task 14 thay tệp này.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // AppLayout đã chặn ở tầng trên, nhưng vẫn tường minh ở đây — cùng cách các
  // trang khác trong nhóm (app) đang làm.
  if (!user) redirect("/login");

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Hôm nay học gì?</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <TrackCard
          testId="track-vocab"
          icon="📘"
          title="TỪ VỰNG"
          subtitle="605 từ · 10 nhóm"
          href={null}
        />
        <TrackCard
          testId="track-grammar"
          icon="📗"
          title="NGỮ PHÁP"
          subtitle="20 bài"
          href={null}
        />
      </div>
    </main>
  );
}

function TrackCard({
  testId, icon, title, subtitle, href,
}: {
  testId: string;
  icon: string;
  title: string;
  subtitle: string;
  href: string | null;
}) {
  const shell = "flex flex-col items-center gap-1 rounded border border-slate-200 p-8 text-center";
  const inner = (
    <>
      <span className="text-3xl" aria-hidden>{icon}</span>
      <span className="font-semibold tracking-wide">{title}</span>
      <span className="text-sm text-slate-600">{subtitle}</span>
      {href === null && <span className="mt-2 text-xs text-slate-400">Sắp có</span>}
    </>
  );
  return href ? (
    <Link href={href} data-testid={testId} className={`${shell} bg-white hover:border-slate-400`}>
      {inner}
    </Link>
  ) : (
    <div data-testid={testId} className={`${shell} bg-slate-100 text-slate-400`}>{inner}</div>
  );
}
```

- [ ] **Bước 4: Sửa `stats` để không đọc bảng đã xoá**

`src/lib/stats/compute.ts` dòng 11 import `assessmentLabel` từ
`@/lib/assessment/slots` (đã xoá). Thay bằng một hàm cục bộ trong chính
`compute.ts` — trước lát này nó ở `slots.ts` vì ba nơi cùng dùng; nay chỉ còn
một nơi:

```ts
const KIND_LABEL: Record<AssessmentLite["type"], string> = {
  lesson: "Buổi",
  review: "Ôn tập buổi",
  remedial: "Bổ túc buổi",
  grammar: "Ngữ pháp",
};

/**
 * Nhãn một bài đã nộp, ví dụ "Ôn tập buổi 1–2".
 *
 * Dấu gạch giữa hai số là EN DASH — U+2013 (–), KHÔNG phải dấu gạch nối
 * thường (-, U+002D). Playwright so khớp nguyên văn chuỗi này.
 *
 * `lessons[0]` và `lessons[length-1]` chứ không phải chỉ số cố định: bài bổ
 * túc thường chỉ có một phần tử trong `scope`, còn bài ngữ pháp có mảng rỗng.
 */
function label(type: AssessmentLite["type"], scope: readonly number[]): string {
  if (type === "grammar" || scope.length === 0) return KIND_LABEL[type];
  const range = scope.length > 1 ? `${scope[0]}–${scope[scope.length - 1]}` : `${scope[0]}`;
  return `${KIND_LABEL[type]} ${range}`;
}
```

Đổi kiểu `AssessmentLite["type"]` sang `"lesson" | "review" | "remedial" | "grammar"`,
và trong `scoreSeries` gọi `label(r.type, r.scope)` thay cho `assessmentLabel`.

`src/app/(app)/stats/page.tsx` dòng ~70 đọc `user_lesson_progress` (đã xoá) để
lấy mốc thời gian cho `rhythm`. Thay bằng `assessments` đã nộp — mốc học đều nay
đo bằng bài đã làm, không phải buổi đã đánh dấu xong:

```ts
supabase
  .from("assessments")
  .select("submitted_at")
  .eq("user_id", user.id)
  .eq("status", "submitted"),
```

và chỗ dùng kết quả đó đổi từ `.completed_at` sang `.submitted_at`. Cập nhật
chú thích ngay trên truy vấn để nói rõ nguồn mốc thời gian đã đổi và vì sao.

Cập nhật `tests/stats-compute.test.ts`: mọi chỗ dùng `type: "test"` đổi sang
`type: "lesson"` hoặc `"review"`, và thêm một test cho `scoreSeries` với bài
`grammar` (`scope: []`) để nhãn không ra `"Ngữ pháp undefined"`.

- [ ] **Bước 5: Sửa e2e còn tham chiếu luồng cũ**

`e2e/auth.spec.ts` đang khẳng định `toHaveCount(35)` (35 dòng lộ trình) và
`toHaveCount(20)`. Dashboard mới không còn danh sách đó. Thay bằng:

```ts
await expect(page.getByTestId("track-vocab")).toBeVisible();
await expect(page.getByTestId("track-grammar")).toBeVisible();
```

`e2e/stats.spec.ts`: mọi bước dựng dữ liệu qua `user_lesson_progress` phải đổi
sang `assessments`. Nếu một kịch bản không còn dựng được dữ liệu vì lát 2a chưa
có bài thi nào, **đánh dấu `test.skip` kèm chú thích trỏ tới lát 2b** — không xoá
âm thầm.

- [ ] **Bước 6: Xác nhận build và test xanh**

```bash
npx tsc --noEmit
npm run build
npm test
```
Expected: cả ba xanh. Nếu `tsc` còn báo import từ module đã xoá, đó là chỗ bỏ
sót — sửa, đừng thêm `any`.

- [ ] **Bước 7: Commit**

```bash
git add -A
git commit -m "refactor(2a): go luong 135 item va chuoi 35 slot, dashboard tam hai the"
```

---

### Task 4: `groups.ts` — nhóm là phép chia

**Files:**
- Create: `src/lib/curriculum/groups.ts`
- Test: `tests/groups.test.ts`

**Interfaces:**
- Produces: `TOTAL_LESSONS = 20`, `TOTAL_GROUPS = 10`, `WORDS_PER_LESSON = 30`,
  `groupOf(lessonOrdinal: number): number`,
  `lessonsOf(group: number): [number, number]`,
  `wordRangeLabel(group: number): string`.

- [ ] **Bước 1: Viết test trước**

Tạo `tests/groups.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  groupOf, lessonsOf, wordRangeLabel, TOTAL_GROUPS, TOTAL_LESSONS,
} from "@/lib/curriculum/groups";

describe("groupOf", () => {
  it("buổi 1 và 2 cùng thuộc nhóm 1", () => {
    expect(groupOf(1)).toBe(1);
    expect(groupOf(2)).toBe(1);
  });

  it("buổi 3 sang nhóm 2 — đúng chỗ chuyển nhóm", () => {
    expect(groupOf(3)).toBe(2);
  });

  it("buổi 19 và 20 thuộc nhóm cuối", () => {
    expect(groupOf(19)).toBe(TOTAL_GROUPS);
    expect(groupOf(20)).toBe(TOTAL_GROUPS);
  });

  it("ném khi buổi ngoài biên 1..20", () => {
    expect(() => groupOf(0)).toThrow(RangeError);
    expect(() => groupOf(21)).toThrow(RangeError);
    expect(() => groupOf(1.5)).toThrow(RangeError);
  });
});

describe("lessonsOf", () => {
  it("nhóm 1 gồm buổi 1 và 2", () => {
    expect(lessonsOf(1)).toEqual([1, 2]);
  });

  it("nhóm 10 gồm buổi 19 và 20", () => {
    expect(lessonsOf(10)).toEqual([19, 20]);
  });

  it("ném khi nhóm ngoài biên 1..10", () => {
    expect(() => lessonsOf(0)).toThrow(RangeError);
    expect(() => lessonsOf(11)).toThrow(RangeError);
  });

  it("phủ đúng 20 buổi, không lặp không sót", () => {
    const all: number[] = [];
    for (let g = 1; g <= TOTAL_GROUPS; g++) all.push(...lessonsOf(g));
    expect(all).toEqual(Array.from({ length: TOTAL_LESSONS }, (_, i) => i + 1));
  });

  it("groupOf là nghịch đảo của lessonsOf", () => {
    for (let g = 1; g <= TOTAL_GROUPS; g++) {
      for (const ordinal of lessonsOf(g)) expect(groupOf(ordinal)).toBe(g);
    }
  });
});

describe("wordRangeLabel", () => {
  it("nhóm 1 phủ từ 1 tới 60", () => {
    expect(wordRangeLabel(1)).toBe("từ 1–60");
  });

  it("nhóm 10 phủ từ 541 tới 600", () => {
    expect(wordRangeLabel(10)).toBe("từ 541–600");
  });

  it("dùng EN DASH chứ không phải dấu gạch nối", () => {
    // Playwright so khớp nguyên văn chuỗi này; đổi ký tự sẽ làm e2e trượt âm thầm.
    expect(wordRangeLabel(1)).toContain("–");
    expect(wordRangeLabel(1)).not.toContain("-");
  });
});
```

- [ ] **Bước 2: Chạy test để xác nhận nó ĐỎ**

Run: `npx vitest run tests/groups.test.ts`
Expected: FAIL — không tìm thấy module `@/lib/curriculum/groups`.

- [ ] **Bước 3: Viết `src/lib/curriculum/groups.ts`**

```ts
/**
 * Nhóm học là PHÉP CHIA, không phải một bảng: nhóm `g` gồm buổi `2g−1` và `2g`.
 *
 * Cùng khuôn tất định với `itemAt`/`slotAt` của lát 1 — không lưu xuống
 * database nên không có gì để lệch pha với nội dung đã seed, và không có
 * migration nào phải chạy khi cách chia nhóm đổi.
 *
 * Thay cho `lib/assessment/slots.ts` (chuỗi 35 hoạt động khoá tuần tự) đã xoá
 * ở lát này: 10 nhóm đều mở, thứ tự chỉ còn là cách sắp xếp trên màn hình.
 */

export const TOTAL_LESSONS = 20;
export const LESSONS_PER_GROUP = 2;
export const WORDS_PER_LESSON = 30;
export const TOTAL_GROUPS = TOTAL_LESSONS / LESSONS_PER_GROUP; // 10

export function groupOf(lessonOrdinal: number): number {
  if (
    !Number.isInteger(lessonOrdinal) ||
    lessonOrdinal < 1 ||
    lessonOrdinal > TOTAL_LESSONS
  ) {
    throw new RangeError(`buổi ${lessonOrdinal} ngoài biên 1..${TOTAL_LESSONS}`);
  }
  return Math.ceil(lessonOrdinal / LESSONS_PER_GROUP);
}

export function lessonsOf(group: number): [number, number] {
  if (!Number.isInteger(group) || group < 1 || group > TOTAL_GROUPS) {
    throw new RangeError(`nhóm ${group} ngoài biên 1..${TOTAL_GROUPS}`);
  }
  const first = (group - 1) * LESSONS_PER_GROUP + 1;
  return [first, first + 1];
}

/**
 * Nhãn phạm vi từ của một nhóm, ví dụ "từ 1–60".
 *
 * Dấu giữa hai số là EN DASH — U+2013 (–), KHÔNG phải dấu gạch nối thường
 * (-, U+002D). Playwright so khớp nguyên văn chuỗi này; đổi sang gạch nối làm
 * kịch bản e2e trượt một cách âm thầm — không lỗi biên dịch, không lỗi kiểu,
 * chỉ so chuỗi sai. Cùng lý do đã ghi ở `assessmentLabel` của lát 1.
 */
export function wordRangeLabel(group: number): string {
  const [first, last] = lessonsOf(group);
  return `từ ${(first - 1) * WORDS_PER_LESSON + 1}–${last * WORDS_PER_LESSON}`;
}
```

- [ ] **Bước 4: Chạy test để xác nhận nó XANH**

Run: `npx vitest run tests/groups.test.ts`
Expected: PASS — 12 test.

- [ ] **Bước 5: Commit**

```bash
git add src/lib/curriculum/groups.ts tests/groups.test.ts
git commit -m "feat(2a): nhom hoc suy bang phep chia, 20 buoi thanh 10 nhom"
```

---

### Task 5: `progress.ts` — trạng thái hoạt động suy từ `assessments`

**Files:**
- Create: `src/lib/curriculum/progress.ts`
- Test: `tests/progress.test.ts`

**Interfaces:**
- Consumes: `lessonsOf`, `TOTAL_GROUPS` từ `@/lib/curriculum/groups` (Task 4).
- Produces: kiểu `AssessmentRow`, `CursorRow`, `ActivityState`, `RemedialState`,
  `GroupState`, `NextActivity`; hàm
  `groupStates(assessments, cursors): GroupState[]`,
  `groupDone(state: GroupState): boolean`,
  `nextActivity(states): NextActivity | null`,
  `toAssessmentRow(row): AssessmentRow`, `toCursorRow(row, lessonOrdinalById): CursorRow`.

- [ ] **Bước 1: Viết test trước**

Tạo `tests/progress.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  groupStates, groupDone, nextActivity,
  type AssessmentRow, type CursorRow, type GroupState,
} from "@/lib/curriculum/progress";

function att(over: Partial<AssessmentRow> & Pick<AssessmentRow, "id" | "type" | "scope">): AssessmentRow {
  return { status: "submitted", passed: true, score: 90, parentId: null, ...over };
}

const NO_CURSOR: CursorRow[] = [];

function group1(assessments: AssessmentRow[], cursors: CursorRow[] = NO_CURSOR): GroupState {
  return groupStates(assessments, cursors)[0]!;
}

describe("groupStates — hình dạng", () => {
  it("luôn trả đúng 10 nhóm, mỗi nhóm 3 hoạt động", () => {
    const states = groupStates([], []);
    expect(states).toHaveLength(10);
    for (const s of states) expect(s.activities).toHaveLength(3);
  });

  it("nhóm 1 gồm buổi 1 và 2", () => {
    expect(groupStates([], [])[0]!.lessons).toEqual([1, 2]);
  });

  it("chưa có gì thì cả ba ô đều chưa làm", () => {
    const s = group1([]);
    expect(s.activities.map((a) => a.kind)).toEqual(["chua-lam", "chua-lam", "chua-lam"]);
  });
});

describe("ô buổi học", () => {
  it("có con trỏ > 0 mà chưa thi thì là đang học", () => {
    const s = group1([], [{ lessonOrdinal: 1, wordIndex: 6 }]);
    expect(s.activities[0]).toEqual({ kind: "dang-hoc", wordIndex: 6 });
  });

  it("con trỏ bằng 0 vẫn là chưa làm", () => {
    const s = group1([], [{ lessonOrdinal: 1, wordIndex: 0 }]);
    expect(s.activities[0]!.kind).toBe("chua-lam");
  });

  it("bài đang làm dở thắng con trỏ", () => {
    const s = group1(
      [att({ id: 5, type: "lesson", scope: [1], status: "in_progress", passed: null, score: null })],
      [{ lessonOrdinal: 1, wordIndex: 12 }],
    );
    expect(s.activities[0]).toEqual({ kind: "dang-thi", assessmentId: 5 });
  });

  it("đạt thì mang theo điểm", () => {
    const s = group1([att({ id: 5, type: "lesson", scope: [1], score: 93 })]);
    expect(s.activities[0]).toEqual({ kind: "dat", score: 93, assessmentId: 5 });
  });

  it("lần thử mới nhất quyết định, không phải lần đầu", () => {
    const s = group1([
      att({ id: 5, type: "lesson", scope: [1], passed: false, score: 60 }),
      att({ id: 9, type: "lesson", scope: [1], passed: true, score: 87 }),
    ]);
    expect(s.activities[0]!.kind).toBe("dat");
  });

  it("passed = null trên bài đã nộp tính là chưa đạt — fail closed", () => {
    const s = group1([att({ id: 5, type: "lesson", scope: [1], passed: null, score: 88 })]);
    expect(s.activities[0]!.kind).toBe("chua-dat");
  });

  it("buổi 2 đọc đúng scope của nó, không lẫn với buổi 1", () => {
    const s = group1([att({ id: 5, type: "lesson", scope: [1], score: 91 })]);
    expect(s.activities[0]!.kind).toBe("dat");
    expect(s.activities[1]!.kind).toBe("chua-lam");
  });
});

describe("ô ôn tập", () => {
  it("không bao giờ là đang học — nó không có pha học nào", () => {
    // Con trỏ của CẢ HAI buổi trong nhóm đều > 0 mà ô ôn tập vẫn phải chưa làm.
    const s = group1([], [
      { lessonOrdinal: 1, wordIndex: 20 },
      { lessonOrdinal: 2, wordIndex: 20 },
    ]);
    expect(s.activities[2]!.kind).toBe("chua-lam");
  });

  it("đọc scope hai buổi của nhóm", () => {
    const s = group1([att({ id: 7, type: "review", scope: [1, 2], score: 84 })]);
    expect(s.activities[2]).toEqual({ kind: "dat", score: 84, assessmentId: 7 });
  });

  it("scope lệch thứ tự không tính là cùng phạm vi", () => {
    const s = group1([att({ id: 7, type: "review", scope: [2, 1], score: 84 })]);
    expect(s.activities[2]!.kind).toBe("chua-lam");
  });
});

describe("chuỗi bổ túc", () => {
  const truot = att({ id: 10, type: "lesson", scope: [1], passed: false, score: 55 });

  it("trượt mà chưa có bổ túc → cần làm bổ túc", () => {
    const s = group1([truot]);
    expect(s.activities[0]).toMatchObject({ kind: "chua-dat", remedial: { kind: "can-lam" } });
  });

  it("bổ túc đang làm dở", () => {
    const s = group1([
      truot,
      att({ id: 11, type: "remedial", scope: [1], status: "in_progress", passed: null, score: null, parentId: 10 }),
    ]);
    expect(s.activities[0]).toMatchObject({ remedial: { kind: "dang-lam", assessmentId: 11 } });
  });

  it("bổ túc đã đạt → được làm lại bài chính", () => {
    const s = group1([truot, att({ id: 11, type: "remedial", scope: [1], parentId: 10 })]);
    expect(s.activities[0]).toMatchObject({ remedial: { kind: "da-dat", assessmentId: 11 } });
  });

  it("trượt bổ túc → lại cần bổ túc tiếp", () => {
    const s = group1([
      truot,
      att({ id: 11, type: "remedial", scope: [1], passed: false, score: 40, parentId: 10 }),
    ]);
    expect(s.activities[0]).toMatchObject({ remedial: { kind: "can-lam" } });
  });

  it("đi hết chuỗi bổ túc lồng nhau, lấy mắt xích cuối", () => {
    const s = group1([
      truot,
      att({ id: 11, type: "remedial", scope: [1], passed: false, score: 40, parentId: 10 }),
      att({ id: 12, type: "remedial", scope: [1], passed: true, score: 100, parentId: 11 }),
    ]);
    expect(s.activities[0]).toMatchObject({ remedial: { kind: "da-dat", assessmentId: 12 } });
  });

  it("bổ túc của lần trượt CŨ không dính vào lần trượt mới", () => {
    const s = group1([
      truot,
      att({ id: 11, type: "remedial", scope: [1], parentId: 10 }),
      att({ id: 20, type: "lesson", scope: [1], passed: false, score: 50 }),
    ]);
    expect(s.activities[0]).toMatchObject({
      assessmentId: 20,
      remedial: { kind: "can-lam" },
    });
  });
});

describe("groupDone và nextActivity", () => {
  const xong = (lessons: [number, number]): AssessmentRow[] => [
    att({ id: lessons[0] * 100, type: "lesson", scope: [lessons[0]] }),
    att({ id: lessons[1] * 100, type: "lesson", scope: [lessons[1]] }),
    att({ id: lessons[0] * 100 + 1, type: "review", scope: lessons }),
  ];

  it("groupDone chỉ đúng khi cả ba ô đều đạt", () => {
    expect(groupDone(group1(xong([1, 2])))).toBe(true);
    expect(groupDone(group1([att({ id: 1, type: "lesson", scope: [1] })]))).toBe(false);
  });

  it("nextActivity trỏ vào ô chưa đạt đầu tiên", () => {
    const states = groupStates([att({ id: 1, type: "lesson", scope: [1] })], []);
    expect(nextActivity(states)).toEqual({ group: 1, index: 1, lessonOrdinal: 2 });
  });

  it("nextActivity trỏ ô ôn tập khi hai buổi đã đạt", () => {
    const states = groupStates(
      [att({ id: 1, type: "lesson", scope: [1] }), att({ id: 2, type: "lesson", scope: [2] })],
      [],
    );
    expect(nextActivity(states)).toEqual({ group: 1, index: 2, lessonOrdinal: null });
  });

  it("nhảy sang nhóm sau khi nhóm trước đã xong hết", () => {
    const states = groupStates(xong([1, 2]), []);
    expect(nextActivity(states)).toEqual({ group: 2, index: 0, lessonOrdinal: 3 });
  });

  it("trả null khi xong toàn bộ chương trình", () => {
    const all: AssessmentRow[] = [];
    for (let g = 1; g <= 10; g++) all.push(...xong([g * 2 - 1, g * 2]));
    expect(nextActivity(groupStates(all, []))).toBeNull();
  });
});
```

- [ ] **Bước 2: Chạy test để xác nhận nó ĐỎ**

Run: `npx vitest run tests/progress.test.ts`
Expected: FAIL — không tìm thấy module `@/lib/curriculum/progress`.

- [ ] **Bước 3: Viết `src/lib/curriculum/progress.ts`**

```ts
/**
 * Trạng thái của 30 hoạt động (10 nhóm × 3) suy TỪ `assessments`, không lưu
 * song song ở đâu cả.
 *
 * Trước lát 2a, trạng thái buổi nằm ở cột `user_lesson_progress.status` —
 * một bản sao thứ hai của cùng một sự thật, với default `'locked'` khiến một
 * INSERT thiếu tường minh khoá nhầm buổi đang mở. Bảng đó đã bị xoá; đây là
 * nguồn duy nhất.
 *
 * Hàm thuần: không I/O, không React, không database. Trang chỉ hiển thị những
 * gì hàm này trả ra.
 */

import { lessonsOf, TOTAL_GROUPS } from "./groups";

export type AssessmentType = "lesson" | "review" | "remedial" | "grammar";
export type AssessmentStatus = "in_progress" | "submitted";

export interface AssessmentRow {
  id: number;
  type: AssessmentType;
  scope: number[];
  status: AssessmentStatus;
  passed: boolean | null;
  score: number | null;
  parentId: number | null;
}

export interface CursorRow {
  lessonOrdinal: number;
  wordIndex: number;
}

/** Việc phải làm tiếp cho một lần thử đã trượt. */
export type RemedialState =
  | { kind: "can-lam" }
  | { kind: "dang-lam"; assessmentId: number }
  | { kind: "da-dat"; assessmentId: number };

export type ActivityState =
  | { kind: "chua-lam" }
  | { kind: "dang-hoc"; wordIndex: number }
  | { kind: "dang-thi"; assessmentId: number }
  | { kind: "dat"; score: number; assessmentId: number }
  | { kind: "chua-dat"; score: number; assessmentId: number; remedial: RemedialState };

export interface GroupState {
  group: number;
  lessons: [number, number];
  /** [buổi A, buổi B, ôn tập] — thứ tự này cố định và trang `/vocab` dựa vào nó. */
  activities: [ActivityState, ActivityState, ActivityState];
}

export interface NextActivity {
  group: number;
  index: 0 | 1 | 2;
  /** `null` với ô ôn tập — nó không thuộc buổi nào. */
  lessonOrdinal: number | null;
}

/** Hai phạm vi bằng nhau khi cùng độ dài VÀ cùng thứ tự. */
function sameScope(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Đi hết chuỗi bổ túc mọc ra từ MỘT lần thử đã trượt.
 *
 * Chuỗi có thể dài hơn một mắt: trượt bài chính → bổ túc → trượt bổ túc → bổ
 * túc tiếp. Duyệt theo `id` tăng dần là đủ và đúng, vì một bài bổ túc luôn
 * được tạo SAU bài cha nên `id` của nó luôn lớn hơn.
 *
 * Chỉ nhận bổ túc nối được vào đúng lần thử này qua `parentId` — không lọc
 * theo `scope`. Trượt cùng một bài hai lần sinh ra hai chuỗi riêng biệt cùng
 * `scope`; nếu lọc theo `scope` thì bổ túc của lần trượt CŨ sẽ hiện lên như
 * việc phải làm cho lần trượt MỚI.
 */
function remedialStateFor(
  attemptId: number,
  assessments: readonly AssessmentRow[],
): RemedialState {
  const chain = new Set<number>([attemptId]);
  let latest: AssessmentRow | null = null;

  for (const r of [...assessments].sort((a, b) => a.id - b.id)) {
    if (r.type !== "remedial" || r.parentId === null) continue;
    if (!chain.has(r.parentId)) continue;
    chain.add(r.id);
    latest = r;
  }

  if (latest === null) return { kind: "can-lam" };
  if (latest.status === "in_progress") return { kind: "dang-lam", assessmentId: latest.id };
  // `passed !== true` tính là chưa đạt — fail closed, cùng cách mọi nơi khác
  // trong tệp này đọc cột đó.
  return latest.passed === true
    ? { kind: "da-dat", assessmentId: latest.id }
    : { kind: "can-lam" };
}

function activityState(
  type: "lesson" | "review",
  scope: readonly number[],
  assessments: readonly AssessmentRow[],
  cursors: readonly CursorRow[],
): ActivityState {
  const attempts = assessments
    .filter((r) => r.type === type && sameScope(r.scope, scope))
    .sort((a, b) => a.id - b.id);
  const latest = attempts.at(-1) ?? null;

  if (latest === null) {
    // Chỉ ô BUỔI mới có pha học. Ô ôn tập đi thẳng từ "chưa làm" sang "đang
    // thi" — nó không có 30 thẻ nào để duyệt, nên không có `lesson_cursor`.
    if (type === "lesson") {
      const cursor = cursors.find((c) => c.lessonOrdinal === scope[0]);
      if (cursor !== undefined && cursor.wordIndex > 0) {
        return { kind: "dang-hoc", wordIndex: cursor.wordIndex };
      }
    }
    return { kind: "chua-lam" };
  }

  if (latest.status === "in_progress") return { kind: "dang-thi", assessmentId: latest.id };

  const score = latest.score ?? 0;
  if (latest.passed === true) return { kind: "dat", score, assessmentId: latest.id };
  return {
    kind: "chua-dat",
    score,
    assessmentId: latest.id,
    remedial: remedialStateFor(latest.id, assessments),
  };
}

export function groupStates(
  assessments: readonly AssessmentRow[],
  cursors: readonly CursorRow[],
): GroupState[] {
  const out: GroupState[] = [];
  for (let group = 1; group <= TOTAL_GROUPS; group++) {
    const lessons = lessonsOf(group);
    out.push({
      group,
      lessons,
      activities: [
        activityState("lesson", [lessons[0]], assessments, cursors),
        activityState("lesson", [lessons[1]], assessments, cursors),
        activityState("review", lessons, assessments, cursors),
      ],
    });
  }
  return out;
}

export function groupDone(state: GroupState): boolean {
  return state.activities.every((a) => a.kind === "dat");
}

/**
 * Hoạt động chưa đạt có `(nhóm, thứ tự trong nhóm)` nhỏ nhất — dòng tắt
 * "Tiếp tục" trên dashboard.
 *
 * Đây là GỢI Ý, không phải luật: 10 nhóm vẫn mở hết, người học bấm thẳng vào
 * nhóm 7 lúc nào cũng được.
 */
export function nextActivity(states: readonly GroupState[]): NextActivity | null {
  for (const s of states) {
    for (let index = 0; index < s.activities.length; index++) {
      if (s.activities[index]!.kind === "dat") continue;
      return {
        group: s.group,
        index: index as 0 | 1 | 2,
        lessonOrdinal: index === 2 ? null : s.lessons[index as 0 | 1],
      };
    }
  }
  return null;
}

/** Một dòng `assessments` (snake_case) → `AssessmentRow`. */
export function toAssessmentRow(row: {
  id: number;
  type: string;
  scope: number[];
  status: string;
  passed: boolean | null;
  score: number | null;
  parent_id: number | null;
}): AssessmentRow {
  return {
    id: row.id,
    type: row.type as AssessmentType,
    scope: row.scope,
    status: row.status as AssessmentStatus,
    passed: row.passed,
    score: row.score,
    parentId: row.parent_id,
  };
}

/**
 * Một dòng `lesson_cursor` → `CursorRow`.
 *
 * `lesson_cursor` khoá theo `lesson_id` (khoá chính của bảng `lessons`), còn
 * mọi thứ trong tệp này nói bằng `ordinal` (1..20). Người gọi truyền vào bảng
 * tra — trang đã đọc `lessons` rồi nên không tốn thêm truy vấn nào.
 */
export function toCursorRow(
  row: { lesson_id: number; word_index: number },
  ordinalById: ReadonlyMap<number, number>,
): CursorRow | null {
  const lessonOrdinal = ordinalById.get(row.lesson_id);
  // Một dòng con trỏ trỏ tới buổi không còn tồn tại thì bỏ qua, không dựng ra
  // một `CursorRow` với ordinal `undefined` rồi so sánh trượt ở mọi chỗ.
  return lessonOrdinal === undefined ? null : { lessonOrdinal, wordIndex: row.word_index };
}
```

- [ ] **Bước 4: Chạy test để xác nhận nó XANH**

Run: `npx vitest run tests/progress.test.ts`
Expected: PASS — 24 test.

- [ ] **Bước 5: Commit**

```bash
git add src/lib/curriculum/progress.ts tests/progress.test.ts
git commit -m "feat(2a): trang thai 30 hoat dong suy tu assessments, khong luu song song"
```

---

### Task 6: `/vocab` — danh sách 10 nhóm

**Files:**
- Create: `src/app/(app)/vocab/page.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Create: `e2e/vocab.spec.ts`

**Interfaces:**
- Consumes: `lessonsOf`, `wordRangeLabel`, `TOTAL_GROUPS` (Task 4);
  `groupStates`, `groupDone`, `toAssessmentRow`, `toCursorRow`,
  `type GroupState`, `type ActivityState` (Task 5).
- Produces: route `/vocab`; `data-testid="group-row"` mang `data-group`;
  `data-testid="activity"` mang `data-kind` (`chua-lam`/`dang-hoc`/`dang-thi`/`dat`/`chua-dat`).

- [ ] **Bước 1: Viết `src/app/(app)/vocab/page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { wordRangeLabel, WORDS_PER_LESSON } from "@/lib/curriculum/groups";
import {
  groupStates, groupDone, toAssessmentRow, toCursorRow,
  type ActivityState, type CursorRow,
} from "@/lib/curriculum/progress";

export default async function VocabPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [lessonsRes, assessmentsRes, cursorsRes] = await Promise.all([
    supabase.from("lessons").select("id, ordinal").order("ordinal"),
    // `.eq("user_id", user.id)` tường minh dù RLS đã lọc đúng — không dựa vào
    // một lớp phòng thủ duy nhất. Không chọn `is_correct` hay đáp án ở đâu
    // trong cả trang: chúng không có việc gì ở màn hình danh sách.
    supabase
      .from("assessments")
      .select("id, type, scope, status, passed, score, parent_id")
      .eq("user_id", user.id)
      .order("id"),
    supabase.from("lesson_cursor").select("lesson_id, word_index").eq("user_id", user.id),
  ]);
  if (lessonsRes.error) throw lessonsRes.error;
  if (assessmentsRes.error) throw assessmentsRes.error;
  if (cursorsRes.error) throw cursorsRes.error;

  const lessons = lessonsRes.data ?? [];
  const idByOrdinal = new Map(lessons.map((l) => [l.ordinal as number, l.id as number]));
  const ordinalById = new Map(lessons.map((l) => [l.id as number, l.ordinal as number]));

  const assessments = (assessmentsRes.data ?? []).map(toAssessmentRow);
  const cursors = (cursorsRes.data ?? [])
    .map((r) => toCursorRow(r as { lesson_id: number; word_index: number }, ordinalById))
    .filter((c): c is CursorRow => c !== null);

  const states = groupStates(assessments, cursors);
  const doneCount = states.filter(groupDone).length;

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Từ vựng</h1>
        <p data-testid="group-summary" className="mt-1 text-sm text-slate-600">
          {doneCount}/{states.length} nhóm hoàn thành
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-200">
          <div
            className="h-full bg-slate-700"
            style={{ width: `${(doneCount / states.length) * 100}%` }}
          />
        </div>
      </div>

      <ol className="flex flex-col gap-3">
        {states.map((s) => (
          <li
            key={s.group}
            data-testid="group-row"
            data-group={s.group}
            className="rounded border border-slate-200 bg-white p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="font-medium">
                NHÓM {s.group} · {wordRangeLabel(s.group)}
              </span>
              <Link
                href={`/vocab/browse/${s.group}`}
                data-testid="browse-link"
                className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-600"
              >
                📖 Xem lại
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {s.activities.map((activity, i) => {
                // Ô ôn tập chưa có đích tới ở lát 2a (bài thi là 2b). Ô buổi
                // chỉ có link khi tra được id thật — thiếu dòng `lessons` thì
                // để `null`, không dựng ra "/vocab/learn/undefined".
                const lessonId = i === 2 ? undefined : idByOrdinal.get(s.lessons[i as 0 | 1]);
                return (
                  <ActivityBox
                    key={i}
                    // Số thứ tự TOÀN CỤC (1..20), không phải thứ tự trong nhóm:
                    // trang học đặt tiêu đề "Buổi 5", nên nhãn ở đây cũng phải
                    // là "Buổi 5". Đánh số lại theo nhóm thì bấm "Buổi 1" ở
                    // nhóm 3 sẽ mở ra một trang tên "Buổi 5".
                    label={i === 2 ? "Ôn tập" : `Buổi ${s.lessons[i as 0 | 1]}`}
                    state={activity}
                    href={lessonId === undefined ? null : `/vocab/learn/${lessonId}`}
                  />
                );
              })}
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}

function describe(state: ActivityState): string {
  switch (state.kind) {
    case "chua-lam":
      return "chưa học";
    case "dang-hoc":
      // +1 vì `wordIndex` đếm từ 0 còn người học đếm từ 1.
      return `từ ${state.wordIndex + 1}/${WORDS_PER_LESSON}`;
    case "dang-thi":
      return "đang thi";
    case "dat":
      return `${state.score}đ ✓`;
    case "chua-dat":
      return `${state.score}đ · bổ túc`;
  }
}

function ActivityBox({
  label, state, href,
}: {
  label: string;
  state: ActivityState;
  href: string | null;
}) {
  const shell = "rounded border px-2 py-3 text-center text-xs";
  const tone =
    state.kind === "dat"
      ? "border-slate-300 bg-slate-100"
      : state.kind === "chua-lam"
        ? "border-slate-200 text-slate-400"
        : "border-slate-400";
  const inner = (
    <>
      <span className="block font-medium">{label}</span>
      <span className="block text-slate-600">{describe(state)}</span>
    </>
  );
  return (
    <div data-testid="activity" data-kind={state.kind}>
      {/* Ô ôn tập chưa có đích tới ở lát 2a — bài thi là lát 2b. Vẫn render
          đúng trạng thái để `progress.ts` được kiểm chứng thật trên màn hình,
          chỉ không bấm được. */}
      {href ? (
        <Link href={href} className={`${shell} ${tone} block bg-white hover:border-slate-500`}>
          {inner}
        </Link>
      ) : (
        <div className={`${shell} ${tone}`}>{inner}</div>
      )}
    </div>
  );
}
```

- [ ] **Bước 2: Thêm link ở header**

Trong `src/app/(app)/layout.tsx`, thêm vào khối `<div className="flex items-center gap-4">`,
**trước** link Thống kê:

```tsx
<Link href="/vocab" data-testid="vocab-link" className="text-sm underline">
  Từ vựng
</Link>
```

Giữ nguyên chú thích đang có về việc "không có link này thì route không tồn tại
với người học dù đã build xong" — nó áp dụng y hệt ở đây.

- [ ] **Bước 3: Viết e2e**

Tạo `e2e/vocab.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "./test-user";
import { adminClient } from "./admin";

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

test.afterEach(async () => {
  // Dọn tiến độ của CHÍNH tài khoản test, không đụng ai khác.
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const u = data?.users.find((x) => x.email === TEST_EMAIL);
  if (u) {
    // Mỗi lượt xoá đọc `error` riêng và ném ngay: nuốt lỗi ở một trong ba
    // lượt để lại tiến độ rò sang kịch bản kế tiếp.
    const delCursor = await admin.from("lesson_cursor").delete().eq("user_id", u.id);
    if (delCursor.error) throw delCursor.error;
    const delNotes = await admin.from("word_notes").delete().eq("user_id", u.id);
    if (delNotes.error) throw delNotes.error;
    const delMastery = await admin.from("word_mastery").delete().eq("user_id", u.id);
    if (delMastery.error) throw delMastery.error;
  }
});

test("trang từ vựng liệt kê đúng 10 nhóm, mỗi nhóm 3 hoạt động", async ({ page }) => {
  await login(page);
  await page.getByTestId("vocab-link").click();
  await page.waitForURL("**/vocab");

  await expect(page.getByTestId("group-row")).toHaveCount(10);
  await expect(page.getByTestId("activity")).toHaveCount(30);
  await expect(page.getByTestId("group-summary")).toHaveText("0/10 nhóm hoàn thành");
});

test("nhóm 1 hiện đúng phạm vi từ", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await expect(page.getByTestId("group-row").first()).toContainText("NHÓM 1 · từ 1–60");
});

test("vào thẳng nhóm 7 khi chưa học nhóm nào — không còn khoá", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");

  const nhom7 = page.getByTestId("group-row").filter({ hasText: "NHÓM 7" });
  await nhom7.getByTestId("activity").first().click();

  await page.waitForURL("**/vocab/learn/**");
  await expect(page.getByTestId("deck-position")).toBeVisible();
});
```

Kịch bản thứ ba sẽ ĐỎ cho tới Task 8 (chưa có `/vocab/learn`). Đó là đúng: nó
là khẳng định trung tâm của cả lát này, viết ra trước để không quên.

- [ ] **Bước 4: Chạy**

```bash
npm run build
npx playwright test e2e/vocab.spec.ts
```
Expected: hai kịch bản đầu PASS, kịch bản thứ ba FAIL (chưa có route). Ghi rõ
điều này trong báo cáo.

- [ ] **Bước 5: Commit**

```bash
git add "src/app/(app)/vocab/page.tsx" "src/app/(app)/layout.tsx" e2e/vocab.spec.ts
git commit -m "feat(2a): trang tu vung liet ke 10 nhom hoc tu do"
```

---

### Task 7: `load-cards.ts` — đọc N từ kèm ghi chú

**Files:**
- Create: `src/lib/vocab/load-cards.ts`
- Test: `tests/load-cards.test.ts`
- Recreate: `tests/corpus.test.ts` (Task 3 đã xoá bản cũ)

**Interfaces:**
- Consumes: `VocabLite`, `toVocabLite` từ `@/lib/vocab/word` (Task 2).
- Produces: `interface VocabCard`;
  `renderCard(lite: VocabLite, blankAnswer: string, note: string): VocabCard` (hàm thuần);
  `loadCards(supabase, lessonIds, userId): Promise<VocabCard[]>`.

- [ ] **Bước 1: Viết `src/lib/vocab/load-cards.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { toVocabLite, type VocabLite } from "./word";

/**
 * Một thẻ từ ĐÃ SẴN SÀNG gửi xuống trình duyệt.
 *
 * Khác `VocabLite` ở hai điểm, và cả hai đều có chủ đích:
 *  - `exampleEn` đã được ĐIỀN LẠI từ vào chỗ "___", nên đọc được như câu gốc.
 *  - KHÔNG có `blankAnswer`. Đó là đáp án của câu điền từ ở lát 2b; nó không
 *    bao giờ rời server. Trường này vắng mặt ở đây là hàng rào cuối cùng —
 *    nếu có, một lần `JSON.stringify` xuống props là đủ để lộ.
 */
export interface VocabCard {
  id: number;
  word: string;
  pos: string;
  ipa: string;
  meaningVi: string;
  definitionEn: string;
  synonyms: string[];
  exampleEn: string;
  exampleVi: string;
  /** Ghi chú của chính người học. Chuỗi rỗng khi chưa viết gì. */
  note: string;
}

interface LessonWordRow {
  lesson_id: number;
  position: number;
  vocab_words: {
    id: number; word: string; pos: string; ipa: string;
    meaning_vi: string; definition_en: string; synonyms: string[];
    example_en: string; example_vi: string;
  };
}

/**
 * Một từ + đáp án chỗ trống + ghi chú → thẻ sẵn sàng hiển thị. HÀM THUẦN.
 *
 * Tách khỏi `loadCards` có chủ đích: đây là đường mà `tests/corpus.test.ts`
 * chạy qua CẢ 605 từ thật trong `data/clean/vocab.json` mà không cần database.
 * Lát 1b từng có một lỗi khiến mọi câu điền từ hiển thị vỡ vụn, và nó lọt qua
 * được vì fixture của test đơn vị mô phỏng một kho dữ liệu không tồn tại. Chỗ
 * duy nhất chặn được loại lỗi đó là một hàm thuần chạy trên dữ liệu THẬT.
 */
export function renderCard(lite: VocabLite, blankAnswer: string, note: string): VocabCard {
  return {
    id: lite.id,
    word: lite.word,
    pos: lite.pos,
    ipa: lite.ipa,
    meaningVi: lite.meaningVi,
    definitionEn: lite.definitionEn,
    synonyms: lite.synonyms,
    // Phase 0 đã khoét đúng một "___" vào cả 605 câu; điền lại chính
    // `blank_answer` (chứ không phải `word`) dựng lại ĐÚNG nguyên câu gốc, kể
    // cả khi đáp án là một dạng biến cách — 183/600 từ trong chương trình rơi
    // vào trường hợp đó (đo trên data/clean/vocab.json; chú thích ở
    // 0007_assessment_parent.sql ghi 168, đếm theo cách khác).
    exampleEn: lite.exampleEn.replace("___", blankAnswer),
    exampleVi: lite.exampleVi,
    note,
  };
}

/**
 * Đọc mọi thứ pha học cần, trong MỘT đợt.
 *
 * `lessonIds` theo đúng thứ tự muốn hiển thị: một buổi (30 thẻ) hoặc hai buổi
 * của một nhóm (60 thẻ, xem lại). Thứ tự thẻ = thứ tự buổi trong mảng, rồi
 * `position` trong buổi.
 *
 * `blank_answer` bị thu hồi khỏi `authenticated` (0004_rls.sql:41-44) nên
 * không đọc thẳng được — dùng RPC `security definer`
 * `blank_answers_for_lesson` (0007), MỘT lượt cho cả buổi thay vì 30 lượt
 * `answer_for_word`. Giá trị đó CHỈ dùng để điền lại câu ví dụ ngay tại đây
 * rồi bị bỏ, không đi vào `VocabCard`.
 */
export async function loadCards(
  supabase: SupabaseClient,
  lessonIds: readonly number[],
  userId: string,
): Promise<VocabCard[]> {
  if (lessonIds.length === 0) return [];

  const [lwRes, ...blankResults] = await Promise.all([
    supabase
      .from("lesson_words")
      .select(
        "lesson_id, position, vocab_words(id, word, pos, ipa, meaning_vi, definition_en, synonyms, example_en, example_vi)",
      )
      .in("lesson_id", [...lessonIds]),
    ...lessonIds.map((id) => supabase.rpc("blank_answers_for_lesson", { p_lesson_id: id })),
  ]);
  if (lwRes.error) throw lwRes.error;

  const blanks: Record<string, string> = {};
  for (const res of blankResults) {
    if (res.error) throw res.error;
    Object.assign(blanks, (res.data ?? {}) as Record<string, string>);
  }

  // Không có generic Database trên client nên postgrest-js suy luận MỌI quan hệ
  // nhúng có sub-field là mảng, bất kể FK thật sự là 1-1 hay 1-n. Ép qua
  // `unknown` trước vì TS không cho ép thẳng hai kiểu không giao nhau đủ.
  // Runtime trả về một đối tượng vì lesson_words.word_id là khoá ngoại tới
  // vocab_words(id) — 0002_curriculum.sql:9-14.
  const rows = (lwRes.data ?? []) as unknown as LessonWordRow[];

  // Sắp thứ tự Ở ĐÂY chứ không bằng `.order()`: với hai buổi, thứ tự phải theo
  // vị trí của `lesson_id` TRONG MẢNG `lessonIds`, không phải theo giá trị id.
  const rank = new Map(lessonIds.map((id, i) => [id, i]));
  rows.sort(
    (a, b) => rank.get(a.lesson_id)! - rank.get(b.lesson_id)! || a.position - b.position,
  );

  const wordIds = rows.map((r) => r.vocab_words.id);
  const notesRes = await supabase
    .from("word_notes")
    .select("word_id, body")
    .eq("user_id", userId)
    .in("word_id", wordIds);
  if (notesRes.error) throw notesRes.error;
  const noteByWord = new Map(
    (notesRes.data ?? []).map((n) => [n.word_id as number, n.body as string]),
  );

  return rows.map((r) => {
    const lite = toVocabLite(r.vocab_words);
    // Khoá jsonb là text (`jsonb_object_agg(v.id::text, ...)` trong migration)
    // — ép id sang chuỗi để tra đúng.
    return renderCard(lite, blanks[String(lite.id)] ?? "", noteByWord.get(lite.id) ?? "");
  });
}
```

- [ ] **Bước 2: Viết test chạm database**

Tạo `tests/load-cards.test.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadCards } from "@/lib/vocab/load-cards";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(URL && ANON && SERVICE);

describe.skipIf(!hasEnv)("loadCards", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "noop", {
    auth: { persistSession: false },
  });
  const email = `load-cards-${Date.now()}@test.local`;
  const password = "load-pass-1234";
  let userId = "";
  let userClient = createClient(URL ?? "http://localhost", ANON ?? "noop");
  let lesson1 = 0;
  let lesson2 = 0;

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: "Người thử loadCards" },
    });
    if (error) throw error;
    userId = data.user!.id;

    userClient = createClient(URL!, ANON!);
    const signIn = await userClient.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;

    const { data: ls, error: lsErr } = await admin
      .from("lessons").select("id, ordinal").in("ordinal", [1, 2]).order("ordinal");
    if (lsErr) throw lsErr;
    lesson1 = ls![0]!.id as number;
    lesson2 = ls![1]!.id as number;
  });

  afterAll(async () => {
    if (userId) {
      await admin.from("word_notes").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("một buổi trả đúng 30 thẻ, theo đúng position", async () => {
    const cards = await loadCards(userClient, [lesson1], userId);
    expect(cards).toHaveLength(30);
    expect(new Set(cards.map((c) => c.id)).size).toBe(30);
  });

  it("hai buổi trả 60 thẻ, buổi đầu đứng trước", async () => {
    const mot = await loadCards(userClient, [lesson1], userId);
    const hai = await loadCards(userClient, [lesson1, lesson2], userId);
    expect(hai).toHaveLength(60);
    expect(hai.slice(0, 30).map((c) => c.id)).toEqual(mot.map((c) => c.id));
  });

  it("thứ tự theo mảng lessonIds, không theo giá trị id", async () => {
    const nguoc = await loadCards(userClient, [lesson2, lesson1], userId);
    const xuoi = await loadCards(userClient, [lesson1, lesson2], userId);
    expect(nguoc[0]!.id).toBe(xuoi[30]!.id);
  });

  it("câu ví dụ đã điền lại, không còn chỗ trống", async () => {
    const cards = await loadCards(userClient, [lesson1], userId);
    for (const c of cards) expect(c.exampleEn).not.toContain("___");
  });

  it("không mang theo blankAnswer xuống client", async () => {
    const cards = await loadCards(userClient, [lesson1], userId);
    expect(Object.keys(cards[0]!)).not.toContain("blankAnswer");
  });

  it("ghi chú rỗng khi chưa viết gì, và đọc đúng khi đã có", async () => {
    const truoc = await loadCards(userClient, [lesson1], userId);
    expect(truoc[0]!.note).toBe("");

    const body = "ghi chú\nnhiều dòng";
    const ins = await admin
      .from("word_notes").insert({ user_id: userId, word_id: truoc[0]!.id, body });
    expect(ins.error).toBeNull();

    const sau = await loadCards(userClient, [lesson1], userId);
    expect(sau[0]!.note).toBe(body);
  });
});
```

- [ ] **Bước 3: Chạy test**

Run: `npx vitest run tests/load-cards.test.ts`
Expected: PASS — 6 test.

- [ ] **Bước 4: Dựng lại `tests/corpus.test.ts` cho đường hiển thị mới**

Task 3 đã xoá bản cũ (nó dựng 2700 item của luồng 135 đã chết). Đây là lớp bảo
vệ duy nhất chạy trên **dữ liệu thật** mà không cần database, và nó tồn tại vì
một lỗi thật đã lọt qua mọi lớp khác. Viết lại `tests/corpus.test.ts`:

```ts
/**
 * Dựng thẻ hiển thị cho CẢ 600 từ của chương trình từ chính
 * `data/clean/*.json` — kho nội dung THẬT đã seed lên database — rồi soi mọi
 * thứ người học sẽ nhìn thấy.
 *
 * VÌ SAO PHẢI CÓ TỆP NÀY. Lát 1b từng có một lỗi khiến MỌI câu điền từ hiển
 * thị vỡ vụn ("___I___t___ ___i___s___…") mà không lớp kiểm thử nào bắt được:
 * fixture của test đơn vị mô phỏng một kho dữ liệu KHÔNG TỒN TẠI, còn test
 * tích hợp thì không chạm tới nội dung hiển thị. Lỗi chỉ lộ ra khi có người mở
 * trình duyệt.
 *
 * Tệp này lấp đúng khoảng trống đó: không mô phỏng gì cả, không cần database.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderCard } from "@/lib/vocab/load-cards";
import type { VocabLite } from "@/lib/vocab/word";
import type { LessonPlan, VocabWord } from "@content/types";

const vocab = JSON.parse(readFileSync("data/clean/vocab.json", "utf8")) as VocabWord[];
const plan = JSON.parse(readFileSync("data/clean/lesson-plan.json", "utf8")) as LessonPlan[];
const byOrdinal = new Map(vocab.map((w) => [w.ordinal, w]));

/** Cùng hình dạng `toVocabLite` dựng từ một dòng database, nhưng lấy từ JSON.
    `blankAnswer` để rỗng vì đó đúng là thứ client đọc lên được. */
function lite(w: VocabWord): VocabLite {
  return {
    id: w.ordinal, word: w.word, pos: w.pos, ipa: w.ipa,
    meaningVi: w.meaningVi, definitionEn: w.definitionEn, synonyms: w.synonyms,
    exampleEn: w.exampleEn, exampleVi: w.exampleVi, blankAnswer: "",
  };
}

const cards = plan.flatMap((p) =>
  p.wordOrdinals.map((o) => {
    const source = byOrdinal.get(o);
    if (!source) throw new Error(`lesson-plan trỏ tới từ ${o} không có trong vocab.json`);
    return { source, card: renderCard(lite(source), source.blankAnswer, "") };
  }),
);

describe("toàn bộ thẻ từ dựng từ data/clean/", () => {
  it("dựng đủ 20 buổi × 30 từ = 600 thẻ, không từ nào lặp", () => {
    expect(plan).toHaveLength(20);
    expect(cards).toHaveLength(600);
    expect(new Set(cards.map((c) => c.card.id)).size).toBe(600);
  });

  it("không thẻ nào còn chỗ trống chưa điền", () => {
    for (const { card } of cards) expect(card.exampleEn).not.toContain("___");
  });

  it("mọi câu ví dụ NGUỒN có đúng một chỗ trống", () => {
    // Nếu một câu có hai "___" thì `.replace` chỉ điền cái đầu và thẻ vẫn lọt
    // qua phép kiểm trên — nên phải canh ở nguồn.
    for (const { source } of cards) {
      expect(source.exampleEn.split("___")).toHaveLength(2);
    }
  });

  it("điền blank_answer chứ không phải word", () => {
    const bienCach = cards.filter(({ source }) => source.blankAnswer !== source.word);
    // Nếu con số này về 0 thì phép kiểm dưới không còn kiểm gì cả. Đo được 183.
    expect(bienCach.length).toBeGreaterThan(100);

    for (const { source, card } of bienCach) {
      expect(card.exampleEn).toBe(source.exampleEn.replace("___", source.blankAnswer));
      expect(card.exampleEn).not.toBe(source.exampleEn.replace("___", source.word));
    }
  });

  it("mọi thẻ có bản dịch tiếng Việt của câu ví dụ", () => {
    for (const { card } of cards) expect(card.exampleVi.trim()).not.toBe("");
  });

  it("mọi thẻ có ít nhất một từ đồng nghĩa", () => {
    // Thẻ hiển thị dòng "Đồng nghĩa: …" không điều kiện; kho rỗng ở đây sẽ ra
    // một dòng cụt trên màn hình.
    for (const { card } of cards) expect(card.synonyms.length).toBeGreaterThan(0);
  });

  it("thẻ KHÔNG mang blankAnswer xuống trình duyệt", () => {
    for (const { card } of cards) {
      expect(Object.keys(card)).not.toContain("blankAnswer");
      // Và không lọt qua đường nào khác: chuỗi đáp án chỉ được xuất hiện bên
      // trong `exampleEn` đã điền, không phải như một trường riêng.
      expect(JSON.stringify(card)).not.toContain('"blankAnswer"');
    }
  });
});
```

- [ ] **Bước 5: Chạy corpus test**

Run: `npx vitest run tests/corpus.test.ts`
Expected: PASS — 7 test. Nếu đỏ ở "điền blank_answer chứ không phải word", dừng
lại: đó chính là loại lỗi tệp này sinh ra để bắt.

- [ ] **Bước 6: Commit**

```bash
git add src/lib/vocab/load-cards.ts tests/load-cards.test.ts tests/corpus.test.ts
git commit -m "feat(2a): doc N tu kem ghi chu, dung lai corpus test tren duong hien thi moi"
```

---

### Task 8: Thẻ từ + deck + `/vocab/learn/[lessonId]`

**Files:**
- Create: `src/components/vocab/word-card.tsx`, `src/components/vocab/deck.tsx`
- Create: `src/app/(app)/vocab/learn/[lessonId]/page.tsx`
- Modify: `e2e/vocab.spec.ts`

**Interfaces:**
- Consumes: `VocabCard`, `loadCards` (Task 7); `groupOf` (Task 4).
- Produces: `<Deck cards initialIndex showExamButton />`;
  `data-testid`: `deck-position`, `card-word`, `card-example`, `prev-button`,
  `next-button`, `exam-button`.

- [ ] **Bước 1: Viết `src/components/vocab/word-card.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import type { VocabCard } from "@/lib/vocab/load-cards";

export function WordCard({ card }: { card: VocabCard }) {
  // Phát hiện sau khi mount, không phải trong lần render đầu: render đầu chạy
  // trên server (window luôn undefined ở đó), nên tính thẳng
  // `"speechSynthesis" in window` trong thân component cho ra hai kết quả khác
  // nhau giữa HTML server gửi xuống và lần render đầu trên trình duyệt — lệch
  // hydrate.
  const [canSpeak, setCanSpeak] = useState(false);
  useEffect(() => {
    setCanSpeak(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  function speak() {
    if (!canSpeak) return;
    const u = new SpeechSynthesisUtterance(card.word);
    u.lang = "en-US";
    window.speechSynthesis.speak(u);
  }

  return (
    <div className="rounded border border-slate-200 bg-white p-6">
      <div className="flex items-baseline gap-3">
        <span data-testid="card-word" className="text-3xl font-semibold">
          {card.word}
        </span>
        <span className="text-slate-500">{card.ipa}</span>
        {canSpeak && (
          <button onClick={speak} className="text-sm underline" aria-label="Nghe phát âm">
            Nghe
          </button>
        )}
      </div>

      {/* Đồng nghĩa nằm NGAY DƯỚI từ chính, trước cả nghĩa tiếng Việt: gặp từ
          mới thì nhớ theo CỤM từ cùng nghĩa, và các phương án nhiễu ở lát 2b
          cũng lấy từ chính nhóm này. 605/605 từ trong kho đều có ít nhất một
          đồng nghĩa nên không có nhánh rỗng để xử lý. */}
      <p className="mt-1 text-sm text-slate-500">Đồng nghĩa: {card.synonyms.join(", ")}</p>
      <p className="mt-3 text-lg">{card.meaningVi}</p>
      <p className="mt-1 text-slate-600">{card.definitionEn}</p>
      <p data-testid="card-example" className="mt-3 italic text-slate-700">
        {card.exampleEn}
      </p>
      <p className="mt-1 text-sm text-slate-500">{card.exampleVi}</p>
    </div>
  );
}
```

- [ ] **Bước 2: Viết `src/components/vocab/deck.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { VocabCard } from "@/lib/vocab/load-cards";
import { WordCard } from "./word-card";

/**
 * Điều phối N thẻ từ. Toàn bộ dữ liệu đã nằm sẵn trong `cards` từ lần tải
 * trang duy nhất, nên MỌI thao tác ở đây — tới, lui, nhảy, phím mũi tên — là
 * đổi một số nguyên trong state. Không có lời gọi mạng nào trên đường bấm.
 *
 * Dùng chung cho pha học (30 thẻ, có nút "Làm bài") và xem lại (60 thẻ, không
 * có). Đây là ranh giới quan trọng nhất của lát: tách thành hai cây component
 * thì mọi sửa đổi thẻ từ về sau phải làm hai lần và sẽ lệch.
 */
export function Deck({
  cards,
  initialIndex,
  examHref,
}: {
  cards: VocabCard[];
  initialIndex: number;
  /** `null` ở chế độ xem lại — không có bài thi nào để làm. */
  examHref: string | null;
}) {
  const [index, setIndex] = useState(
    // Con trỏ lưu ở server có thể trỏ ra ngoài mảng nếu nội dung buổi đổi.
    // Kẹp lại ở đây thay vì render một thẻ `undefined`.
    Math.min(Math.max(initialIndex, 0), Math.max(cards.length - 1, 0)),
  );

  const go = useCallback(
    (next: number) => {
      setIndex((cur) => {
        const clamped = Math.min(Math.max(next, 0), cards.length - 1);
        return clamped === cur ? cur : clamped;
      });
    },
    [cards.length],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Không cướp phím mũi tên khi người học đang gõ trong ô ghi chú.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) return;
      if (e.key === "ArrowLeft") go(index - 1);
      if (e.key === "ArrowRight") go(index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  const card = cards[index];
  if (!card) return null;

  return (
    <div className="flex flex-col gap-4">
      <p data-testid="deck-position" className="text-sm text-slate-500">
        Từ {index + 1} / {cards.length}
      </p>

      <WordCard key={card.id} card={card} />

      <div className="flex gap-2">
        <button
          data-testid="prev-button"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="flex-1 rounded border border-slate-300 px-4 py-2 disabled:opacity-40"
        >
          ← Từ trước
        </button>
        <button
          data-testid="next-button"
          onClick={() => go(index + 1)}
          disabled={index === cards.length - 1}
          className="flex-1 rounded border border-slate-300 px-4 py-2 disabled:opacity-40"
        >
          Từ sau →
        </button>
        {examHref && (
          <Link
            href={examHref}
            data-testid="exam-button"
            className="flex-1 rounded bg-slate-900 px-4 py-2 text-center text-white"
          >
            LÀM BÀI
          </Link>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Bước 3: Viết trang `src/app/(app)/vocab/learn/[lessonId]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadCards } from "@/lib/vocab/load-cards";
import { groupOf } from "@/lib/curriculum/groups";
import { Deck } from "@/components/vocab/deck";

export default async function LearnPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const id = Number(lessonId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: lesson, error: lessonError } = await supabase
    .from("lessons").select("id, ordinal").eq("id", id).maybeSingle();
  if (lessonError) throw lessonError;
  if (!lesson) notFound();

  // KHÔNG có tấm chắn "buổi này đã mở chưa" như lát 1: 10 nhóm mở hết, gõ
  // thẳng URL của buổi 19 là hành vi hợp lệ, không phải đường tấn công.
  const [cards, cursorRes] = await Promise.all([
    loadCards(supabase, [id], user.id),
    supabase
      .from("lesson_cursor").select("word_index")
      .eq("user_id", user.id).eq("lesson_id", id).maybeSingle(),
  ]);
  if (cursorRes.error) throw cursorRes.error;

  const ordinal = lesson.ordinal as number;

  return (
    <main className="flex flex-col gap-5">
      <h1 data-testid="learn-heading" className="text-2xl font-semibold">
        Nhóm {groupOf(ordinal)} · Buổi {ordinal}
      </h1>
      <Deck
        cards={cards}
        initialIndex={cursorRes.data?.word_index ?? 0}
        examHref={`/vocab/learn/${id}/sap-co`}
      />
    </main>
  );
}
```

- [ ] **Bước 4: Màn "sắp có" cho nút Làm bài**

Tạo `src/app/(app)/vocab/learn/[lessonId]/sap-co/page.tsx`:

```tsx
import Link from "next/link";

/**
 * Chỗ đứng của bài thi 30 câu — lát 2b. Một trang thật thay vì nút chết, để
 * người dùng thử lát 2a biết mình đã đi hết phần học và phần thi chưa có.
 */
export default async function SapCoPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Bài thi sắp có</h1>
      <p className="text-slate-600">
        Phần thi 30 câu trắc nghiệm chọn từ đang được xây ở lát tiếp theo.
      </p>
      <Link href={`/vocab/learn/${lessonId}`} className="underline">
        ← Quay lại buổi học
      </Link>
    </main>
  );
}
```

- [ ] **Bước 5: Thêm e2e cho tới/lui**

Thêm vào `e2e/vocab.spec.ts`:

```ts
test("đi tới rồi lui giữa các thẻ, không gọi mạng lại", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await expect(page.getByTestId("deck-position")).toHaveText("Từ 1 / 30");
  await expect(page.getByTestId("prev-button")).toBeDisabled();

  const tu1 = await page.getByTestId("card-word").textContent();

  await page.getByTestId("next-button").click();
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 2 / 30");
  await expect(page.getByTestId("card-word")).not.toHaveText(tu1!);

  await page.getByTestId("prev-button").click();
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 1 / 30");
  await expect(page.getByTestId("card-word")).toHaveText(tu1!);
});

test("phím mũi tên cũng chuyển thẻ", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 2 / 30");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 1 / 30");
});

test("câu ví dụ đã điền lại, không còn dấu gạch trống", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await expect(page.getByTestId("card-example")).not.toContainText("___");
});
```

- [ ] **Bước 6: Chạy**

```bash
npx tsc --noEmit && npm run build
npx playwright test e2e/vocab.spec.ts
```
Expected: toàn bộ PASS, kể cả kịch bản "vào thẳng nhóm 7" của Task 6.

- [ ] **Bước 7: Commit**

```bash
git add src/components/vocab "src/app/(app)/vocab/learn" e2e/vocab.spec.ts
git commit -m "feat(2a): 30 the tu di toi lui tu do, khong goi mang tren duong bam"
```

---

### Task 9: Cột phụ lục — cố định ở màn rộng, trượt ở màn hẹp

**Files:**
- Create: `src/components/vocab/word-index.tsx`
- Modify: `src/components/vocab/deck.tsx`, `e2e/vocab.spec.ts`

**Interfaces:**
- Consumes: `VocabCard` (Task 7).
- Produces: `<WordIndex cards current onPick />`;
  `data-testid`: `index-toggle`, `word-index`, `index-item` (mang `data-i`).

- [ ] **Bước 1: Viết `src/components/vocab/word-index.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { VocabCard } from "@/lib/vocab/load-cards";

/**
 * Mục lục nhảy nhanh. MỘT component, hai hình dạng:
 *  - từ 1024px (lg) trở lên: cột cố định bên trái, luôn thấy.
 *  - hẹp hơn: nút ☰ mở một ngăn trượt phủ lên thẻ.
 *
 * Không tách thành hai component: hai bản sẽ lệch nhau ngay lần đầu ai đó
 * thêm một cột thông tin vào danh sách.
 *
 * Danh sách hiện TỪ chứ không chỉ số thứ tự: người học quay lại "cái từ về
 * CV", không phải "từ số 7".
 */
export function WordIndex({
  cards,
  current,
  onPick,
}: {
  cards: VocabCard[];
  current: number;
  onPick: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);

  const list = (
    <ol data-testid="word-index" className="flex flex-col gap-0.5">
      {cards.map((c, i) => (
        <li key={c.id}>
          <button
            data-testid="index-item"
            data-i={i}
            aria-current={i === current ? "true" : undefined}
            onClick={() => {
              onPick(i);
              setOpen(false);
            }}
            className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs ${
              i === current ? "bg-slate-200 font-semibold" : "hover:bg-slate-100"
            }`}
          >
            <span className="w-5 shrink-0 text-slate-400">{i + 1}</span>
            <span className="flex-1 truncate">{c.word}</span>
            {/* Dấu ✎ cho biết từ nào mình đã ghi chú — thứ duy nhất phân biệt
                được các từ khi lướt lại một danh sách 60 dòng. */}
            {c.note.trim() !== "" && (
              <span aria-label="đã có ghi chú" className="text-slate-400">✎</span>
            )}
          </button>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <button
        data-testid="index-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="self-start rounded border border-slate-300 px-3 py-1 text-sm lg:hidden"
      >
        ☰ Mục lục
      </button>

      {/* Bản cột cố định — chỉ tồn tại từ lg trở lên. */}
      <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-slate-200 pr-3 lg:block">
        {list}
      </aside>

      {/* Bản ngăn trượt — chỉ dưới lg, và chỉ khi đang mở. */}
      {open && (
        <div className="fixed inset-0 z-10 flex lg:hidden">
          <div className="w-64 overflow-y-auto bg-white p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
              <span>{cards.length} từ</span>
              <button onClick={() => setOpen(false)} aria-label="Đóng mục lục">✕</button>
            </div>
            {list}
          </div>
          <button
            aria-label="Đóng mục lục"
            onClick={() => setOpen(false)}
            className="flex-1 bg-black/25"
          />
        </div>
      )}
    </>
  );
}
```

**Lưu ý cho người thực thi:** `list` được render **hai lần** (cột và ngăn), nên
`data-testid="index-item"` xuất hiện gấp đôi trong DOM. Ở màn hình mặc định của
Playwright (1280px, tức ≥ lg) bản ngăn không tồn tại vì `open` khởi tạo `false`,
nên chỉ có một bản. Test dưới đây dựa vào điều đó; nếu sau này cần test ở màn
hẹp thì phải lọc theo container.

- [ ] **Bước 2: Ghép vào `deck.tsx`**

Trong `Deck`, bọc phần thẻ bằng một hàng ngang và chèn `WordIndex`:

```tsx
import { WordIndex } from "./word-index";
```

Thay khối `return` của `Deck` bằng:

```tsx
  return (
    <div className="flex gap-4">
      <WordIndex cards={cards} current={index} onPick={go} />

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <p data-testid="deck-position" className="text-sm text-slate-500">
          Từ {index + 1} / {cards.length}
        </p>

        <WordCard key={card.id} card={card} />

        <div className="flex gap-2">
          <button
            data-testid="prev-button"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            className="flex-1 rounded border border-slate-300 px-4 py-2 disabled:opacity-40"
          >
            ← Từ trước
          </button>
          <button
            data-testid="next-button"
            onClick={() => go(index + 1)}
            disabled={index === cards.length - 1}
            className="flex-1 rounded border border-slate-300 px-4 py-2 disabled:opacity-40"
          >
            Từ sau →
          </button>
          {examHref && (
            <Link
              href={examHref}
              data-testid="exam-button"
              className="flex-1 rounded bg-slate-900 px-4 py-2 text-center text-white"
            >
              LÀM BÀI
            </Link>
          )}
        </div>
      </div>
    </div>
  );
```

Trang `(app)/layout.tsx` đang giới hạn `max-w-3xl`. Cột phụ lục 224px cộng thẻ
sẽ chật. Nới lên `max-w-5xl`:

```tsx
<div className="mx-auto flex min-h-screen max-w-5xl flex-col p-6">
```

- [ ] **Bước 3: Thêm e2e**

Thêm vào `e2e/vocab.spec.ts`:

```ts
test("mục lục liệt kê 30 từ và nhảy thẳng tới từ được bấm", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await expect(page.getByTestId("index-item")).toHaveCount(30);

  const muc20 = page.getByTestId("index-item").nth(19);
  const chu20 = (await muc20.textContent())!.replace(/^\s*20\s*/, "").trim();

  await muc20.click();
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 20 / 30");
  await expect(page.getByTestId("card-word")).toHaveText(chu20);
});

test("mục lục đánh dấu từ đang xem", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await expect(page.getByTestId("index-item").first()).toHaveAttribute("aria-current", "true");
  await page.getByTestId("next-button").click();
  await expect(page.getByTestId("index-item").nth(1)).toHaveAttribute("aria-current", "true");
});
```

- [ ] **Bước 4: Chạy**

```bash
npx tsc --noEmit && npm run build
npx playwright test e2e/vocab.spec.ts
```
Expected: toàn bộ PASS.

- [ ] **Bước 5: Kiểm bằng mắt ở màn hẹp**

Mở `npm run dev`, thu cửa sổ xuống dưới 1024px. Xác nhận: cột phụ lục biến mất,
nút ☰ hiện ra, bấm thì ngăn trượt phủ lên, bấm một từ thì ngăn đóng và thẻ đổi.
Ghi lại kết quả trong báo cáo.

- [ ] **Bước 6: Commit**

```bash
git add src/components/vocab "src/app/(app)/layout.tsx" e2e/vocab.spec.ts
git commit -m "feat(2a): cot phu luc co dinh o man rong, ngan truot o man hep"
```

---

### Task 10: Ô ghi chú nhiều dòng, tự lưu

**Files:**
- Create: `src/lib/vocab/note.ts`, `src/app/(app)/vocab/actions.ts`,
  `src/components/vocab/note-box.tsx`
- Create: `tests/word-notes-rls.test.ts`
- Modify: `src/components/vocab/word-card.tsx`, `src/components/vocab/deck.tsx`,
  `src/components/vocab/word-index.tsx`, `e2e/vocab.spec.ts`

**Interfaces:**
- Produces: `NOTE_MAX` từ `@/lib/vocab/note`;
  Server Action `saveNote(wordId: number, body: string): Promise<void>` và
  `saveCursor(lessonId: number, wordIndex: number): Promise<void>`;
  `<NoteBox wordId body onChange />`; `data-testid`: `note-box`, `note-status`.
- Đổi: `<WordIndex>` nhận thêm `notes: Record<number, string>`;
  `<WordCard>` nhận thêm `note` và `onNoteChange`.

- [ ] **Bước 1: Viết test RLS trước**

Tạo `tests/word-notes-rls.test.ts`. Bảng mới là đúng chỗ hay quên bật RLS.

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(URL && ANON && SERVICE);

describe.skipIf(!hasEnv)("RLS word_notes va lesson_cursor", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "noop", {
    auth: { persistSession: false },
  });
  let alice: SupabaseClient;
  let bob: SupabaseClient;
  let aliceId = "";
  let bobId = "";
  let wordId = 0;
  let lessonId = 0;

  beforeAll(async () => {
    const mk = async (email: string, name: string) => {
      const { data, error } = await admin.auth.admin.createUser({
        email, password: "notes-pass-1234", email_confirm: true,
        user_metadata: { display_name: name },
      });
      if (error) throw error;
      const c = createClient(URL!, ANON!);
      const signIn = await c.auth.signInWithPassword({ email, password: "notes-pass-1234" });
      if (signIn.error) throw signIn.error;
      return { client: c, id: data.user!.id };
    };
    const a = await mk(`notes-alice-${Date.now()}@test.local`, "Alice");
    const b = await mk(`notes-bob-${Date.now()}@test.local`, "Bob");
    alice = a.client; bob = b.client; aliceId = a.id; bobId = b.id;

    const { data: w } = await admin.from("vocab_words").select("id").eq("ordinal", 1).single();
    wordId = w!.id as number;
    const { data: l } = await admin.from("lessons").select("id").eq("ordinal", 1).single();
    lessonId = l!.id as number;
  });

  afterAll(async () => {
    for (const id of [aliceId, bobId]) {
      if (!id) continue;
      await admin.from("word_notes").delete().eq("user_id", id);
      await admin.from("lesson_cursor").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("Alice ghi được ghi chú của chính mình", async () => {
    const { error } = await alice
      .from("word_notes").insert({ user_id: aliceId, word_id: wordId, body: "của Alice" });
    expect(error).toBeNull();
  });

  it("Bob không đọc được ghi chú của Alice", async () => {
    const { data, error } = await bob.from("word_notes").select("body").eq("user_id", aliceId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("Bob không ghi được ghi chú mang user_id của Alice", async () => {
    const { error } = await bob
      .from("word_notes").insert({ user_id: aliceId, word_id: wordId, body: "giả mạo" });
    expect(error).not.toBeNull();
  });

  it("Bob không sửa được ghi chú của Alice", async () => {
    const { error } = await bob
      .from("word_notes").update({ body: "bị sửa" }).eq("user_id", aliceId);
    expect(error).toBeNull(); // RLS lọc theo DÒNG: không thấy dòng nào để sửa.

    const { data } = await admin
      .from("word_notes").select("body").eq("user_id", aliceId).eq("word_id", wordId).single();
    expect(data!.body).toBe("của Alice");
  });

  it("Bob không đọc được con trỏ của Alice", async () => {
    const ins = await alice
      .from("lesson_cursor").insert({ user_id: aliceId, lesson_id: lessonId, word_index: 7 });
    expect(ins.error).toBeNull();

    const { data } = await bob.from("lesson_cursor").select("word_index").eq("user_id", aliceId);
    expect(data).toEqual([]);
  });
});
```

- [ ] **Bước 2: Chạy test RLS**

Run: `npx vitest run tests/word-notes-rls.test.ts`
Expected: PASS — 5 test. Nếu test "Bob không đọc được" đỏ, RLS chưa bật đúng
trên bảng mới; sửa migration trước khi đi tiếp.

- [ ] **Bước 3: Viết `src/lib/vocab/note.ts`**

```ts
/**
 * Trần độ dài ghi chú, khớp `check (char_length(body) <= 2000)` ở migration 0010.
 *
 * Ở một tệp RIÊNG chứ không nằm trong `(app)/vocab/actions.ts`: trong một tệp
 * `"use server"`, MỌI export đều bị Next biến thành một HTTP endpoint công
 * khai — một hằng số ở đó làm vỡ build. Cùng lý do đã ghi ở đầu
 * `lib/assessment/run.ts` của lát 1.
 */
export const NOTE_MAX = 2000;
```

- [ ] **Bước 4: Viết `src/app/(app)/vocab/actions.ts`**

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { NOTE_MAX } from "@/lib/vocab/note";

/**
 * Lưu ghi chú của người học cho một từ.
 *
 * Vỏ mỏng: chỉ lo phần không kiểm thử được ngoài request Next.js thật — dựng
 * client từ cookie phiên và xác thực. `user_id` LUÔN lấy từ phiên, không bao
 * giờ nhận từ tham số: đây là một endpoint HTTP công khai, ai cũng gọi được
 * với tham số bất kỳ.
 */
export async function saveNote(wordId: number, body: string): Promise<void> {
  if (!Number.isInteger(wordId) || wordId <= 0) throw new Error("wordId không hợp lệ");
  // Cắt ở đây thay vì để database từ chối: người học gõ quá dài thì mất phần
  // thừa còn hơn mất cả ghi chú vì một lỗi 400 lặng lẽ trên đường lưu nền.
  const clipped = body.slice(0, NOTE_MAX);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("chưa đăng nhập");

  const { error } = await supabase
    .from("word_notes")
    .upsert(
      { user_id: user.id, word_id: wordId, body: clipped, updated_at: new Date().toISOString() },
      { onConflict: "user_id,word_id" },
    );
  if (error) throw error;
}

/**
 * Lưu chỗ đang đọc của một buổi. Gọi ở NỀN mỗi lần đổi thẻ — không bao giờ
 * nằm trên đường bấm, nên một lần lỗi chỉ mất chỗ đánh dấu, không chặn gì.
 */
export async function saveCursor(lessonId: number, wordIndex: number): Promise<void> {
  if (!Number.isInteger(lessonId) || lessonId <= 0) throw new Error("lessonId không hợp lệ");
  if (!Number.isInteger(wordIndex) || wordIndex < 0 || wordIndex > 29) {
    throw new Error("wordIndex ngoài biên 0..29");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("chưa đăng nhập");

  const { error } = await supabase
    .from("lesson_cursor")
    .upsert(
      { user_id: user.id, lesson_id: lessonId, word_index: wordIndex, updated_at: new Date().toISOString() },
      { onConflict: "user_id,lesson_id" },
    );
  if (error) throw error;
}
```

- [ ] **Bước 5: Viết `src/components/vocab/note-box.tsx`**

**Ô này KHÔNG giữ chữ của chính nó.** `WordCard` mang `key={card.id}` nên đổi từ
là *tháo* component; nếu chữ nằm trong state ở đây thì quay lại từ cũ sẽ đọc lại
`card.note` — bản tĩnh tải từ server lúc mở trang — và chữ vừa gõ biến mất trên
màn hình dù đã lưu xuống database. Chữ sống ở `Deck` (Bước 6); ô này chỉ lo
**hiển thị và lưu**.

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { saveNote } from "@/app/(app)/vocab/actions";
import { NOTE_MAX } from "@/lib/vocab/note";

const DEBOUNCE_MS = 600;

/**
 * Ô ghi chú nhiều dòng, tự lưu.
 *
 * Ba luật, theo đúng ngân sách tốc độ của lát này:
 *  1. Gõ KHÔNG BAO GIỜ chờ mạng — `onChange` chạy ngay, việc lưu đi sau.
 *  2. Lưu sau 600ms ngừng gõ, VÀ lúc component tháo. Không có vế thứ hai thì
 *     gõ xong bấm "Từ sau →" ngay sẽ mất chữ vừa gõ — hẹn giờ bị huỷ cùng
 *     component.
 *  3. Lỗi lưu hiện ra, không nuốt. Ghi chú là thứ người học tự tay viết; mất
 *     im lặng là mất niềm tin vào cả app.
 */
export function NoteBox({
  wordId,
  body,
  onChange,
}: {
  wordId: number;
  body: string;
  onChange: (next: string) => void;
}) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Ref chứ không state: hàm dọn của `useEffect` đóng băng biến của lần render
  // nó được tạo ra, mà lúc tháo thì cần giá trị MỚI NHẤT.
  const bodyRef = useRef(body);
  const savedRef = useRef(body);

  useEffect(() => {
    bodyRef.current = body;
  }, [body]);

  async function flush() {
    if (bodyRef.current === savedRef.current) return;
    const sending = bodyRef.current;
    setStatus("saving");
    try {
      await saveNote(wordId, sending);
      savedRef.current = sending;
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    if (body === savedRef.current) return;
    const t = setTimeout(() => void flush(), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // `flush` cố tình không nằm trong danh sách phụ thuộc: nó đọc mọi thứ qua
    // ref nên không cần dựng lại hẹn giờ mỗi lần render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, wordId]);

  // Lưu nốt khi rời thẻ. `wordId` không bao giờ đổi trong một lần sống của
  // component (đổi từ là remount vì `key={card.id}`), nên `flush` của lần
  // render đầu vẫn gọi đúng `saveNote` cho đúng từ. `setStatus` sau khi tháo
  // là no-op ở React 19, không cảnh báo.
  useEffect(() => {
    return () => {
      void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-5">
      <label htmlFor={`note-${wordId}`} className="block text-sm font-medium text-slate-700">
        Ghi chú của bạn
      </label>
      <textarea
        id={`note-${wordId}`}
        data-testid="note-box"
        value={body}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        maxLength={NOTE_MAX}
        // Người học gõ cả tiếng Việt lẫn tiếng Anh ở đây, nên KHÔNG tắt
        // autocorrect như ô "gõ lại từ" cũ — đây là chỗ viết tự do.
        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
      />
      <p
        data-testid="note-status"
        aria-live="polite"
        className={`mt-1 text-right text-xs ${status === "error" ? "text-red-600" : "text-slate-400"}`}
      >
        {status === "saving" && "đang lưu…"}
        {status === "saved" && "đã lưu"}
        {status === "error" && "không lưu được — thử gõ lại"}
      </p>
    </div>
  );
}
```

- [ ] **Bước 6: Nâng chữ ghi chú lên `deck.tsx`**

`Deck` không remount khi đổi thẻ, nên nó là chỗ duy nhất giữ được chữ đã sửa
trong suốt một buổi. Thêm vào thân `Deck`:

```tsx
  // Khởi tạo từ bản server gửi xuống, rồi từ đó CHỮ SỐNG Ở ĐÂY. `cards` không
  // bao giờ được đọc lại để lấy ghi chú sau lần khởi tạo này — nó là ảnh chụp
  // lúc mở trang, còn người học thì đang gõ.
  const [notes, setNotes] = useState<Record<number, string>>(() =>
    Object.fromEntries(cards.map((c) => [c.id, c.note])),
  );
```

Truyền xuống thẻ:

```tsx
        <WordCard
          key={card.id}
          card={card}
          note={notes[card.id] ?? ""}
          onNoteChange={(next) => setNotes((n) => ({ ...n, [card.id]: next }))}
        />
```

và xuống mục lục — dấu ✎ phải hiện ngay khi gõ, không đợi tải lại trang:

```tsx
      <WordIndex cards={cards} notes={notes} current={index} onPick={go} />
```

- [ ] **Bước 7: Ghép vào `word-card.tsx` và `word-index.tsx`**

`word-card.tsx` — thêm hai prop và chèn ô ghi chú ngay trước thẻ đóng `</div>`
ngoài cùng:

```tsx
import { NoteBox } from "./note-box";
```
```tsx
  note,
  onNoteChange,
}: {
  card: VocabCard;
  note: string;
  onNoteChange: (next: string) => void;
}) {
```
```tsx
      <NoteBox wordId={card.id} body={note} onChange={onNoteChange} />
```

`word-index.tsx` — nhận thêm `notes` và đọc từ đó thay vì `c.note`:

```tsx
export function WordIndex({
  cards,
  notes,
  current,
  onPick,
}: {
  cards: VocabCard[];
  /** Chữ ghi chú ĐANG SỐNG, không phải `card.note` tĩnh từ server: dấu ✎ phải
      xuất hiện ngay lúc gõ, không đợi tải lại trang. */
  notes: Record<number, string>;
  current: number;
  onPick: (index: number) => void;
}) {
```
```tsx
            {(notes[c.id] ?? "").trim() !== "" && (
              <span aria-label="đã có ghi chú" className="text-slate-400">✎</span>
            )}
```

- [ ] **Bước 8: Thêm e2e**

Thêm vào `e2e/vocab.spec.ts`:

```ts
test("ghi chú nhiều dòng được lưu và còn sau khi tải lại", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  const ghiChu = "resume resume resume\n≠ resume (v) = tiếp tục";
  await page.getByTestId("note-box").fill(ghiChu);
  await expect(page.getByTestId("note-status")).toHaveText("đã lưu");

  await page.reload();
  await expect(page.getByTestId("note-box")).toHaveValue(ghiChu);
});

test("ghi chú theo từng từ, không dùng chung", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await page.getByTestId("note-box").fill("ghi chú của từ 1");
  await expect(page.getByTestId("note-status")).toHaveText("đã lưu");

  await page.getByTestId("next-button").click();
  await expect(page.getByTestId("note-box")).toHaveValue("");

  await page.getByTestId("prev-button").click();
  await expect(page.getByTestId("note-box")).toHaveValue("ghi chú của từ 1");
});

test("mục lục đánh dấu ✎ ngay khi gõ, và còn sau khi tải lại", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await expect(page.getByTestId("index-item").first()).not.toContainText("✎");
  await page.getByTestId("note-box").fill("có ghi chú");

  // Ngay lập tức, không đợi lưu xong: dấu ✎ đọc từ state sống ở Deck.
  await expect(page.getByTestId("index-item").first()).toContainText("✎");
  await expect(page.getByTestId("index-item").nth(1)).not.toContainText("✎");

  await expect(page.getByTestId("note-status")).toHaveText("đã lưu");
  await page.reload();
  await expect(page.getByTestId("index-item").first()).toContainText("✎");
});
```

- [ ] **Bước 9: Chạy**

```bash
npx tsc --noEmit && npm run build
npx vitest run tests/word-notes-rls.test.ts
npx playwright test e2e/vocab.spec.ts
```
Expected: tất cả PASS. Kịch bản "ghi chú theo từng từ, không dùng chung" là phép
kiểm quyết định của Bước 6: nếu chữ vẫn nằm trong state của `NoteBox` thì bước
"bấm Từ trước → thấy lại chữ cũ" sẽ đỏ.

- [ ] **Bước 10: Commit**

```bash
git add src/lib/vocab/note.ts "src/app/(app)/vocab/actions.ts" src/components/vocab \
        tests/word-notes-rls.test.ts e2e/vocab.spec.ts
git commit -m "feat(2a): o ghi chu nhieu dong tu luu, RLS rieng tung nguoi"
```

---

### Task 11: Con trỏ — vào lại đúng chỗ đang đọc

**Files:**
- Modify: `src/components/vocab/deck.tsx`, `e2e/vocab.spec.ts`

**Interfaces:**
- Consumes: `saveCursor` từ `@/app/(app)/vocab/actions` (Task 10).
- Produces: `<Deck lessonId={number | null} />` — `null` ở chế độ xem lại.

- [ ] **Bước 1: Ghi con trỏ ở nền trong `deck.tsx`**

Thêm prop và một effect:

```tsx
import { saveCursor } from "@/app/(app)/vocab/actions";
```

Thêm vào chữ ký `Deck`:

```tsx
  /** `null` ở chế độ xem lại: 60 từ của một nhóm không thuộc buổi nào để đánh dấu. */
  lessonId: number | null;
```

Và effect này ngay sau `useEffect` bắt phím:

```tsx
  // Ghi chỗ đang đọc Ở NỀN. Không `await` trên đường bấm — đổi thẻ phải xong
  // trong một khung hình, còn việc ghi thì tới lúc nào cũng được.
  //
  // Nuốt lỗi ở đây là CÓ CHỦ ĐÍCH và là chỗ duy nhất trong lát này được phép:
  // mất một dấu trang không đáng để dựng lên một thông báo lỗi giữa lúc học,
  // và lần đổi thẻ kế tiếp sẽ ghi đè lại đúng.
  useEffect(() => {
    if (lessonId === null) return;
    void saveCursor(lessonId, index).catch(() => {});
  }, [lessonId, index]);
```

- [ ] **Bước 2: Truyền `lessonId` từ trang học**

Trong `src/app/(app)/vocab/learn/[lessonId]/page.tsx`, thêm `lessonId={id}` vào `<Deck>`.

- [ ] **Bước 3: Thêm e2e**

```ts
test("rời buổi học rồi vào lại thì đúng chỗ đang đọc", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await page.getByTestId("index-item").nth(11).click();
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 12 / 30");

  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 12 / 30");
});

test("trang từ vựng hiện buổi đang học dở", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");
  await page.getByTestId("next-button").click();
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 2 / 30");

  await page.goto("/vocab");
  const o1 = page.getByTestId("group-row").first().getByTestId("activity").first();
  await expect(o1).toHaveAttribute("data-kind", "dang-hoc");
  await expect(o1).toContainText("từ 2/30");
});
```

- [ ] **Bước 4: Chạy**

```bash
npx tsc --noEmit && npm run build
npx playwright test e2e/vocab.spec.ts
```
Expected: toàn bộ PASS.

- [ ] **Bước 5: Commit**

```bash
git add src/components/vocab/deck.tsx "src/app/(app)/vocab/learn" e2e/vocab.spec.ts
git commit -m "feat(2a): con tro ghi o nen, vao lai dung cho dang doc"
```

---

### Task 12: Nút "Che từ"

**Files:**
- Modify: `src/components/vocab/word-card.tsx`, `src/components/vocab/deck.tsx`,
  `src/app/(app)/vocab/learn/[lessonId]/page.tsx`, `e2e/vocab.spec.ts`

**Thứ tự:** task này thêm một prop **bắt buộc** (`initialHideWord`) vào `Deck`.
Chỉ có một nơi gọi `Deck` lúc này là trang học. Trang `/vocab/browse` (Task 13)
được viết sau và đã truyền sẵn prop này trong mã của nó — không phải sửa lại.

**Interfaces:**
- Produces: `<Deck initialHideWord={boolean} />`; `data-testid`:
  `toggle-hide-word`, `card-word-hidden`.

- [ ] **Bước 1: Đưa công tắc vào `deck.tsx`**

Một công tắc cho cả buổi, không phải cho từng thẻ: 30 thẻ mà bấm che 30 lần thì
không ai dùng. Giữ ở `Deck` vì nó không remount giữa các thẻ, còn `WordCard` thì
có (`key={card.id}`).

Thêm prop:

```tsx
  /** Đọc từ cookie ở Server Component. Phải đến từ server chứ không phải
      localStorage: trình duyệt vẽ HTML của server TRƯỚC khi React hydrate, nên
      quyết định che ở phía client là quyết định muộn hơn một khung hình — và
      khung hình đó chính là lúc từ cần che loé lên. */
  initialHideWord: boolean;
```

Và trong thân:

```tsx
  const [hideWord, setHideWord] = useState(initialHideWord);

  function toggleHideWord() {
    setHideWord((prev) => {
      const next = !prev;
      // Cookie chứ không localStorage, để lần tải trang sau server đã biết mà
      // render đúng ngay từ HTML đầu tiên. `SameSite=Lax` là đủ: đây chỉ là
      // tuỳ chọn hiển thị, không mang gì nhạy cảm.
      document.cookie = `vocab_hide_word=${next ? "1" : "0"}; path=/; max-age=31536000; SameSite=Lax`;
      return next;
    });
  }
```

Truyền xuống — **giữ nguyên hai prop ghi chú đã có từ Task 10**, chỉ thêm hai
prop mới:

```tsx
        <WordCard
          key={card.id}
          card={card}
          note={notes[card.id] ?? ""}
          onNoteChange={(next) => setNotes((n) => ({ ...n, [card.id]: next }))}
          hideWord={hideWord}
          onToggleHideWord={toggleHideWord}
        />
```

- [ ] **Bước 2: Che trong `word-card.tsx`**

Thêm hai prop `hideWord: boolean` và `onToggleHideWord: () => void`. Đổi khối
tiêu đề và câu ví dụ:

```tsx
      <div className="flex items-baseline gap-3">
        {hideWord ? (
          // Khối giữ chỗ rộng theo ĐỘ DÀI TỪ, không phải một chiều rộng cố
          // định: bật/tắt che không được làm cả thẻ nhảy, vì nút bật/tắt nằm
          // ngay trên cùng hàng và layout giật thì bấm trượt.
          <span
            data-testid="card-word-hidden"
            aria-label="Từ đang bị che"
            className="inline-block h-8 rounded bg-slate-200"
            style={{ width: `${Math.max(card.word.length, 4)}ch` }}
          />
        ) : (
          <span data-testid="card-word" className="text-3xl font-semibold">
            {card.word}
          </span>
        )}
        <span className="text-slate-500">{card.ipa}</span>
        {canSpeak && (
          <button onClick={speak} className="text-sm underline" aria-label="Nghe phát âm">
            Nghe
          </button>
        )}
        <button
          data-testid="toggle-hide-word"
          onClick={onToggleHideWord}
          aria-pressed={hideWord}
          className="ml-auto text-sm underline"
        >
          {hideWord ? "Hiện từ" : "Che từ"}
        </button>
      </div>
```

Và câu ví dụ tiếng Anh cũng phải bị che — nó chứa chính từ đã điền vào, tức là
chứa đáp án. Che mỗi từ chính mà để câu ví dụ hiện thì nút này chỉ là trang trí.
Bản dịch tiếng Việt vẫn hiện: đó là gợi ý, không phải đáp án.

```tsx
      {!hideWord && (
        <p data-testid="card-example" className="mt-3 italic text-slate-700">
          {card.exampleEn}
        </p>
      )}
```

- [ ] **Bước 3: Đọc cookie ở trang học**

Trong `src/app/(app)/vocab/learn/[lessonId]/page.tsx`, thêm:

```tsx
import { cookies } from "next/headers";
```
```tsx
  const hideWord = (await cookies()).get("vocab_hide_word")?.value === "1";
```
rồi truyền `initialHideWord={hideWord}` vào `<Deck>`.

- [ ] **Bước 4: Thêm e2e**

```ts
test("che từ giấu cả từ lẫn câu ví dụ, và nhớ qua các thẻ", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await expect(page.getByTestId("card-word")).toBeVisible();
  await page.getByTestId("toggle-hide-word").click();

  await expect(page.getByTestId("card-word")).toHaveCount(0);
  await expect(page.getByTestId("card-word-hidden")).toBeVisible();
  await expect(page.getByTestId("card-example")).toHaveCount(0);

  // Một công tắc cho cả buổi, không phải cho từng thẻ.
  await page.getByTestId("next-button").click();
  await expect(page.getByTestId("card-word-hidden")).toBeVisible();

  // Và server đã biết ngay từ HTML đầu tiên của lần tải sau.
  await page.reload();
  await expect(page.getByTestId("card-word-hidden")).toBeVisible();
});
```

- [ ] **Bước 5: Chạy**

```bash
npx tsc --noEmit && npm run build
npx playwright test e2e/vocab.spec.ts
```
Expected: toàn bộ PASS. Lưu ý kịch bản "câu ví dụ đã điền lại" (Task 8) chạy
trước kịch bản này và không bật che, nên không xung đột.

- [ ] **Bước 6: Commit**

```bash
git add src/components/vocab "src/app/(app)/vocab" e2e/vocab.spec.ts
git commit -m "feat(2a): nut che tu, mot cong tac cho ca buoi, nho qua cookie"
```

---

### Task 13: `/vocab/browse/[groupId]` — xem lại 60 từ

**Files:**
- Create: `src/app/(app)/vocab/browse/[groupId]/page.tsx`
- Modify: `e2e/vocab.spec.ts`

**Interfaces:**
- Consumes: `lessonsOf`, `wordRangeLabel`, `TOTAL_GROUPS` (Task 4);
  `loadCards` (Task 7); `Deck` (Task 8, 11, 12).

- [ ] **Bước 1: Viết trang**

```tsx
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadCards } from "@/lib/vocab/load-cards";
import { lessonsOf, wordRangeLabel, TOTAL_GROUPS } from "@/lib/curriculum/groups";
import { Deck } from "@/components/vocab/deck";

/**
 * Xem lại 60 từ của một nhóm.
 *
 * Dùng ĐÚNG `Deck` của pha học, chỉ khác ba chỗ: 60 thẻ thay vì 30, không có
 * nút "Làm bài", và không ghi `lesson_cursor` (60 từ của một nhóm không thuộc
 * buổi nào để đánh dấu). Ghi chú vẫn sửa được như bình thường.
 *
 * Mở được với nhóm CHƯA HỌC — đó là cả điểm của tính năng này.
 */
export default async function BrowsePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const group = Number(groupId);
  if (!Number.isInteger(group) || group < 1 || group > TOTAL_GROUPS) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ordinals = lessonsOf(group);
  const { data: lessons, error } = await supabase
    .from("lessons").select("id, ordinal").in("ordinal", [...ordinals]);
  if (error) throw error;

  // Sắp theo ordinal chứ không tin thứ tự `.in()` trả về: PostgREST không bảo
  // đảm thứ tự khớp mảng đầu vào, và thứ tự này quyết định 60 thẻ xếp ra sao.
  const ids = [...(lessons ?? [])]
    .sort((a, b) => (a.ordinal as number) - (b.ordinal as number))
    .map((l) => l.id as number);
  if (ids.length !== ordinals.length) notFound();

  const cards = await loadCards(supabase, ids, user.id);
  const hideWord = (await cookies()).get("vocab_hide_word")?.value === "1";

  return (
    <main className="flex flex-col gap-5">
      <h1 data-testid="browse-heading" className="text-2xl font-semibold">
        Xem lại · Nhóm {group} · {wordRangeLabel(group)}
      </h1>
      <Deck
        cards={cards}
        initialIndex={0}
        examHref={null}
        lessonId={null}
        initialHideWord={hideWord}
      />
    </main>
  );
}
```

- [ ] **Bước 2: Thêm e2e**

```ts
test("xem lại 60 từ của một nhóm chưa học", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");

  const nhom5 = page.getByTestId("group-row").filter({ hasText: "NHÓM 5" });
  await nhom5.getByTestId("browse-link").click();
  await page.waitForURL("**/vocab/browse/5");

  await expect(page.getByTestId("browse-heading")).toContainText("Nhóm 5 · từ 241–300");
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 1 / 60");
  await expect(page.getByTestId("index-item")).toHaveCount(60);

  // Không có bài thi ở chế độ xem lại.
  await expect(page.getByTestId("exam-button")).toHaveCount(0);
});

test("xem lại không ghi con trỏ của buổi học", async ({ page }) => {
  await login(page);
  await page.goto("/vocab/browse/1");
  await page.getByTestId("index-item").nth(9).click();
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 10 / 60");

  await page.goto("/vocab");
  await expect(
    page.getByTestId("group-row").first().getByTestId("activity").first(),
  ).toHaveAttribute("data-kind", "chua-lam");
});

test("sửa ghi chú được ngay trong chế độ xem lại", async ({ page }) => {
  await login(page);
  await page.goto("/vocab/browse/1");
  await page.getByTestId("note-box").fill("ghi từ màn xem lại");
  await expect(page.getByTestId("note-status")).toHaveText("đã lưu");

  await page.reload();
  await expect(page.getByTestId("note-box")).toHaveValue("ghi từ màn xem lại");
});

test("nhóm ngoài biên trả 404", async ({ page }) => {
  await login(page);
  const res = await page.goto("/vocab/browse/11");
  expect(res!.status()).toBe(404);
});
```

- [ ] **Bước 3: Chạy**

```bash
npx tsc --noEmit && npm run build
npx playwright test e2e/vocab.spec.ts
```
Expected: toàn bộ PASS.

- [ ] **Bước 4: Commit**

```bash
git add "src/app/(app)/vocab/browse" e2e/vocab.spec.ts
git commit -m "feat(2a): xem lai 60 tu cua mot nhom, mo duoc ca nhom chua hoc"
```

---

### Task 14: Dashboard thật — hai thẻ + dòng "Tiếp tục"

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`
- Create: `src/app/(app)/vocab/loading.tsx`, `src/app/(app)/dashboard/loading.tsx`
- Modify: `e2e/auth.spec.ts`, `e2e/vocab.spec.ts`

**Interfaces:**
- Consumes: `groupStates`, `groupDone`, `nextActivity`, `toAssessmentRow`,
  `toCursorRow` (Task 5); `TOTAL_GROUPS` (Task 4).

**Ghi chú phạm vi:** dải 4 số liệu (từ đã thuộc, điểm trung bình, chuỗi tuần)
thuộc lát **2c** — chúng cần `assessments` và `word_mastery` có dữ liệu, mà lát
2a chưa sinh ra bài thi nào. Ở đây chỉ làm số liệu **suy được thật** từ dữ liệu
đang có: số nhóm hoàn thành và dòng "Tiếp tục".

- [ ] **Bước 1: Thay `src/app/(app)/dashboard/page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TOTAL_GROUPS } from "@/lib/curriculum/groups";
import {
  groupStates, groupDone, nextActivity, toAssessmentRow, toCursorRow,
  type CursorRow,
} from "@/lib/curriculum/progress";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // HAI truy vấn nhỏ, không phải ba cộng một vòng duyệt 35 slot như trước.
  // Không đọc `lessons` ở đây: dashboard chỉ cần ordinal, mà ordinal suy được
  // từ chính `scope` của assessments và từ số học nhóm.
  const [assessmentsRes, cursorsRes] = await Promise.all([
    supabase
      .from("assessments")
      .select("id, type, scope, status, passed, score, parent_id")
      .eq("user_id", user.id)
      .order("id"),
    supabase
      .from("lesson_cursor")
      .select("lesson_id, word_index, lessons(ordinal)")
      .eq("user_id", user.id),
  ]);
  if (assessmentsRes.error) throw assessmentsRes.error;
  if (cursorsRes.error) throw cursorsRes.error;

  const assessments = (assessmentsRes.data ?? []).map(toAssessmentRow);

  // Không có generic Database trên client nên postgrest-js suy luận mọi quan hệ
  // nhúng là mảng dù FK là 1-1. Ép qua `unknown` trước — cùng lý do đã ghi ở
  // load-cards.ts.
  const cursorRows = (cursorsRes.data ?? []) as unknown as {
    lesson_id: number; word_index: number; lessons: { ordinal: number } | null;
  }[];
  const ordinalById = new Map(
    cursorRows.flatMap((r) => (r.lessons ? [[r.lesson_id, r.lessons.ordinal] as const] : [])),
  );
  const cursors = cursorRows
    .map((r) => toCursorRow(r, ordinalById))
    .filter((c): c is CursorRow => c !== null);

  const states = groupStates(assessments, cursors);
  const doneCount = states.filter(groupDone).length;
  const next = nextActivity(states);

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Hôm nay học gì?</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/vocab"
          data-testid="track-vocab"
          className="flex flex-col items-center gap-1 rounded border border-slate-200 bg-white p-8 text-center hover:border-slate-400"
        >
          <span className="text-3xl" aria-hidden>📘</span>
          <span className="font-semibold tracking-wide">TỪ VỰNG</span>
          <span className="text-sm text-slate-600">
            {doneCount}/{TOTAL_GROUPS} nhóm · 605 từ
          </span>
          {/* Gợi ý, KHÔNG phải luật: 10 nhóm vẫn mở hết, bấm thẳng nhóm 7 lúc
              nào cũng được. Dòng này chỉ đỡ cho người học không phải nhớ mình
              đang dở ở đâu. */}
          {next && (
            <span data-testid="continue-hint" className="mt-2 text-xs text-slate-500">
              Tiếp tục: Nhóm {next.group} ·{" "}
              {/* `lessonOrdinal` là số thứ tự TOÀN CỤC — cùng nhãn với trang
                  /vocab và tiêu đề trang học. `null` nghĩa là ô ôn tập. */}
              {next.lessonOrdinal === null ? "Ôn tập" : `Buổi ${next.lessonOrdinal}`}
            </span>
          )}
        </Link>

        <div
          data-testid="track-grammar"
          className="flex flex-col items-center gap-1 rounded border border-slate-200 bg-slate-100 p-8 text-center text-slate-400"
        >
          <span className="text-3xl" aria-hidden>📗</span>
          <span className="font-semibold tracking-wide">NGỮ PHÁP</span>
          <span className="text-sm">20 bài</span>
          {/* Lộ trình ngữ pháp là lát 2c. Thẻ vẫn hiện để hình dạng dashboard
              đúng ngay từ bây giờ, nhưng chưa dẫn đi đâu. */}
          <span className="mt-2 text-xs">Sắp có</span>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Bước 2: Thêm khung chờ cho hai route**

`src/app/(app)/dashboard/loading.tsx`:

```tsx
/**
 * Khung chờ. Không có tệp này thì chuyển trang là một màn trắng cho tới khi
 * Supabase trả lời — trên gói Free ở xa, đó là 150–400ms không có gì trên
 * màn hình.
 */
export default function Loading() {
  return (
    <main className="flex flex-col gap-6">
      <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-40 animate-pulse rounded bg-slate-100" />
        <div className="h-40 animate-pulse rounded bg-slate-100" />
      </div>
    </main>
  );
}
```

`src/app/(app)/vocab/loading.tsx`:

```tsx
export default function Loading() {
  return (
    <main className="flex flex-col gap-5">
      <div className="h-8 w-40 animate-pulse rounded bg-slate-200" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded bg-slate-100" />
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Bước 3: Cập nhật e2e**

Trong `e2e/auth.spec.ts`, thẻ Từ vựng nay là một link thật:

```ts
await expect(page.getByTestId("track-vocab")).toBeVisible();
await expect(page.getByTestId("track-grammar")).toBeVisible();
```

Thêm vào `e2e/vocab.spec.ts`:

```ts
test("dashboard dẫn sang trang từ vựng và gợi ý chỗ tiếp theo", async ({ page }) => {
  await login(page);
  await expect(page.getByTestId("continue-hint")).toHaveText("Tiếp tục: Nhóm 1 · Buổi 1");
  await expect(page.getByTestId("track-vocab")).toContainText("0/10 nhóm");

  await page.getByTestId("track-vocab").click();
  await page.waitForURL("**/vocab");
  await expect(page.getByTestId("group-row")).toHaveCount(10);
});
```

- [ ] **Bước 4: Chạy toàn bộ**

```bash
npx tsc --noEmit
npm run build
npm test
npx playwright test
```
Expected: tất cả xanh. Nếu `e2e/stats.spec.ts` còn kịch bản `test.skip` từ Task 3,
xác nhận lại chúng vẫn skip có chú thích chứ không im lặng biến mất.

- [ ] **Bước 5: Kiểm bằng mắt**

`npm run dev` rồi đi hết một vòng: đăng nhập → dashboard → Từ vựng → nhóm 7 →
buổi 13 → nhảy mục lục → gõ ghi chú → che từ → quay lại → xem lại nhóm 3.
Xác nhận không màn trắng nào kéo dài và không thao tác nào trong buổi học phải
chờ. Ghi lại trong báo cáo.

- [ ] **Bước 6: Commit**

```bash
git add "src/app/(app)" e2e
git commit -m "feat(2a): dashboard hai the va dong tiep tuc, them khung cho hai route"
```

---

## Việc bàn giao cho lát 2b

Ghi lại rõ trong báo cáo cuối lát, vì lát sau phụ thuộc:

1. **`assessment-items-grants.test.ts` đã bị xoá** (Task 3). Nó canh việc
   `is_correct` không rò ra client. Lát 2b phải dựng lại khẳng định đó cùng với
   `exam-runner`.
2. **`e2e/stats.spec.ts` còn kịch bản `test.skip`** — bỏ skip khi bài thi có thật.
3. **Ngưỡng `word_mastery.mastered` chưa định nghĩa lại** (rủi ro 11.1 của spec).
   Bắt buộc làm ở 2b trước khi dashboard hiện số "từ đã thuộc".
4. **`src/lib/exam/distractors.ts` đã sẵn sàng** nhưng chưa ai gọi.
5. **Nút LÀM BÀI đang trỏ `/vocab/learn/[id]/sap-co`** — 2b thay bằng Server
   Action dựng đề rồi chuyển sang `/exam/[id]`, và xoá thư mục `sap-co`.
