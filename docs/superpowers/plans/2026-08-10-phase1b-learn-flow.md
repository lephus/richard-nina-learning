# Kế hoạch triển khai: lát 1b — luồng học `learn/[lessonId]`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Học được trọn một buổi — 3 cụm × 10 từ rồi chốt buổi gồm 10 câu trộn và bài ngữ pháp — với `word_mastery` và `grammar_mastery` nhận số liệu do server xác minh, buổi chuyển `completed` và buổi kế mở khoá trên dashboard.

**Architecture:** Server Component nạp 30 từ và con trỏ tiến độ; cả buổi học là một máy trạng thái ở client. Đáp án (`blank_answer`, `grammar_questions.answer`) không đọc được bằng vai `authenticated`, nên việc chấm nằm trong hai hàm Postgres `SECURITY DEFINER` gọi qua `supabase.rpc()` — bốn lượt gọi cho cả buổi. Hai khối logic khó nhất (sinh câu luyện tập, suy ra bước kế tiếp) là hàm thuần tách khỏi React và database.

**Tech Stack:** Next 16.3 · React 19.2 · Tailwind 4.3 · `@supabase/ssr` 0.12.4 · `@supabase/supabase-js` 2.112 · `react-markdown` 9 · `remark-gfm` 4 · Vitest 2.1 · Playwright 1.62 · Supabase (Postgres + Auth)

**Spec:** [`docs/superpowers/specs/2026-08-10-phase1b-learn-flow-design.md`](../specs/2026-08-10-phase1b-learn-flow-design.md)

## Điều kiện tiên quyết

**Kế hoạch này không chạy được cho tới khi [kế hoạch lát 1a](2026-08-07-phase1a-foundation-auth-dashboard.md) chạy xong.** Tính tới lúc viết, `src/` mới có `src/content/` — chưa có Next.js, chưa có `middleware.ts`, chưa có `(app)/layout.tsx`. Lát 1b dựng thẳng lên những thứ đó.

Cụ thể, kế hoạch này giả định đã có:

| Thứ | Từ đâu |
|---|---|
| `src/lib/supabase/server.ts` — `createClient()` | 1a Task 4 |
| `src/middleware.ts`, `src/app/(app)/layout.tsx`, `error.tsx` | 1a Task 4, 6 |
| `src/lib/curriculum/lesson-status.ts` — `lessonStatuses()` | 1a Task 2 |
| `src/app/(app)/learn/[lessonId]/page.tsx` — trang tạm | 1a Task 6 |
| `supabase/migrations/0005_profile_trigger.sql` | 1a Task 3 |
| `e2e/` + `playwright.config.ts` + `npm run test:e2e` | 1a Task 7 |
| alias `@/*` → `src/*` trong `tsconfig.json` **và** `vitest.config.ts` | 1a Task 1, 2 |

## Global Constraints

- **Mã ứng dụng trong `src/` không được đụng `SUPABASE_SERVICE_ROLE_KEY`.** Khoá đó chỉ dùng ở `scripts/phase0/`, `tests/` và `e2e/` — đều chạy trên máy, không lên Vercel.
- Trên server luôn dùng `supabase.auth.getUser()`, **không bao giờ** `getSession()`.
- **Không bao giờ `select` cột `blank_answer`, `answer`, `explanation`** trong `src/`. Vai `authenticated` không có quyền đọc chúng (`0004_rls.sql:41-48`); mọi tiếp xúc với đáp án đi qua hai hàm RPC của Task 2 và Task 3.
- Mọi hàm `SECURITY DEFINER` phải có `set search_path = public`, phải lấy người dùng từ `auth.uid()` **bên trong hàm** chứ không nhận qua tham số, và phải `revoke execute from public, anon` trước khi `grant execute to authenticated`.
- Giao diện tiếng Việt; nội dung học giữ nguyên tiếng Anh.
- Giữ thuật ngữ tiếng Việt sẵn có: `danh từ`, `tính từ`, `trạng từ`, `mệnh đề quan hệ`.
- Mọi phép chọn mẫu và xáo trộn phải **tất định** — dùng `hashString` + `seededShuffle` của `src/content/shuffle-options.ts`, **không** `Math.random()`, **không** `Date.now()`.
- Không thêm thư viện ngoài `react-markdown` và `remark-gfm` mà kế hoạch này liệt kê.
- Supabase CLI trên máy đang đăng nhập tài khoản khác nên `supabase link` không dùng được. Migration áp bằng Dashboard → SQL Editor (xem `docs/superpowers/PHASE0-HOAN-TAT.md:176`). Project ref: `efouimcmdufsaywudcgx`.

## Bản đồ tệp

| Tệp | Trách nhiệm |
|---|---|
| `supabase/migrations/0006_grading.sql` | Cột `clusters_done`, cột sinh `mastered`, hai hàm chấm điểm |
| `src/content/shuffle-options.ts` | **Sửa**: export thêm `seededShuffle` để lát 1b dùng lại |
| `src/lib/learn/types.ts` | Kiểu dùng chung cho luồng học |
| `src/lib/learn/session-state.ts` | Hàm thuần: con trỏ → bước kế tiếp, dải vị trí của cụm |
| `src/lib/learn/build-practice.ts` | Hàm thuần: 10 từ → câu hỏi bước ② + nhiễu; chọn mẫu tất định |
| `src/lib/supabase/client.ts` | `createBrowserClient` — lát 1a cố ý chưa tạo, giờ mới có người dùng |
| `src/app/(app)/learn/[lessonId]/page.tsx` | **Thay** trang tạm: nạp dữ liệu buổi học |
| `src/components/word-card.tsx` | Thẻ từ + ô gõ lại từ |
| `src/components/learn/learn-session.tsx` | Máy trạng thái client cho cả buổi |
| `src/components/learn/cluster-meet.tsx` | ① GẶP TỪ |
| `src/components/learn/cluster-practice.tsx` | ② LUYỆN |
| `src/components/learn/cluster-confirm.tsx` | ③ CHỐT |
| `src/components/learn/session-final.tsx` | CHỐT BUỔI |
| `tests/session-state.test.ts` | Vitest, hàm thuần |
| `tests/build-practice.test.ts` | Vitest, hàm thuần |
| `tests/grading-rpc.test.ts` | Vitest chạy thật lên Supabase |
| `e2e/learn.spec.ts` | Playwright, luồng học |
| `e2e/admin.ts` | **Sửa**: thêm `resetProgress()` |

**Không tạo `src/lib/assessment/`, `src/lib/grading/`, `src/lib/mastery/`** dù spec tổng thể §6.5 có liệt kê. Ba module đó phục vụ ôn tập/kiểm tra/bổ túc — lát 1c và 1d. Dựng khung rỗng bây giờ là tạo mã chết.

---

### Task 1: Migration `0006` — con trỏ tiến độ và cột `mastered` sinh

**Files:**
- Create: `supabase/migrations/0006_grading.sql`
- Test: `tests/grading-rpc.test.ts`

**Interfaces:**
- Consumes: không có
- Produces:
  - `user_lesson_progress.clusters_done smallint not null default 0`, ràng buộc `between 0 and 4`
  - `word_mastery.mastered` thành cột sinh: `generated always as (correct_count - wrong_count >= 3) stored`

- [ ] **Step 1: Kiểm tra điều kiện an toàn trước khi xoá cột**

`mastered` đang là cột thường. Postgres không đổi tại chỗ cột thường thành cột sinh, nên phải `drop` rồi `add` — thao tác **xoá dữ liệu cột**.

```bash
grep -rn "mastered" src/ scripts/ tests/ e2e/ 2>/dev/null
set -a; . ./.env.local; set +a
curl -s "$SUPABASE_URL/rest/v1/word_mastery?select=user_id&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: `grep` không in ra gì, và `curl` trả về `[]`.

**Nếu một trong hai điều kiện không đúng thì DỪNG LẠI**, báo lại cho người dùng. Kế hoạch này dựa trên giả định bảng còn rỗng và không mã nào đọc cột đó; giả định sai thì phải đổi cách làm (giữ cột thường + trigger) chứ không được cứ chạy tiếp.

- [ ] **Step 2: Viết test đỏ**

Tạo `tests/grading-rpc.test.ts`:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(URL && ANON && SERVICE);

// Bỏ qua tường minh khi thiếu env, cùng khuôn với tests/db-integrity.test.ts.
describe.skipIf(!hasEnv)("cham diem qua RPC", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "noop", {
    auth: { persistSession: false },
  });

  let alice: SupabaseClient;
  let aliceId = "";
  let lessonId = 0;

  beforeAll(async () => {
    const email = `grade-alice-${Date.now()}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password: "grade-pass-1234", email_confirm: true,
      user_metadata: { display_name: "Alice cham diem" },
    });
    if (error) throw error;
    aliceId = data.user!.id;

    alice = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await alice.auth.signInWithPassword({ email, password: "grade-pass-1234" });

    const { data: lesson } = await admin
      .from("lessons").select("id").eq("ordinal", 1).single();
    lessonId = lesson!.id as number;
  });

  afterAll(async () => {
    if (aliceId) await admin.auth.admin.deleteUser(aliceId);
  });

  it("clusters_done mac dinh la 0", async () => {
    await admin.from("user_lesson_progress")
      .insert({ user_id: aliceId, lesson_id: lessonId, status: "in_progress" });

    const { data } = await admin.from("user_lesson_progress")
      .select("clusters_done")
      .eq("user_id", aliceId).eq("lesson_id", lessonId).single();

    expect(data?.clusters_done).toBe(0);
    await admin.from("user_lesson_progress")
      .delete().eq("user_id", aliceId).eq("lesson_id", lessonId);
  });

  it("mastered la cot sinh: dung hon sai tu 3 luot tro len thi true", async () => {
    const { data: w } = await admin
      .from("vocab_words").select("id").eq("ordinal", 1).single();
    const wordId = w!.id as number;

    // Ghi thang correct/wrong, KHONG ghi `mastered` — cot sinh khong nhan gia tri.
    await admin.from("word_mastery").insert({
      user_id: aliceId, word_id: wordId, correct_count: 2, wrong_count: 0,
    });
    const { data: a } = await admin.from("word_mastery")
      .select("mastered").eq("user_id", aliceId).eq("word_id", wordId).single();
    expect(a?.mastered).toBe(false);

    await admin.from("word_mastery")
      .update({ correct_count: 4, wrong_count: 1 })
      .eq("user_id", aliceId).eq("word_id", wordId);
    const { data: b } = await admin.from("word_mastery")
      .select("mastered").eq("user_id", aliceId).eq("word_id", wordId).single();
    expect(b?.mastered).toBe(true);

    await admin.from("word_mastery")
      .delete().eq("user_id", aliceId).eq("word_id", wordId);
  });
});
```

- [ ] **Step 3: Chạy test để xác nhận nó đỏ**

Run: `npx vitest run tests/grading-rpc.test.ts`
Expected: FAIL — `column "clusters_done" does not exist`.

- [ ] **Step 4: Viết migration**

Tạo `supabase/migrations/0006_grading.sql`:

```sql
-- Lat 1b: con tro tien do trong mot buoi hoc + luat `mastered`.
-- Hai ham cham diem duoc them o cuoi file nay o Task 2 va Task 3.

-- 1. Con tro: 0 = chua bat dau, 1..3 = da xong cum n, 4 = xong chot buoi.
alter table user_lesson_progress
  add column clusters_done smallint not null default 0
  check (clusters_done between 0 and 4);

-- 2. `mastered` chuyen thanh cot sinh, de luat "dung nhieu hon sai tu 3 luot
--    tro len" nam dung MOT cho va khong the lech voi du lieu dem.
--    Postgres khong doi tai cho cot thuong thanh cot sinh nen phai drop/add.
--    An toan vi word_mastery con rong va khong ma nao doc cot nay (kiem o Step 1).
alter table word_mastery drop column mastered;
alter table word_mastery
  add column mastered boolean
  generated always as (correct_count - wrong_count >= 3) stored;
```

Dùng hiệu số thay vì `correct_count >= 3 and wrong_count = 0` vì công thức sau khiến một từ lỡ sai một lần thì vĩnh viễn không bao giờ thuộc.

- [ ] **Step 5: Áp migration lên Supabase**

```bash
pbcopy < supabase/migrations/0006_grading.sql
```

Mở https://supabase.com/dashboard/project/efouimcmdufsaywudcgx/sql/new → dán → **Run**.
Expected: *Success. No rows returned*.

- [ ] **Step 6: Chạy test để xác nhận xanh**

Run: `npx vitest run tests/grading-rpc.test.ts`
Expected: PASS — 2 test.

- [ ] **Step 7: Xác nhận không phá bộ test sẵn có**

Run: `npm test`
Expected: toàn bộ xanh. `tests/rls.test.ts` có đụng `word_mastery` nhưng chỉ ghi `correct_count`/`wrong_count`, không ghi `mastered`, nên cột sinh không ảnh hưởng. Nếu nó đỏ với thông báo *"cannot insert into generated column"*, nghĩa là có chỗ đang ghi thẳng `mastered` — sửa chỗ đó, đừng bỏ cột sinh.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0006_grading.sql tests/grading-rpc.test.ts
git commit -m "feat(1b): con tro clusters_done + cot sinh mastered"
```

---

### Task 2: Hàm `submit_cluster`

**Files:**
- Modify: `supabase/migrations/0006_grading.sql` (nối vào cuối)
- Test: `tests/grading-rpc.test.ts:...` (thêm `describe` mới)

**Interfaces:**
- Consumes: `clusters_done` từ Task 1
- Produces:
  - `submit_cluster(p_lesson_id bigint, p_cluster smallint, p_answers jsonb) returns jsonb`
  - `p_answers`: `[{"word_id": 12, "answer": "concerns"}]`
  - Trả về khi chấm: `{"already": false, "clusters_done": 1, "items": [{"word_id": 12, "correct": true, "correct_answer": "concerns"}]}`
  - Trả về khi cụm đã ghi rồi: `{"already": true, "clusters_done": 1, "items": []}`
  - Mã lỗi: `LB001` chưa đăng nhập · `LB002` buổi không tồn tại · `LB003` buổi chưa mở khoá · `LB004` cụm sai thứ tự

- [ ] **Step 1: Viết test đỏ**

Nối vào `tests/grading-rpc.test.ts`, bên trong `describe` đã có, sau hai test của Task 1:

```ts
  // Doc blank_answer bang service role de dung dap an dung cho test.
  async function clusterAnswers(lesson: number, cluster: number) {
    const from = (cluster - 1) * 10 + 1;
    const { data } = await admin
      .from("lesson_words")
      .select("position, vocab_words(id, blank_answer)")
      .eq("lesson_id", lesson)
      .gte("position", from)
      .lte("position", from + 9)
      .order("position");
    return (data ?? []).map((r: any) => ({
      word_id: r.vocab_words.id as number,
      answer: r.vocab_words.blank_answer as string,
    }));
  }

  it("nop cum 1 dung thu tu thi cham va cong word_mastery", async () => {
    const answers = await clusterAnswers(lessonId, 1);
    expect(answers).toHaveLength(10);

    const { data, error } = await alice.rpc("submit_cluster", {
      p_lesson_id: lessonId, p_cluster: 1, p_answers: answers,
    });
    expect(error).toBeNull();
    expect(data.already).toBe(false);
    expect(data.clusters_done).toBe(1);
    expect(data.items).toHaveLength(10);
    expect(data.items.every((i: any) => i.correct)).toBe(true);

    const { data: m } = await admin.from("word_mastery")
      .select("word_id, correct_count, wrong_count")
      .eq("user_id", aliceId);
    expect(m).toHaveLength(10);
    expect(m!.every((r) => r.correct_count === 1 && r.wrong_count === 0)).toBe(true);
  });

  it("nop trung cum 1 thi tra already va KHONG cong doi mastery", async () => {
    const answers = await clusterAnswers(lessonId, 1);
    const { data, error } = await alice.rpc("submit_cluster", {
      p_lesson_id: lessonId, p_cluster: 1, p_answers: answers,
    });
    expect(error).toBeNull();
    expect(data.already).toBe(true);

    const { data: m } = await admin.from("word_mastery")
      .select("correct_count").eq("user_id", aliceId);
    expect(m!.every((r) => r.correct_count === 1)).toBe(true);
  });

  it("nhay coc sang cum 3 thi bi tu choi bang LB004", async () => {
    const answers = await clusterAnswers(lessonId, 3);
    const { error } = await alice.rpc("submit_cluster", {
      p_lesson_id: lessonId, p_cluster: 3, p_answers: answers,
    });
    expect(error?.code).toBe("LB004");
  });

  it("dap an sai thi cong wrong_count, khong cong correct_count", async () => {
    const answers = (await clusterAnswers(lessonId, 2))
      .map((a) => ({ ...a, answer: "chac-chan-sai" }));

    const { data } = await alice.rpc("submit_cluster", {
      p_lesson_id: lessonId, p_cluster: 2, p_answers: answers,
    });
    expect(data.items.every((i: any) => i.correct === false)).toBe(true);

    const ids = answers.map((a) => a.word_id);
    const { data: m } = await admin.from("word_mastery")
      .select("wrong_count").eq("user_id", aliceId).in("word_id", ids);
    expect(m!.every((r) => r.wrong_count === 1)).toBe(true);
  });

  it("tu KHONG thuoc cum thi bi bo qua, khong farm duoc mastery", async () => {
    const outsider = await clusterAnswers(lessonId, 1); // cum 1, nhung nop o cum 3
    const { data } = await alice.rpc("submit_cluster", {
      p_lesson_id: lessonId, p_cluster: 3, p_answers: outsider,
    });
    expect(data.items).toHaveLength(0);
  });

  it("anon khong execute duoc ham", async () => {
    const guest = createClient(URL!, ANON!, { auth: { persistSession: false } });
    const { error } = await guest.rpc("submit_cluster", {
      p_lesson_id: lessonId, p_cluster: 1, p_answers: [],
    });
    expect(error).not.toBeNull();
  });

  it("authenticated VAN khong doc thang duoc blank_answer", async () => {
    const { error } = await alice.from("vocab_words").select("blank_answer").limit(1);
    expect(error).not.toBeNull();
  });
```

Bốn test cuối là phần đáng giá nhất: hàm phải mở **một cửa hẹp**, không được nới quyền cột và không được cho farm mastery bằng từ ngoài cụm.

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

Run: `npx vitest run tests/grading-rpc.test.ts`
Expected: FAIL — `Could not find the function public.submit_cluster`.

- [ ] **Step 3: Nối hàm vào `0006_grading.sql`**

```sql
-- 3. Cham mot cum 10 tu. Doc blank_answer — cot ma vai `authenticated`
--    khong co quyen select — nen bat buoc phai la SECURITY DEFINER.
create or replace function submit_cluster(
  p_lesson_id bigint,
  p_cluster   smallint,
  p_answers   jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_ordinal int;
  v_done    smallint;
  v_items   jsonb;
begin
  if v_user is null then
    raise exception 'chua dang nhap' using errcode = 'LB001';
  end if;
  if p_cluster is null or p_cluster < 1 or p_cluster > 3 then
    raise exception 'so cum phai trong khoang 1..3' using errcode = 'LB004';
  end if;

  select ordinal into v_ordinal from lessons where id = p_lesson_id;
  if v_ordinal is null then
    raise exception 'buoi hoc khong ton tai' using errcode = 'LB002';
  end if;

  -- Buoi da mo khoa chua. Luat toi thieu, co ban sao trong TypeScript —
  -- xem muc 4.3 cua spec, day la lech pha duoc thua nhan co chu y.
  if v_ordinal > 1 and not exists (
    select 1
    from user_lesson_progress ulp
    join lessons l on l.id = ulp.lesson_id
    where ulp.user_id = v_user
      and l.ordinal   = v_ordinal - 1
      and ulp.status  = 'completed'
  ) then
    raise exception 'buoi hoc chua mo khoa' using errcode = 'LB003';
  end if;

  insert into user_lesson_progress (user_id, lesson_id, status)
  values (v_user, p_lesson_id, 'in_progress')
  on conflict (user_id, lesson_id) do nothing;

  -- Khoa dong lai truoc khi doc con tro: hai tab nop cung luc thi tab cham
  -- hon doc duoc gia tri DA cap nhat va roi vao nhanh `already`.
  select clusters_done into v_done
  from user_lesson_progress
  where user_id = v_user and lesson_id = p_lesson_id
  for update;

  if p_cluster <= v_done then
    return jsonb_build_object('already', true, 'clusters_done', v_done,
                              'items', '[]'::jsonb);
  end if;
  if p_cluster > v_done + 1 then
    raise exception 'cum sai thu tu' using errcode = 'LB004';
  end if;

  with submitted as (
    select (e->>'word_id')::bigint    as word_id,
           coalesce(e->>'answer', '') as answer
    from jsonb_array_elements(p_answers) e
  ),
  graded as (
    -- Phep join nay la hang rao chong farm mastery: chi tu NAM DUNG trong
    -- dai vi tri cua cum nay, cua dung buoi nay, moi duoc tinh.
    select s.word_id,
           lower(btrim(s.answer)) = lower(btrim(w.blank_answer)) as correct,
           w.blank_answer
    from submitted s
    join lesson_words lw
      on  lw.lesson_id = p_lesson_id
      and lw.word_id   = s.word_id
      and lw.position between (p_cluster - 1) * 10 + 1 and p_cluster * 10
    join vocab_words w on w.id = s.word_id
  ),
  written as (
    -- CTE sua du lieu luon chay den cung du truy van chinh khong doc no.
    insert into word_mastery (user_id, word_id, correct_count, wrong_count, last_seen_at)
    select v_user, g.word_id,
           case when g.correct then 1 else 0 end,
           case when g.correct then 0 else 1 end,
           now()
    from graded g
    on conflict (user_id, word_id) do update
      set correct_count = word_mastery.correct_count + excluded.correct_count,
          wrong_count   = word_mastery.wrong_count   + excluded.wrong_count,
          last_seen_at  = excluded.last_seen_at
    returning word_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'word_id',        g.word_id,
           'correct',        g.correct,
           'correct_answer', g.blank_answer)), '[]'::jsonb)
  into v_items
  from graded g;

  update user_lesson_progress
     set clusters_done = p_cluster,
         status        = 'in_progress'
   where user_id = v_user and lesson_id = p_lesson_id;

  return jsonb_build_object('already', false, 'clusters_done', p_cluster,
                            'items', v_items);
end;
$$;

revoke execute on function submit_cluster(bigint, smallint, jsonb) from public, anon;
grant  execute on function submit_cluster(bigint, smallint, jsonb) to authenticated;
```

Bốn chi tiết có chủ ý:
- `set search_path = public` — thiếu dòng này, người gọi trỏ `search_path` sang schema của mình và ép hàm chạy trên bảng giả.
- `v_user := auth.uid()` lấy trong thân hàm, **không** nhận qua tham số — tham số hoá danh tính biến hàm định danh thành hàm mạo danh.
- `for update` khoá dòng tiến độ trước khi đọc con trỏ, nếu không hai tab nộp song song cùng thấy `clusters_done` cũ và cộng đôi mastery.
- `revoke ... from public` — Postgres mặc định cấp `execute` cho `public`; không thu hồi thì khách chưa đăng nhập gọi được.

- [ ] **Step 4: Áp phần vừa thêm lên Supabase**

```bash
pbcopy < supabase/migrations/0006_grading.sql
```

Dashboard → SQL Editor → dán → **Run**.
Expected: *Success. No rows returned*. Chạy lại cả file là an toàn: `alter table ... add column` sẽ báo lỗi trùng cột, nên **chỉ dán phần mục 3 trở đi** nếu mục 1–2 đã áp ở Task 1.

- [ ] **Step 5: Chạy test để xác nhận xanh**

Run: `npx vitest run tests/grading-rpc.test.ts`
Expected: PASS — 9 test.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0006_grading.sql tests/grading-rpc.test.ts
git commit -m "feat(1b): ham submit_cluster cham 10 tu va cong word_mastery"
```

---

### Task 3: Hàm `submit_session_final`

**Files:**
- Modify: `supabase/migrations/0006_grading.sql` (nối vào cuối)
- Test: `tests/grading-rpc.test.ts` (thêm test)

**Interfaces:**
- Consumes: `submit_cluster` từ Task 2 (buổi phải có `clusters_done = 3`)
- Produces:
  - `submit_session_final(p_lesson_id bigint, p_vocab jsonb, p_grammar jsonb) returns jsonb`
  - `p_vocab`: `[{"word_id": 12, "answer": "concerns"}]`
  - `p_grammar`: `[{"question_id": 7, "choice": "C"}]`
  - Trả về: `{"already": false, "score": 85, "vocab": [...], "grammar": [{"question_id": 7, "correct": true, "answer": "C", "explanation": "..."}]}`
  - Đặt `clusters_done = 4`, `status = 'completed'`, `completed_at = now()`, `score`
  - Mã lỗi: dùng lại `LB001`–`LB004`; `LB004` khi `clusters_done <> 3`

- [ ] **Step 1: Viết test đỏ**

Nối vào `tests/grading-rpc.test.ts`:

```ts
  it("chua xong 3 cum thi khong chot buoi duoc", async () => {
    // Toi day alice moi xong cum 1 va 2.
    const { error } = await alice.rpc("submit_session_final", {
      p_lesson_id: lessonId, p_vocab: [], p_grammar: [],
    });
    expect(error?.code).toBe("LB004");
  });

  it("chot buoi: cham ca vocab lan grammar, dat completed va ghi score", async () => {
    // Xong not cum 3 truoc.
    await alice.rpc("submit_cluster", {
      p_lesson_id: lessonId, p_cluster: 3,
      p_answers: await clusterAnswers(lessonId, 3),
    });

    const { data: lesson } = await admin
      .from("lessons").select("grammar_lesson_id").eq("id", lessonId).single();
    const { data: qs } = await admin
      .from("grammar_questions")
      .select("id, answer, explanation")
      .eq("lesson_id", lesson!.grammar_lesson_id)
      .order("id")
      .limit(4);

    const vocab = (await clusterAnswers(lessonId, 1)).slice(0, 2);
    // Cau dau tra loi dung, cac cau con lai co tinh tra loi sai.
    const grammar = qs!.map((q, i) => ({
      question_id: q.id,
      choice: i === 0 ? q.answer : (q.answer === "A" ? "B" : "A"),
    }));

    const { data, error } = await alice.rpc("submit_session_final", {
      p_lesson_id: lessonId, p_vocab: vocab, p_grammar: grammar,
    });
    expect(error).toBeNull();
    expect(data.already).toBe(false);
    expect(data.vocab).toHaveLength(2);
    expect(data.grammar).toHaveLength(4);
    expect(data.grammar[0].correct).toBe(true);
    expect(data.grammar[0].explanation).toBe(qs![0]!.explanation);
    expect(data.grammar[1].correct).toBe(false);
    // 2 vocab dung + 1 grammar dung tren tong 6 cau = 50%
    expect(data.score).toBe(50);

    const { data: p } = await admin.from("user_lesson_progress")
      .select("status, clusters_done, score, completed_at")
      .eq("user_id", aliceId).eq("lesson_id", lessonId).single();
    expect(p?.status).toBe("completed");
    expect(p?.clusters_done).toBe(4);
    expect(p?.score).toBe(50);
    expect(p?.completed_at).not.toBeNull();

    const { data: gm } = await admin.from("grammar_mastery")
      .select("correct_count, wrong_count").eq("user_id", aliceId).single();
    expect(gm?.correct_count).toBe(1);
    expect(gm?.wrong_count).toBe(3);
  });

  it("chot buoi lan hai tra already, khong cong doi grammar_mastery", async () => {
    const { data } = await alice.rpc("submit_session_final", {
      p_lesson_id: lessonId, p_vocab: [], p_grammar: [],
    });
    expect(data.already).toBe(true);

    const { data: gm } = await admin.from("grammar_mastery")
      .select("correct_count, wrong_count").eq("user_id", aliceId).single();
    expect(gm?.correct_count).toBe(1);
    expect(gm?.wrong_count).toBe(3);
  });

  it("cau ngu phap cua bai KHAC bi bo qua", async () => {
    // Buoi 1 da completed nen khong nop lai duoc; dung buoi 2 de thu.
    const { data: l2 } = await admin
      .from("lessons").select("id, grammar_lesson_id").eq("ordinal", 2).single();
    for (let c = 1; c <= 3; c++) {
      await alice.rpc("submit_cluster", {
        p_lesson_id: l2!.id, p_cluster: c,
        p_answers: await clusterAnswers(l2!.id as number, c),
      });
    }
    const { data: alien } = await admin
      .from("grammar_questions").select("id")
      .neq("lesson_id", l2!.grammar_lesson_id).limit(3);

    const { data } = await alice.rpc("submit_session_final", {
      p_lesson_id: l2!.id, p_vocab: [],
      p_grammar: alien!.map((q) => ({ question_id: q.id, choice: "A" })),
    });
    expect(data.grammar).toHaveLength(0);
  });
```

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

Run: `npx vitest run tests/grading-rpc.test.ts`
Expected: FAIL — `Could not find the function public.submit_session_final`.

- [ ] **Step 3: Nối hàm vào `0006_grading.sql`**

```sql
-- 4. Chot buoi: cham 10 cau tu vung tron ca 30 tu + cau hoi ngu phap cua bai.
create or replace function submit_session_final(
  p_lesson_id bigint,
  p_vocab     jsonb,
  p_grammar   jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_ordinal  int;
  v_glesson  bigint;
  v_done     smallint;
  v_vocab    jsonb;
  v_grammar  jsonb;
  v_right    int;
  v_total    int;
  v_score    int;
begin
  if v_user is null then
    raise exception 'chua dang nhap' using errcode = 'LB001';
  end if;

  select l.ordinal, l.grammar_lesson_id into v_ordinal, v_glesson
  from lessons l where l.id = p_lesson_id;
  if v_ordinal is null then
    raise exception 'buoi hoc khong ton tai' using errcode = 'LB002';
  end if;

  select clusters_done into v_done
  from user_lesson_progress
  where user_id = v_user and lesson_id = p_lesson_id
  for update;

  if v_done is null then
    raise exception 'chua bat dau buoi hoc' using errcode = 'LB004';
  end if;
  if v_done = 4 then
    return jsonb_build_object('already', true, 'score', null,
                              'vocab', '[]'::jsonb, 'grammar', '[]'::jsonb);
  end if;
  if v_done <> 3 then
    raise exception 'chua xong 3 cum' using errcode = 'LB004';
  end if;

  -- Tu vung: chi tinh tu THUOC buoi nay (bat ky vi tri nao trong 30 tu).
  with submitted as (
    select (e->>'word_id')::bigint    as word_id,
           coalesce(e->>'answer', '') as answer
    from jsonb_array_elements(p_vocab) e
  ),
  graded as (
    select s.word_id,
           lower(btrim(s.answer)) = lower(btrim(w.blank_answer)) as correct,
           w.blank_answer
    from submitted s
    join lesson_words lw on lw.lesson_id = p_lesson_id and lw.word_id = s.word_id
    join vocab_words  w  on w.id = s.word_id
  ),
  written as (
    insert into word_mastery (user_id, word_id, correct_count, wrong_count, last_seen_at)
    select v_user, g.word_id,
           case when g.correct then 1 else 0 end,
           case when g.correct then 0 else 1 end,
           now()
    from graded g
    on conflict (user_id, word_id) do update
      set correct_count = word_mastery.correct_count + excluded.correct_count,
          wrong_count   = word_mastery.wrong_count   + excluded.wrong_count,
          last_seen_at  = excluded.last_seen_at
    returning word_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'word_id',        g.word_id,
           'correct',        g.correct,
           'correct_answer', g.blank_answer)), '[]'::jsonb)
  into v_vocab
  from graded g;

  -- Ngu phap: chi tinh cau THUOC dung bai ngu phap cua buoi nay.
  with submitted as (
    select (e->>'question_id')::bigint as qid,
           upper(coalesce(e->>'choice', '')) as choice
    from jsonb_array_elements(p_grammar) e
  ),
  graded as (
    select s.qid, q.answer, q.explanation, s.choice = q.answer as correct
    from submitted s
    join grammar_questions q on q.id = s.qid and q.lesson_id = v_glesson
  ),
  written as (
    insert into grammar_mastery (user_id, grammar_lesson_id, correct_count, wrong_count)
    select v_user, v_glesson,
           count(*) filter (where g.correct),
           count(*) filter (where not g.correct)
    from graded g
    having count(*) > 0
    on conflict (user_id, grammar_lesson_id) do update
      set correct_count = grammar_mastery.correct_count + excluded.correct_count,
          wrong_count   = grammar_mastery.wrong_count   + excluded.wrong_count
    returning grammar_lesson_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'question_id', g.qid,
           'correct',     g.correct,
           'answer',      g.answer,
           'explanation', g.explanation)), '[]'::jsonb)
  into v_grammar
  from graded g;

  select count(*) filter (where (i->>'correct')::boolean), count(*)
  into v_right, v_total
  from jsonb_array_elements(v_vocab || v_grammar) i;

  v_score := case when v_total = 0 then 0
                  else round(100.0 * v_right / v_total) end;

  update user_lesson_progress
     set clusters_done = 4,
         status        = 'completed',
         score         = v_score,
         completed_at  = now()
   where user_id = v_user and lesson_id = p_lesson_id;

  return jsonb_build_object('already', false, 'score', v_score,
                            'vocab', v_vocab, 'grammar', v_grammar);
end;
$$;

revoke execute on function submit_session_final(bigint, jsonb, jsonb) from public, anon;
grant  execute on function submit_session_final(bigint, jsonb, jsonb) to authenticated;
```

`explanation` chỉ đi ra ngoài **trong kết quả sau khi nộp**, không bao giờ nằm trong dữ liệu tải trang.

`score` lấy mẫu số là số câu **thực sự nộp**, nên về lý thuyết nộp ít câu thì điểm cao. Chấp nhận được vì buổi học không có ngưỡng pass (spec §3, quyết định 3) — `score` ở đây là số liệu để xem lại, không phải cổng chặn. Cổng chặn thật là bài ôn tập ở lát 1c.

- [ ] **Step 4: Áp phần vừa thêm lên Supabase**

```bash
pbcopy < supabase/migrations/0006_grading.sql
```

Dashboard → SQL Editor → dán **phần mục 4** → **Run**.
Expected: *Success. No rows returned*.

- [ ] **Step 5: Chạy test để xác nhận xanh**

Run: `npx vitest run tests/grading-rpc.test.ts`
Expected: PASS — 13 test.

- [ ] **Step 6: Xác nhận không sót tài khoản test**

```bash
set -a; . ./.env.local; set +a
curl -s "$SUPABASE_URL/auth/v1/admin/users?per_page=100" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | grep -o '"email":"[^"]*test.local"' | sort | uniq -c
```

Expected: không in ra gì.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0006_grading.sql tests/grading-rpc.test.ts
git commit -m "feat(1b): ham submit_session_final chot buoi va dat completed"
```

---

### Task 4: Hàm thuần `session-state.ts`

**Files:**
- Create: `src/lib/learn/session-state.ts`
- Test: `tests/session-state.test.ts`

**Interfaces:**
- Consumes: không có
- Produces:
  - `type ClusterNumber = 1 | 2 | 3`
  - `type LearnStep = { kind: "cluster"; cluster: ClusterNumber; phase: "meet" } | { kind: "final" } | { kind: "done" }`
  - `stepFromCursor(clustersDone: number): LearnStep`
  - `clusterRange(cluster: ClusterNumber): { from: number; to: number }` — dải `position` 1-based

- [ ] **Step 1: Viết test đỏ**

Tạo `tests/session-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clusterRange, stepFromCursor } from "@/lib/learn/session-state";

describe("stepFromCursor", () => {
  it("chua bat dau thi vao cum 1", () => {
    expect(stepFromCursor(0)).toEqual({ kind: "cluster", cluster: 1, phase: "meet" });
  });

  it("xong cum 1 thi vao cum 2", () => {
    expect(stepFromCursor(1)).toEqual({ kind: "cluster", cluster: 2, phase: "meet" });
  });

  it("xong cum 3 thi toi chot buoi", () => {
    expect(stepFromCursor(3)).toEqual({ kind: "final" });
  });

  it("xong chot buoi thi la done", () => {
    expect(stepFromCursor(4)).toEqual({ kind: "done" });
  });

  it("du lieu lech duoi khoang thi ve cum 1, khong vang", () => {
    expect(stepFromCursor(-3)).toEqual({ kind: "cluster", cluster: 1, phase: "meet" });
  });

  it("du lieu lech tren khoang thi coi nhu done, khong vang", () => {
    expect(stepFromCursor(99)).toEqual({ kind: "done" });
  });

  it("so le thi lam tron xuong thay vi vang", () => {
    expect(stepFromCursor(1.7)).toEqual({ kind: "cluster", cluster: 2, phase: "meet" });
  });
});

describe("clusterRange", () => {
  it("chia dung 3 dai 10 vi tri, khong chong lan, khong ho", () => {
    expect(clusterRange(1)).toEqual({ from: 1, to: 10 });
    expect(clusterRange(2)).toEqual({ from: 11, to: 20 });
    expect(clusterRange(3)).toEqual({ from: 21, to: 30 });
  });
});
```

Hai test "dữ liệu lệch" là phần quan trọng: `clusters_done` có ràng buộc `check` ở database, nhưng hàm này cũng nhận dữ liệu đã qua mạng và qua JSON, nên nó phải luôn trả về một trạng thái hiển thị được thay vì ném lỗi giữa màn hình học.

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

Run: `npx vitest run tests/session-state.test.ts`
Expected: FAIL — không tìm thấy module `@/lib/learn/session-state`.

- [ ] **Step 3: Viết implementation**

Tạo `src/lib/learn/session-state.ts`:

```ts
export type ClusterNumber = 1 | 2 | 3;

export type LearnStep =
  | { kind: "cluster"; cluster: ClusterNumber; phase: "meet" }
  | { kind: "final" }
  | { kind: "done" };

export const WORDS_PER_CLUSTER = 10;
export const CLUSTER_COUNT = 3;

/**
 * Con trỏ `user_lesson_progress.clusters_done` → bước kế tiếp của buổi học.
 * Không bao giờ ném lỗi: dữ liệu lệch ngoài khoảng 0..4 được kẹp về hai đầu,
 * vì ném lỗi ở đây nghĩa là vỡ màn hình học vì một dòng dữ liệu bất thường.
 */
export function stepFromCursor(clustersDone: number): LearnStep {
  const done = Number.isFinite(clustersDone) ? Math.floor(clustersDone) : 0;
  if (done <= 0) return { kind: "cluster", cluster: 1, phase: "meet" };
  if (done >= CLUSTER_COUNT + 1) return { kind: "done" };
  if (done === CLUSTER_COUNT) return { kind: "final" };
  return { kind: "cluster", cluster: (done + 1) as ClusterNumber, phase: "meet" };
}

/** Dải `lesson_words.position` (1-based) của một cụm. */
export function clusterRange(cluster: ClusterNumber): { from: number; to: number } {
  const to = cluster * WORDS_PER_CLUSTER;
  return { from: to - WORDS_PER_CLUSTER + 1, to };
}
```

- [ ] **Step 4: Chạy test để xác nhận xanh**

Run: `npx vitest run tests/session-state.test.ts`
Expected: PASS — 8 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/learn/session-state.ts tests/session-state.test.ts
git commit -m "feat(1b): ham thuan stepFromCursor va clusterRange"
```

---

### Task 5: Hàm thuần `build-practice.ts`

**Files:**
- Modify: `src/content/shuffle-options.ts` (export thêm `seededShuffle`)
- Create: `src/lib/learn/types.ts`, `src/lib/learn/build-practice.ts`
- Test: `tests/build-practice.test.ts`

**Interfaces:**
- Consumes: `hashString` (đã export sẵn), `seededShuffle` (export mới)
- Produces:
  - `interface PracticeWord { id: number; word: string; pos: PartOfSpeech; meaningVi: string; synonyms: string[] }`
  - `interface PracticeQuestion { kind: "meaning" | "synonym"; wordId: number; prompt: string; options: string[]; answerIndex: number }`
  - `interface MatchPair { wordId: number; word: string; meaningVi: string }`
  - `interface PracticeSet { questions: PracticeQuestion[]; match: MatchPair[] }`
  - `buildPractice(words: PracticeWord[], seed: number): PracticeSet`
  - `pickDeterministic<T>(items: readonly T[], count: number, seed: number): T[]`

- [ ] **Step 1: Export `seededShuffle`**

Sửa `src/content/shuffle-options.ts:35` — đổi đúng một từ khoá:

```ts
/** Xáo trộn Fisher-Yates tất định theo seed. Không sửa mảng gốc, trả về mảng mới. */
export function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
```

Không đụng gì khác trong file. `shuffleQuestionOptions` vẫn dùng nó y như cũ.

- [ ] **Step 2: Viết test đỏ**

Tạo `tests/build-practice.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildPractice,
  pickDeterministic,
  type PracticeWord,
} from "@/lib/learn/build-practice";

const ten: PracticeWord[] = [
  { id: 1,  word: "concern",   pos: "n",   meaningVi: "sự quan tâm", synonyms: ["issue", "matter"] },
  { id: 2,  word: "issue",     pos: "n",   meaningVi: "vấn đề",       synonyms: ["problem"] },
  { id: 3,  word: "matter",    pos: "n",   meaningVi: "chuyện",       synonyms: [] },
  { id: 4,  word: "worry",     pos: "n",   meaningVi: "nỗi lo",       synonyms: ["anxiety"] },
  { id: 5,  word: "achieve",   pos: "v",   meaningVi: "đạt được",     synonyms: ["attain"] },
  { id: 6,  word: "acquire",   pos: "v",   meaningVi: "thu được",     synonyms: ["obtain"] },
  { id: 7,  word: "adapt",     pos: "v",   meaningVi: "thích nghi",   synonyms: ["adjust"] },
  { id: 8,  word: "adequate",  pos: "adj", meaningVi: "đầy đủ",       synonyms: ["sufficient"] },
  { id: 9,  word: "brief",     pos: "adj", meaningVi: "ngắn gọn",     synonyms: ["short"] },
  { id: 10, word: "careful",   pos: "adj", meaningVi: "cẩn thận",     synonyms: ["cautious"] },
];

describe("buildPractice", () => {
  it("sinh mot cau nghia cho moi tu", () => {
    const set = buildPractice(ten, 42);
    const meaning = set.questions.filter((q) => q.kind === "meaning");
    expect(meaning).toHaveLength(10);
    expect(new Set(meaning.map((q) => q.wordId)).size).toBe(10);
  });

  it("dap an luon nam trong options va dung o answerIndex", () => {
    const set = buildPractice(ten, 42);
    for (const q of set.questions) {
      expect(q.options[q.answerIndex]).toBeDefined();
      expect(q.options).toHaveLength(4);
    }
  });

  it("nhieu khong bao gio trung dap an", () => {
    const set = buildPractice(ten, 42);
    for (const q of set.questions) {
      expect(new Set(q.options).size).toBe(q.options.length);
    }
  });

  it("cau nghia uu tien nhieu cung tu loai", () => {
    const set = buildPractice(ten, 42);
    const q = set.questions.find((x) => x.kind === "meaning" && x.wordId === 1)!;
    // 4 danh tu trong bo => du 1 dap an + 3 nhieu cung tu loai.
    const nounMeanings = ten.filter((w) => w.pos === "n").map((w) => w.meaningVi);
    for (const opt of q.options) expect(nounMeanings).toContain(opt);
  });

  it("tu khong co synonyms thi khong sinh cau dang SYN", () => {
    const set = buildPractice(ten, 42);
    const syn = set.questions.filter((q) => q.kind === "synonym");
    expect(syn.map((q) => q.wordId)).not.toContain(3);
    expect(syn).toHaveLength(9);
  });

  it("tat dinh: cung dau vao cho ket qua giong het", () => {
    expect(buildPractice(ten, 42)).toEqual(buildPractice(ten, 42));
  });

  it("seed khac thi thu tu khac", () => {
    expect(buildPractice(ten, 42)).not.toEqual(buildPractice(ten, 7));
  });

  it("match tra du cap cho moi tu", () => {
    const set = buildPractice(ten, 42);
    expect(set.match).toHaveLength(10);
    expect(new Set(set.match.map((m) => m.wordId)).size).toBe(10);
  });

  it("duoi 4 tu thi nem loi ro rang thay vi sinh cau hong", () => {
    expect(() => buildPractice(ten.slice(0, 3), 42)).toThrow(/ít nhất 4 từ/);
  });
});

describe("pickDeterministic", () => {
  it("lay dung so luong yeu cau", () => {
    expect(pickDeterministic([1, 2, 3, 4, 5], 3, 9)).toHaveLength(3);
  });

  it("tat dinh theo seed", () => {
    expect(pickDeterministic([1, 2, 3, 4, 5], 3, 9))
      .toEqual(pickDeterministic([1, 2, 3, 4, 5], 3, 9));
  });

  it("xin nhieu hon so co thi tra ve tat ca", () => {
    expect(pickDeterministic([1, 2], 10, 9)).toHaveLength(2);
  });

  it("khong sua mang goc", () => {
    const src = [1, 2, 3, 4, 5];
    pickDeterministic(src, 3, 9);
    expect(src).toEqual([1, 2, 3, 4, 5]);
  });
});
```

- [ ] **Step 3: Chạy test để xác nhận nó đỏ**

Run: `npx vitest run tests/build-practice.test.ts`
Expected: FAIL — không tìm thấy module `@/lib/learn/build-practice`.

- [ ] **Step 4: Tạo `src/lib/learn/types.ts`**

```ts
import type { PartOfSpeech } from "@content/types";

/** Từ vựng như màn hình học nhìn thấy. KHÔNG có `blankAnswer` — vai
 *  `authenticated` không đọc được cột đó, đáp án chỉ tồn tại trong hàm RPC. */
export interface LearnWord {
  id: number;
  position: number;
  word: string;
  pos: PartOfSpeech;
  ipa: string;
  meaningVi: string;
  synonyms: string[];
  exampleEn: string;
  exampleVi: string;
}

/** Câu hỏi ngữ pháp như màn hình học nhìn thấy. KHÔNG có `answer`, `explanation`. */
export interface LearnGrammarQuestion {
  id: number;
  stem: string;
  options: string[];
}

/** Đầu buổi học, dùng chung giữa `page.tsx`, `LearnSession` và `SessionFinal`.
 *  Để ở đây chứ không ở `learn-session.tsx`: `session-final.tsx` cần kiểu này,
 *  còn `learn-session.tsx` lại nhập `SessionFinal` — đặt sai chỗ là import vòng. */
export interface LessonHead {
  id: number;
  ordinal: number;
  grammarTitle: string;
  grammarContentMd: string;
}

export interface ClusterResultItem {
  word_id: number;
  correct: boolean;
  correct_answer: string;
}

export interface GrammarResultItem {
  question_id: number;
  correct: boolean;
  answer: string;
  explanation: string;
}
```

- [ ] **Step 5: Viết `src/lib/learn/build-practice.ts`**

```ts
import type { PartOfSpeech } from "@content/types";
import { hashString, seededShuffle } from "@content/shuffle-options";

export interface PracticeWord {
  id: number;
  word: string;
  pos: PartOfSpeech;
  meaningVi: string;
  synonyms: string[];
}

export interface PracticeQuestion {
  kind: "meaning" | "synonym";
  wordId: number;
  prompt: string;
  options: string[];
  answerIndex: number;
}

export interface MatchPair {
  wordId: number;
  word: string;
  meaningVi: string;
}

export interface PracticeSet {
  questions: PracticeQuestion[];
  match: MatchPair[];
}

const OPTION_COUNT = 4;

/** Chọn `count` phần tử một cách tất định. Không sửa mảng gốc. */
export function pickDeterministic<T>(
  items: readonly T[],
  count: number,
  seed: number,
): T[] {
  return seededShuffle(items, seed).slice(0, count);
}

/**
 * Lấy 3 phương án nhiễu cho một đáp án. Ưu tiên tuyệt đối các ứng viên
 * CÙNG TỪ LOẠI: nếu nhiễu khác từ loại, người học loại trừ đúng mà không cần
 * biết nghĩa — câu hỏi khi đó đo kỹ năng nhận từ loại chứ không đo từ vựng.
 * Thiếu ứng viên cùng loại mới bù bằng loại khác.
 */
function distractors(
  pool: readonly PracticeWord[],
  target: PracticeWord,
  project: (w: PracticeWord) => string | undefined,
  answer: string,
  seed: number,
): string[] {
  const usable = (list: readonly PracticeWord[]) =>
    list
      .filter((w) => w.id !== target.id)
      .map(project)
      .filter((v): v is string => Boolean(v) && v !== answer);

  const samePos = usable(pool.filter((w) => w.pos === target.pos));
  const otherPos = usable(pool.filter((w) => w.pos !== target.pos));

  const ordered = [
    ...seededShuffle(samePos, seed),
    ...seededShuffle(otherPos, seed + 1),
  ];

  const out: string[] = [];
  for (const v of ordered) {
    if (out.length === OPTION_COUNT - 1) break;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

function assemble(
  kind: PracticeQuestion["kind"],
  word: PracticeWord,
  answer: string,
  pool: readonly PracticeWord[],
  project: (w: PracticeWord) => string | undefined,
  seed: number,
): PracticeQuestion | null {
  const noise = distractors(pool, word, project, answer, seed);
  if (noise.length < OPTION_COUNT - 1) return null;
  const options = seededShuffle([answer, ...noise], seed + 2);
  return {
    kind,
    wordId: word.id,
    prompt: word.word,
    options,
    answerIndex: options.indexOf(answer),
  };
}

/**
 * Dựng bộ câu luyện tập cho bước ② từ chính các từ của cụm — dữ liệu đã có
 * sẵn trên trang nên không tốn thêm truy vấn. Hàm thuần và tất định.
 */
export function buildPractice(words: PracticeWord[], seed: number): PracticeSet {
  if (words.length < OPTION_COUNT) {
    throw new Error(
      `buildPractice cần ít nhất 4 từ để dựng đủ phương án, nhận được ${words.length}`,
    );
  }

  const questions: PracticeQuestion[] = [];

  for (const w of words) {
    const s = seed + hashString(w.word);

    const meaning = assemble("meaning", w, w.meaningVi, words, (x) => x.meaningVi, s);
    if (meaning) questions.push(meaning);

    const syn = w.synonyms[0];
    if (syn !== undefined) {
      const q = assemble("synonym", w, syn, words, (x) => x.word, s + 3);
      if (q) questions.push(q);
    }
  }

  return {
    questions: seededShuffle(questions, seed + 5),
    match: words.map((w) => ({ wordId: w.id, word: w.word, meaningVi: w.meaningVi })),
  };
}
```

- [ ] **Step 6: Chạy test để xác nhận xanh**

Run: `npx vitest run tests/build-practice.test.ts`
Expected: PASS — 13 test.

- [ ] **Step 7: Xác nhận không phá test sẵn có**

Run: `npm test`
Expected: toàn bộ xanh. `tests/shuffle-options.test.ts` không bị ảnh hưởng vì Step 1 chỉ thêm `export`, không đổi hành vi.

- [ ] **Step 8: Commit**

```bash
git add src/content/shuffle-options.ts src/lib/learn/types.ts \
        src/lib/learn/build-practice.ts tests/build-practice.test.ts
git commit -m "feat(1b): ham thuan buildPractice sinh cau luyen tap va nhieu"
```

---

### Task 6: Trang buổi học và bước ① GẶP TỪ

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/components/word-card.tsx`, `src/components/learn/learn-session.tsx`, `src/components/learn/cluster-meet.tsx`
- Modify: `src/app/(app)/learn/[lessonId]/page.tsx` (thay trang tạm), `e2e/admin.ts`
- Test: `e2e/learn.spec.ts`

**Interfaces:**
- Consumes: `stepFromCursor`, `clusterRange` (Task 4); `LearnWord`, `LearnGrammarQuestion` (Task 5)
- Produces:
  - `createClient()` từ `src/lib/supabase/client.ts` — browser client
  - `<WordCard word hidden onToggleHidden? typed onTyped />`
  - `<LearnSession lesson words grammar initialClustersDone />`
  - `resetProgress(admin, userId)` trong `e2e/admin.ts`
  - `data-testid`: `learn-heading` · `word-card` · `word-text` · `word-typing` · `toggle-hidden` · `next-word` · `cluster-label`

**Lưu ý quan trọng:** `e2e/auth.spec.ts` của lát 1a có test *'bấm "Học tiếp" thì tới trang buổi 1'* kiểm tra `getByTestId("learn-heading")` bằng `"Buổi 1"`. Trang mới **phải giữ nguyên** testid và văn bản đó, nếu không là làm đỏ bộ test của lát trước.

- [ ] **Step 1: Cài thư viện markdown**

```bash
npm install react-markdown@^9.0.1 remark-gfm@^4.0.0
```

Cần cho Task 8 (hiển thị `content_md`); cài ngay ở đây để chỉ có một lượt đụng `package.json`. Các file ngữ pháp Phase 0 dùng nhiều bảng so sánh hai cột nên `remark-gfm` là bắt buộc, không phải tuỳ chọn.

- [ ] **Step 2: Thêm `resetProgress` vào `e2e/admin.ts`**

Nối vào cuối file:

```ts
/**
 * Xoá sạch tiến độ học của một người dùng. Bộ E2E dùng chung MỘT tài khoản
 * và `workers: 1`, nên nếu learn.spec.ts để lại buổi 1 ở trạng thái
 * `completed` thì lần chạy sau nó vào thẳng màn hình "done" và test vô nghĩa.
 * Gọi ở `beforeAll` của learn.spec.ts để mỗi lần chạy đều bắt đầu từ số 0.
 */
export async function resetProgress(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  await admin.from("word_mastery").delete().eq("user_id", userId);
  await admin.from("grammar_mastery").delete().eq("user_id", userId);
  await admin.from("user_lesson_progress").delete().eq("user_id", userId);
}

/** Tìm id của tài khoản kiểm thử. */
export async function testUserId(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = data?.users.find((u) => u.email === TEST_EMAIL);
  if (!found) throw new Error(`Khong tim thay tai khoan ${TEST_EMAIL}`);
  return found.id;
}
```

- [ ] **Step 3: Viết test đỏ**

Tạo `e2e/learn.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { adminClient, resetProgress, testUserId } from "./admin";
import { TEST_EMAIL, TEST_PASSWORD } from "./test-user";

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

test.beforeAll(async () => {
  const admin = adminClient();
  await resetProgress(admin, await testUserId(admin));
});

test("buoi 1 mo ra o cum 1, hien 10 the tu", async ({ page }) => {
  await login(page);
  await page.goto("/learn/1");

  await expect(page.getByTestId("learn-heading")).toHaveText("Buổi 1");
  await expect(page.getByTestId("cluster-label")).toHaveText("Cụm 1 / 3");
  await expect(page.getByTestId("word-card")).toHaveCount(1);
});

test("go duoc vao o go lai tu, va chu con nguyen khi quay lai tu truoc", async ({ page }) => {
  await login(page);
  await page.goto("/learn/1");

  await page.getByTestId("word-typing").fill("thu-go-tu-mot");
  await page.getByTestId("next-word").click();
  await page.getByTestId("prev-word").click();

  await expect(page.getByTestId("word-typing")).toHaveValue("thu-go-tu-mot");
});

test("nut che an tu tieng Anh nhung giu IPA va nghia", async ({ page }) => {
  await login(page);
  await page.goto("/learn/1");

  await expect(page.getByTestId("word-text")).toBeVisible();
  await page.getByTestId("toggle-hidden").click();
  await expect(page.getByTestId("word-text")).toBeHidden();
  await expect(page.getByTestId("word-ipa")).toBeVisible();
  await expect(page.getByTestId("word-meaning")).toBeVisible();
});

test("cong tac che duoc nho sau khi tai lai trang", async ({ page }) => {
  await login(page);
  await page.goto("/learn/1");
  await page.getByTestId("toggle-hidden").click();
  await expect(page.getByTestId("word-text")).toBeHidden();

  await page.reload();
  await expect(page.getByTestId("word-text")).toBeHidden();
  // Chu da go thi mat sau khi tai lai — dung nhu thiet ke.
  await expect(page.getByTestId("word-typing")).toHaveValue("");
});
```

- [ ] **Step 4: Chạy test để xác nhận nó đỏ**

Run: `npx playwright test e2e/learn.spec.ts`
Expected: FAIL — `learn-heading` có nhưng `cluster-label` không tồn tại (trang tạm của lát 1a chỉ có dòng chữ).

- [ ] **Step 5: Tạo `src/lib/supabase/client.ts`**

```ts
"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Client Supabase cho trình duyệt. Chỉ dùng để gọi RPC chấm điểm —
 *  mọi việc đọc dữ liệu học đều do Server Component làm. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 6: Tạo `src/components/word-card.tsx`**

```tsx
"use client";

import type { LearnWord } from "@/lib/learn/types";

interface Props {
  word: LearnWord;
  hidden: boolean;
  /** Truyền vào thì thẻ hiện nút che/hiện. Màn hình dạng danh sách không
   *  truyền, mà đặt một công tắc duy nhất ở đầu danh sách. */
  onToggleHidden?: () => void;
  typed: string;
  onTyped: (value: string) => void;
}

export function WordCard({ word, hidden, onToggleHidden, typed, onTyped }: Props) {
  const inputId = `type-${word.id}`;

  return (
    <article
      data-testid="word-card"
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-center justify-between gap-4">
        {hidden ? (
          // Khối giữ chỗ rộng theo độ dài từ để bật/tắt không giật layout.
          <span
            aria-label="Từ đang bị che"
            className="inline-block h-8 rounded bg-slate-200"
            style={{ width: `${Math.max(word.word.length, 4)}ch` }}
          />
        ) : (
          <h2 data-testid="word-text" className="text-3xl font-semibold">
            {word.word}
          </h2>
        )}

        {onToggleHidden && (
          <button
            type="button"
            data-testid="toggle-hidden"
            onClick={onToggleHidden}
            className="rounded border border-slate-300 px-3 py-1 text-sm"
          >
            {hidden ? "Hiện từ" : "Che từ"}
          </button>
        )}
      </div>

      <p data-testid="word-ipa" className="mt-1 text-slate-500">
        {word.ipa} · {word.pos}
      </p>
      <p data-testid="word-meaning" className="mt-2 text-lg">
        {word.meaningVi}
      </p>

      <div className="mt-5">
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
          Gõ lại từ
        </label>
        <input
          id={inputId}
          data-testid="word-typing"
          value={typed}
          onChange={(e) => onTyped(e.target.value)}
          // lang="en" để bàn phím ảo trên điện thoại chuyển sang bố cục tiếng Anh;
          // tắt autocorrect để trình duyệt không tự "sửa" từ tiếng Anh thành từ khác.
          lang="en"
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
      </div>
    </article>
  );
}
```

- [ ] **Step 7: Tạo `src/components/learn/cluster-meet.tsx`**

```tsx
"use client";

import { WordCard } from "@/components/word-card";
import type { LearnWord } from "@/lib/learn/types";

interface Props {
  words: LearnWord[];
  index: number;
  onIndex: (i: number) => void;
  hidden: boolean;
  onToggleHidden: () => void;
  typed: Record<number, string>;
  onTyped: (wordId: number, value: string) => void;
  onDone: () => void;
}

export function ClusterMeet({
  words, index, onIndex, hidden, onToggleHidden, typed, onTyped, onDone,
}: Props) {
  const word = words[index];
  if (!word) return null;
  const isLast = index === words.length - 1;

  return (
    <section>
      <p className="mb-3 text-sm text-slate-500">
        Từ {index + 1} / {words.length}
      </p>

      <WordCard
        word={word}
        hidden={hidden}
        onToggleHidden={onToggleHidden}
        typed={typed[word.id] ?? ""}
        onTyped={(v) => onTyped(word.id, v)}
      />

      <div className="mt-4 flex justify-between">
        <button
          type="button"
          data-testid="prev-word"
          disabled={index === 0}
          onClick={() => onIndex(index - 1)}
          className="rounded border border-slate-300 px-4 py-2 disabled:opacity-40"
        >
          Từ trước
        </button>
        <button
          type="button"
          data-testid={isLast ? "meet-done" : "next-word"}
          onClick={() => (isLast ? onDone() : onIndex(index + 1))}
          className="rounded bg-slate-900 px-4 py-2 text-white"
        >
          {isLast ? "Sang phần luyện tập" : "Từ sau"}
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Tạo `src/components/learn/learn-session.tsx`**

Bước ② và ③ và chốt buổi được nối ở Task 7–9; ở task này chỉ dựng khung và bước ①.

```tsx
"use client";

import { useEffect, useState } from "react";
import { ClusterMeet } from "@/components/learn/cluster-meet";
import {
  clusterRange, stepFromCursor, type ClusterNumber,
} from "@/lib/learn/session-state";
import type {
  LearnGrammarQuestion, LearnWord, LessonHead,
} from "@/lib/learn/types";

const HIDE_KEY = "vocab.hideWord";

interface Props {
  lesson: LessonHead;
  words: LearnWord[];
  grammar: LearnGrammarQuestion[];
  initialClustersDone: number;
}

type Phase = "meet" | "practice" | "confirm" | "final" | "done";

export function LearnSession({ lesson, words, grammar, initialClustersDone }: Props) {
  const start = stepFromCursor(initialClustersDone);
  const [cluster, setCluster] = useState<ClusterNumber>(
    start.kind === "cluster" ? start.cluster : 3,
  );
  const [phase, setPhase] = useState<Phase>(
    start.kind === "cluster" ? "meet" : start.kind === "final" ? "final" : "done",
  );
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [hidden, setHidden] = useState(false);

  // Đọc localStorage trong useEffect chứ không lúc render: server render không
  // có localStorage, đọc lúc render là lỗi hydration.
  useEffect(() => {
    setHidden(window.localStorage.getItem(HIDE_KEY) === "1");
  }, []);

  function toggleHidden() {
    setHidden((prev) => {
      const next = !prev;
      window.localStorage.setItem(HIDE_KEY, next ? "1" : "0");
      return next;
    });
  }

  const { from, to } = clusterRange(cluster);
  const clusterWords = words.filter((w) => w.position >= from && w.position <= to);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 data-testid="learn-heading" className="text-2xl font-bold">
        Buổi {lesson.ordinal}
      </h1>
      <p data-testid="cluster-label" className="mt-1 text-sm text-slate-500">
        Cụm {cluster} / 3
      </p>

      <div className="mt-6">
        {phase === "meet" && (
          <ClusterMeet
            words={clusterWords}
            index={index}
            onIndex={setIndex}
            hidden={hidden}
            onToggleHidden={toggleHidden}
            typed={typed}
            onTyped={(id, v) => setTyped((t) => ({ ...t, [id]: v }))}
            onDone={() => setPhase("practice")}
          />
        )}
        {phase === "done" && (
          <p data-testid="session-done">Buổi này đã hoàn tất.</p>
        )}
      </div>
    </div>
  );
}
```

`grammar` chưa dùng tới ở task này; nó được nối vào ở Task 9. Giữ trong props ngay từ đầu để Task 9 không phải sửa cả chuỗi truyền dữ liệu.

- [ ] **Step 9: Thay trang `learn/[lessonId]/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { LearnSession } from "@/components/learn/learn-session";
import { lessonStatuses } from "@/lib/curriculum/lesson-status";
import { createClient } from "@/lib/supabase/server";
import { pickDeterministic } from "@/lib/learn/build-practice";
import type {
  LearnGrammarQuestion, LearnWord, LessonHead,
} from "@/lib/learn/types";

const MAX_GRAMMAR_QUESTIONS = 25;

export default async function LearnPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const id = Number(lessonId);
  if (!Number.isInteger(id)) redirect("/dashboard");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: lessons }, { data: progress }] = await Promise.all([
    supabase.from("lessons").select("id, ordinal"),
    supabase.from("user_lesson_progress").select("lesson_id, status, clusters_done"),
  ]);

  const statuses = lessonStatuses(lessons ?? [], progress ?? []);
  if (statuses.get(id) === "locked" || statuses.get(id) === undefined) {
    redirect("/dashboard");
  }

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, ordinal, grammar_lessons(id, title, content_md)")
    .eq("id", id)
    .single();
  if (!lesson) redirect("/dashboard");

  const grammarLesson = lesson.grammar_lessons as unknown as {
    id: number; title: string; content_md: string;
  };

  // KHÔNG select `blank_answer` — vai `authenticated` không có quyền đọc cột đó.
  const { data: rows } = await supabase
    .from("lesson_words")
    .select("position, vocab_words(id, word, pos, ipa, meaning_vi, synonyms, example_en, example_vi)")
    .eq("lesson_id", id)
    .order("position");

  const words: LearnWord[] = (rows ?? []).map((r) => {
    const w = r.vocab_words as unknown as {
      id: number; word: string; pos: LearnWord["pos"]; ipa: string;
      meaning_vi: string; synonyms: string[]; example_en: string; example_vi: string;
    };
    return {
      id: w.id, position: r.position as number, word: w.word, pos: w.pos, ipa: w.ipa,
      meaningVi: w.meaning_vi, synonyms: w.synonyms,
      exampleEn: w.example_en, exampleVi: w.example_vi,
    };
  });

  // KHÔNG select `answer` và `explanation` — cùng lý do.
  const { data: qRows } = await supabase
    .from("grammar_questions")
    .select("id, stem, options")
    .eq("lesson_id", grammarLesson.id)
    .order("id");

  const allQuestions: LearnGrammarQuestion[] = (qRows ?? []).map((q) => ({
    id: q.id as number,
    stem: q.stem as string,
    options: q.options as string[],
  }));

  // Trần 25 câu. 19/20 buổi có 20–25 câu nên không cắt gì; riêng buổi 2 có 100
  // câu, phần dôi ra để dành làm kho câu chưa từng gặp cho lát 1c.
  // Hạt giống lấy từ lesson.id nên vào lại buổi 2 luôn ra đúng bộ đó.
  const grammar = pickDeterministic(allQuestions, MAX_GRAMMAR_QUESTIONS, id)
    .sort((a, b) => a.id - b.id);

  const head: LessonHead = {
    id: lesson.id as number,
    ordinal: lesson.ordinal as number,
    grammarTitle: grammarLesson.title,
    grammarContentMd: grammarLesson.content_md,
  };

  const clustersDone =
    (progress ?? []).find((p) => p.lesson_id === id)?.clusters_done ?? 0;

  return (
    <LearnSession
      lesson={head}
      words={words}
      grammar={grammar}
      initialClustersDone={clustersDone}
    />
  );
}
```

- [ ] **Step 10: Chạy E2E để xác nhận xanh**

Run: `npx playwright test e2e/learn.spec.ts`
Expected: PASS — 4 test.

Nếu test đầu nhận `word-card` count 0, nguyên nhân gần như chắc chắn là truy vấn `lesson_words` trả rỗng — kiểm tra xem có lỡ `select` cột `blank_answer` không, vì quyền cấp cột làm cả truy vấn hỏng chứ không chỉ ẩn một cột.

- [ ] **Step 11: Xác nhận không phá bộ E2E của lát 1a**

Run: `npm run test:e2e`
Expected: toàn bộ xanh, kể cả `e2e/auth.spec.ts`. Nếu test *'bấm "Học tiếp" thì tới trang buổi 1'* đỏ, nghĩa là `learn-heading` bị đổi — trả lại đúng testid và văn bản `Buổi 1`.

- [ ] **Step 12: Commit**

```bash
git add src/lib/supabase/client.ts src/components/word-card.tsx \
        src/components/learn src/app/\(app\)/learn e2e/admin.ts e2e/learn.spec.ts \
        package.json package-lock.json
git commit -m "feat(1b): trang buoi hoc + buoc GAP TU voi o go lai tu"
```

---

### Task 7: Bước ② LUYỆN

**Files:**
- Create: `src/components/learn/cluster-practice.tsx`
- Modify: `src/components/learn/learn-session.tsx`
- Test: `e2e/learn.spec.ts` (thêm test)

**Interfaces:**
- Consumes: `buildPractice`, `PracticeSet` (Task 5)
- Produces:
  - `<ClusterPractice words seed onDone />`
  - `data-testid`: `practice-question` · `practice-option` · `practice-feedback` · `practice-next` · `practice-done` · `match-word` · `match-meaning`

Bước ② có **ba dạng** theo spec §6: trắc nghiệm nghĩa · chọn từ đồng nghĩa · ghép nối từ ↔ nghĩa. Hai dạng đầu là trắc nghiệm nên đi chung một vòng; dạng ghép nối có tương tác khác hẳn nên là chặng thứ hai của cùng component.

- [ ] **Step 1: Viết test đỏ**

Nối vào `e2e/learn.spec.ts`:

```ts
test("buoc luyen tap: tra loi thi thay phan hoi ngay", async ({ page }) => {
  await login(page);
  await page.goto("/learn/1");

  // Đi hết 10 thẻ của cụm 1.
  for (let i = 0; i < 9; i++) await page.getByTestId("next-word").click();
  await page.getByTestId("meet-done").click();

  await expect(page.getByTestId("practice-question")).toBeVisible();
  await page.getByTestId("practice-option").first().click();
  await expect(page.getByTestId("practice-feedback")).toBeVisible();
});

test("buoc luyen tap: chang ghep noi khoa lai cap dung", async ({ page }) => {
  await login(page);
  await page.goto("/learn/1");

  for (let i = 0; i < 9; i++) await page.getByTestId("next-word").click();
  await page.getByTestId("meet-done").click();

  // Trả lời hết vòng trắc nghiệm để sang chặng ghép nối.
  for (;;) {
    await page.getByTestId("practice-option").first().click();
    const done = page.getByTestId("practice-done");
    if (await done.isVisible()) { await done.click(); break; }
    await page.getByTestId("practice-next").click();
  }

  await expect(page.getByTestId("match-word")).toHaveCount(10);
  await expect(page.getByTestId("match-meaning")).toHaveCount(10);

  // Ghép đúng cặp đầu: đọc nghĩa từ thuộc tính data-* rồi bấm đúng ô nghĩa.
  // JSON.stringify để bọc giá trị: nghĩa tiếng Việt có dấu phẩy và có thể có
  // dấu nháy, nối chuỗi trần vào selector là hỏng selector.
  const first = page.getByTestId("match-word").first();
  const meaning = await first.getAttribute("data-meaning");
  await first.click();
  await page
    .locator(`[data-testid="match-meaning"][data-meaning=${JSON.stringify(meaning)}]`)
    .click();

  await expect(first).toHaveAttribute("data-state", "matched");
});
```

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

Run: `npx playwright test e2e/learn.spec.ts -g "luyen tap"`
Expected: FAIL — `practice-question` không tồn tại.

- [ ] **Step 3: Tạo `src/components/learn/cluster-practice.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { buildPractice, pickDeterministic } from "@/lib/learn/build-practice";
import type { LearnWord } from "@/lib/learn/types";

interface Props {
  words: LearnWord[];
  seed: number;
  onDone: () => void;
}

export function ClusterPractice({ words, seed, onDone }: Props) {
  const set = useMemo(
    () =>
      buildPractice(
        words.map((w) => ({
          id: w.id, word: w.word, pos: w.pos,
          meaningVi: w.meaningVi, synonyms: w.synonyms,
        })),
        seed,
      ),
    [words, seed],
  );

  const [stage, setStage] = useState<"quiz" | "match">("quiz");
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  if (stage === "match") {
    return <MatchStage pairs={set.match} seed={seed} onDone={onDone} />;
  }

  const q = set.questions[i];
  if (!q) return null;

  const isLast = i === set.questions.length - 1;

  function choose(idx: number) {
    if (picked !== null) return; // đã trả lời rồi thì không đổi
    setPicked(idx);
  }

  function next() {
    setPicked(null);
    if (isLast) setStage("match");
    else setI(i + 1);
  }

  return (
    <section>
      <p className="mb-3 text-sm text-slate-500">
        Câu {i + 1} / {set.questions.length}
      </p>

      <h3 data-testid="practice-question" className="text-xl font-semibold">
        {q.kind === "meaning"
          ? `Nghĩa của “${q.prompt}” là gì?`
          : `Từ nào đồng nghĩa với “${q.prompt}”?`}
      </h3>

      <ul className="mt-4 space-y-2">
        {q.options.map((opt, idx) => {
          const state =
            picked === null ? "idle"
            : idx === q.answerIndex ? "right"
            : idx === picked ? "wrong"
            : "idle";
          return (
            <li key={opt}>
              <button
                type="button"
                data-testid="practice-option"
                data-state={state}
                onClick={() => choose(idx)}
                className={
                  "w-full rounded border px-4 py-2 text-left " +
                  (state === "right" ? "border-green-600 bg-green-50"
                   : state === "wrong" ? "border-red-600 bg-red-50"
                   : "border-slate-300")
                }
              >
                {opt}
              </button>
            </li>
          );
        })}
      </ul>

      {picked !== null && (
        <div className="mt-4">
          <p data-testid="practice-feedback">
            {picked === q.answerIndex
              ? "Đúng."
              : `Chưa đúng. Đáp án: ${q.options[q.answerIndex]}`}
          </p>
          <button
            type="button"
            data-testid={isLast ? "practice-done" : "practice-next"}
            onClick={next}
            className="mt-3 rounded bg-slate-900 px-4 py-2 text-white"
          >
            {isLast ? "Sang phần ghép nối" : "Câu sau"}
          </button>
        </div>
      )}
    </section>
  );
}

interface MatchProps {
  pairs: { wordId: number; word: string; meaningVi: string }[];
  seed: number;
  onDone: () => void;
}

/**
 * Dạng thứ ba của bước ②: ghép từ với nghĩa. Cột nghĩa được xáo trộn tất định
 * để không nằm cùng thứ tự với cột từ — cùng thứ tự thì bài tập vô nghĩa.
 */
function MatchStage({ pairs, seed, onDone }: MatchProps) {
  const meanings = useMemo(
    () => pickDeterministic(pairs, pairs.length, seed + 11),
    [pairs, seed],
  );

  const [selected, setSelected] = useState<number | null>(null);
  const [matched, setMatched] = useState<number[]>([]);
  const [wrong, setWrong] = useState<number | null>(null);

  function pickMeaning(wordId: number) {
    if (selected === null) return;
    if (selected === wordId) {
      setMatched((m) => [...m, wordId]);
      setSelected(null);
      setWrong(null);
    } else {
      setWrong(wordId);
      setSelected(null);
    }
  }

  const allDone = matched.length === pairs.length;

  return (
    <section>
      <h3 className="text-xl font-semibold">Ghép từ với nghĩa</h3>
      <p className="mt-1 text-sm text-slate-500">
        Đã ghép {matched.length} / {pairs.length}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <ul className="space-y-2">
          {pairs.map((p) => {
            const state = matched.includes(p.wordId)
              ? "matched"
              : selected === p.wordId
                ? "selected"
                : "idle";
            return (
              <li key={p.wordId}>
                <button
                  type="button"
                  data-testid="match-word"
                  data-meaning={p.meaningVi}
                  data-state={state}
                  disabled={state === "matched"}
                  onClick={() => setSelected(p.wordId)}
                  className={
                    "w-full rounded border px-3 py-2 text-left " +
                    (state === "matched" ? "border-green-600 bg-green-50"
                     : state === "selected" ? "border-slate-900 bg-slate-100"
                     : "border-slate-300")
                  }
                >
                  {p.word}
                </button>
              </li>
            );
          })}
        </ul>

        <ul className="space-y-2">
          {meanings.map((p) => {
            const state = matched.includes(p.wordId)
              ? "matched"
              : wrong === p.wordId
                ? "wrong"
                : "idle";
            return (
              <li key={p.wordId}>
                <button
                  type="button"
                  data-testid="match-meaning"
                  data-meaning={p.meaningVi}
                  data-state={state}
                  disabled={state === "matched"}
                  onClick={() => pickMeaning(p.wordId)}
                  className={
                    "w-full rounded border px-3 py-2 text-left " +
                    (state === "matched" ? "border-green-600 bg-green-50"
                     : state === "wrong" ? "border-red-600 bg-red-50"
                     : "border-slate-300")
                  }
                >
                  {p.meaningVi}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <button
        type="button"
        data-testid="match-done"
        disabled={!allDone}
        onClick={onDone}
        className="mt-6 rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-40"
      >
        Sang phần chốt
      </button>
    </section>
  );
}
```

Bước này **không gửi gì lên server**. Client tự chấm thì client tự khai được kết quả; `word_mastery` là đầu vào của bài bổ túc ở lát 1d nên chỉ nhận số liệu server đã xác minh.

Cột nghĩa dùng `pickDeterministic(pairs, pairs.length, …)` — lấy hết phần tử nhưng đã xáo trộn, tức là dùng nó như một phép hoán vị tất định chứ không phải phép chọn mẫu.

- [ ] **Step 4: Nối vào `learn-session.tsx`**

Thêm import:

```tsx
import { ClusterPractice } from "@/components/learn/cluster-practice";
```

Thêm nhánh vào khối render, ngay sau nhánh `phase === "meet"`:

```tsx
        {phase === "practice" && (
          <ClusterPractice
            words={clusterWords}
            seed={lesson.id * 100 + cluster}
            onDone={() => setPhase("confirm")}
          />
        )}
```

- [ ] **Step 5: Chạy test để xác nhận xanh**

Run: `npx playwright test e2e/learn.spec.ts -g "luyen tap"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/learn
git commit -m "feat(1b): buoc LUYEN cham tai cho, khong ghi mastery"
```

---

### Task 8: Bước ③ CHỐT và gọi `submit_cluster`

**Files:**
- Create: `src/components/learn/cluster-confirm.tsx`
- Modify: `src/components/learn/learn-session.tsx`
- Test: `e2e/learn.spec.ts` (thêm test)

**Interfaces:**
- Consumes: `submit_cluster` (Task 2); `createClient` (Task 6); `ClusterResultItem` (Task 5)
- Produces:
  - `<ClusterConfirm lessonId cluster words onDone />`
  - `data-testid`: `confirm-blank` · `confirm-submit` · `confirm-result` · `confirm-retry` · `confirm-next`

- [ ] **Step 1: Viết test đỏ**

Nối vào `e2e/learn.spec.ts`:

```ts
async function finishMeetAndPractice(page: Page) {
  for (let i = 0; i < 9; i++) await page.getByTestId("next-word").click();
  await page.getByTestId("meet-done").click();

  // Trả lời hết các câu trắc nghiệm, chọn bừa phương án đầu.
  for (;;) {
    await page.getByTestId("practice-option").first().click();
    const done = page.getByTestId("practice-done");
    if (await done.isVisible()) { await done.click(); break; }
    await page.getByTestId("practice-next").click();
  }

  // Ghép nối cho tới khi hết cặp chưa ghép.
  for (;;) {
    const left = page.locator('[data-testid="match-word"][data-state="idle"]');
    if ((await left.count()) === 0) break;
    const w = left.first();
    const meaning = await w.getAttribute("data-meaning");
    await w.click();
    await page
      .locator(`[data-testid="match-meaning"][data-meaning=${JSON.stringify(meaning)}]`)
      .click();
  }
  await page.getByTestId("match-done").click();
}

test("nop cum 1 xong thi tai lai trang vao thang cum 2", async ({ page }) => {
  const admin = adminClient();
  await resetProgress(admin, await testUserId(admin));

  await login(page);
  await page.goto("/learn/1");
  await finishMeetAndPractice(page);

  await expect(page.getByTestId("confirm-blank")).toHaveCount(10);
  await page.getByTestId("confirm-submit").click();
  await expect(page.getByTestId("confirm-result")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("cluster-label")).toHaveText("Cụm 2 / 3");
});
```

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

Run: `npx playwright test e2e/learn.spec.ts -g "cum 2"`
Expected: FAIL — `confirm-blank` không tồn tại.

- [ ] **Step 3: Tạo `src/components/learn/cluster-confirm.tsx`**

```tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ClusterResultItem, LearnWord } from "@/lib/learn/types";

interface Props {
  lessonId: number;
  cluster: number;
  words: LearnWord[];
  onDone: () => void;
}

type State =
  | { kind: "typing" }
  | { kind: "sending" }
  | { kind: "failed"; message: string }
  | { kind: "graded"; items: ClusterResultItem[] };

export function ClusterConfirm({ lessonId, cluster, words, onDone }: Props) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [state, setState] = useState<State>({ kind: "typing" });

  async function submit() {
    setState({ kind: "sending" });
    const supabase = createClient();
    const { data, error } = await supabase.rpc("submit_cluster", {
      p_lesson_id: lessonId,
      p_cluster: cluster,
      p_answers: words.map((w) => ({ word_id: w.id, answer: answers[w.id] ?? "" })),
    });

    if (error) {
      // LB004 khi cụm đã ghi rồi thì hàm trả `already`, không ném lỗi. Lỗi
      // LB004 thật sự nghĩa là con trỏ ở server đã khác — nạp lại trang là
      // cách đúng, vì trang sẽ tự vào đúng cụm.
      if (error.code === "LB004") { window.location.reload(); return; }
      setState({ kind: "failed", message: "Không gửi được bài. Thử lại nhé." });
      return;
    }

    if (data.already) { onDone(); return; }
    setState({ kind: "graded", items: data.items as ClusterResultItem[] });
  }

  if (state.kind === "graded") {
    const right = state.items.filter((i) => i.correct).length;
    return (
      <section>
        <h3 data-testid="confirm-result" className="text-xl font-semibold">
          Đúng {right} / {state.items.length}
        </h3>
        <ul className="mt-4 space-y-2">
          {state.items.map((it) => {
            const w = words.find((x) => x.id === it.word_id);
            return (
              <li key={it.word_id} className={it.correct ? "text-green-700" : "text-red-700"}>
                {w?.word} → {it.correct_answer}
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          data-testid="confirm-next"
          onClick={onDone}
          className="mt-5 rounded bg-slate-900 px-4 py-2 text-white"
        >
          Tiếp tục
        </button>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-xl font-semibold">Điền từ vào chỗ trống</h3>

      <ol className="mt-4 space-y-4">
        {words.map((w) => (
          <li key={w.id}>
            <p>{w.exampleEn}</p>
            <p className="text-sm text-slate-500">{w.exampleVi}</p>
            <input
              data-testid="confirm-blank"
              aria-label={`Điền từ cho câu của ${w.meaningVi}`}
              value={answers[w.id] ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [w.id]: e.target.value }))}
              lang="en"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </li>
        ))}
      </ol>

      {state.kind === "failed" && (
        <p data-testid="confirm-retry" className="mt-4 text-red-700">
          {state.message}
        </p>
      )}

      <button
        type="button"
        data-testid="confirm-submit"
        disabled={state.kind === "sending"}
        onClick={submit}
        className="mt-5 rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {state.kind === "sending" ? "Đang gửi…" : "Nộp cụm này"}
      </button>
    </section>
  );
}
```

Đáp án nằm trong state của component khi gửi hỏng, nên bấm lại là gửi lại — không rơi khỏi cụm, không mất bài.

- [ ] **Step 4: Nối vào `learn-session.tsx`**

Thêm import:

```tsx
import { ClusterConfirm } from "@/components/learn/cluster-confirm";
```

Thêm nhánh sau nhánh `practice`:

```tsx
        {phase === "confirm" && (
          <ClusterConfirm
            lessonId={lesson.id}
            cluster={cluster}
            words={clusterWords}
            onDone={() => {
              if (cluster === 3) { setPhase("final"); return; }
              setCluster((cluster + 1) as ClusterNumber);
              setIndex(0);
              setPhase("meet");
            }}
          />
        )}
```

- [ ] **Step 5: Chạy test để xác nhận xanh**

Run: `npx playwright test e2e/learn.spec.ts -g "cum 2"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/learn e2e/learn.spec.ts
git commit -m "feat(1b): buoc CHOT nop cum qua submit_cluster"
```

---

### Task 9: CHỐT BUỔI

**Files:**
- Create: `src/components/learn/session-final.tsx`
- Modify: `src/components/learn/learn-session.tsx`
- Test: `e2e/learn.spec.ts` (thêm test)

**Interfaces:**
- Consumes: `submit_session_final` (Task 3); `pickDeterministic` (Task 5)
- Produces:
  - `<SessionFinal lesson words grammar onDone />`
  - `data-testid`: `final-blank` · `grammar-content` · `grammar-option` · `final-submit` · `final-score`

- [ ] **Step 1: Viết test đỏ**

Nối vào `e2e/learn.spec.ts`:

```ts
test("hoc het buoi 1 thi buoi 2 mo khoa tren dashboard", async ({ page }) => {
  const admin = adminClient();
  await resetProgress(admin, await testUserId(admin));

  await login(page);
  await page.goto("/learn/1");

  for (let c = 1; c <= 3; c++) {
    await finishMeetAndPractice(page);
    await page.getByTestId("confirm-submit").click();
    await page.getByTestId("confirm-next").click();
  }

  await expect(page.getByTestId("grammar-content")).toBeVisible();
  await page.getByTestId("final-submit").click();
  await expect(page.getByTestId("final-score")).toBeVisible();

  await page.goto("/dashboard");
  const rows = page.getByTestId("lesson-row");
  await expect(rows.nth(0)).toHaveAttribute("data-status", "completed");
  await expect(rows.nth(1)).toHaveAttribute("data-status", "available");
});
```

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

Run: `npx playwright test e2e/learn.spec.ts -g "mo khoa"`
Expected: FAIL — `grammar-content` không tồn tại.

- [ ] **Step 3: Tạo `src/components/learn/session-final.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { pickDeterministic } from "@/lib/learn/build-practice";
import { createClient } from "@/lib/supabase/client";
import type {
  GrammarResultItem, LearnGrammarQuestion, LearnWord, LessonHead,
} from "@/lib/learn/types";

const FINAL_VOCAB_COUNT = 10;
const LETTERS = ["A", "B", "C", "D"] as const;

interface Props {
  lesson: LessonHead;
  words: LearnWord[];
  grammar: LearnGrammarQuestion[];
  onDone: () => void;
}

export function SessionFinal({ lesson, words, grammar, onDone }: Props) {
  // 10 câu trộn cả 30 từ, chọn tất định theo lesson.id để vào lại vẫn ra đúng bộ đó.
  const picked = useMemo(
    () => pickDeterministic(words, FINAL_VOCAB_COUNT, lesson.id),
    [words, lesson.id],
  );

  const [vocabAnswers, setVocabAnswers] = useState<Record<number, string>>({});
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<
    { score: number; grammar: GrammarResultItem[] } | null
  >(null);

  async function submit() {
    setSending(true);
    setFailed(false);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("submit_session_final", {
      p_lesson_id: lesson.id,
      p_vocab: picked.map((w) => ({ word_id: w.id, answer: vocabAnswers[w.id] ?? "" })),
      p_grammar: grammar
        .filter((q) => choices[q.id] !== undefined)
        .map((q) => ({ question_id: q.id, choice: choices[q.id]! })),
    });
    setSending(false);

    if (error) { setFailed(true); return; }
    if (data.already) { onDone(); return; }
    setResult({
      score: data.score as number,
      grammar: data.grammar as GrammarResultItem[],
    });
  }

  if (result !== null) {
    return (
      <section>
        <h3 data-testid="final-score" className="text-2xl font-semibold">
          Hoàn tất buổi {lesson.ordinal} — {result.score}%
        </h3>

        {/* `explanation` chỉ tồn tại trong kết quả trả về sau khi nộp, không bao
            giờ nằm trong dữ liệu tải trang. Đây là chỗ duy nhất nó xuất hiện. */}
        <ol className="mt-6 space-y-4">
          {result.grammar.map((r) => {
            const q = grammar.find((x) => x.id === r.question_id);
            return (
              <li
                key={r.question_id}
                data-testid="grammar-result"
                className={r.correct ? "text-green-800" : "text-red-800"}
              >
                <p className="font-medium">{q?.stem}</p>
                <p className="text-sm">Đáp án: {r.answer}</p>
                <p className="mt-1 text-sm text-slate-700">{r.explanation}</p>
              </li>
            );
          })}
        </ol>

        <button
          type="button"
          onClick={onDone}
          className="mt-6 rounded bg-slate-900 px-4 py-2 text-white"
        >
          Về dashboard
        </button>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-xl font-semibold">Chốt buổi — điền từ</h3>
      <ol className="mt-4 space-y-4">
        {picked.map((w) => (
          <li key={w.id}>
            <p>{w.exampleEn}</p>
            <input
              data-testid="final-blank"
              aria-label={`Điền từ cho câu của ${w.meaningVi}`}
              value={vocabAnswers[w.id] ?? ""}
              onChange={(e) =>
                setVocabAnswers((a) => ({ ...a, [w.id]: e.target.value }))
              }
              lang="en"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </li>
        ))}
      </ol>

      <h3 className="mt-10 text-xl font-semibold">{lesson.grammarTitle}</h3>
      <div
        data-testid="grammar-content"
        className="prose prose-slate mt-3 max-w-none"
      >
        {/* remark-gfm bắt buộc: các bài ngữ pháp Phase 0 dùng nhiều bảng hai cột. */}
        <Markdown remarkPlugins={[remarkGfm]}>{lesson.grammarContentMd}</Markdown>
      </div>

      <ol className="mt-8 space-y-6">
        {grammar.map((q) => (
          <li key={q.id}>
            <p className="font-medium">{q.stem}</p>
            <ul className="mt-2 space-y-1">
              {q.options.map((opt, idx) => {
                const letter = LETTERS[idx]!;
                return (
                  <li key={opt}>
                    <button
                      type="button"
                      data-testid="grammar-option"
                      data-selected={choices[q.id] === letter}
                      onClick={() => setChoices((c) => ({ ...c, [q.id]: letter }))}
                      className={
                        "w-full rounded border px-3 py-2 text-left " +
                        (choices[q.id] === letter
                          ? "border-slate-900 bg-slate-100"
                          : "border-slate-300")
                      }
                    >
                      {letter}. {opt}
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>

      {failed && (
        <p className="mt-4 text-red-700">Không gửi được bài. Thử lại nhé.</p>
      )}

      <button
        type="button"
        data-testid="final-submit"
        disabled={sending}
        onClick={submit}
        className="mt-8 rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {sending ? "Đang gửi…" : "Nộp bài chốt buổi"}
      </button>
    </section>
  );
}
```

- [ ] **Step 4: Nối vào `learn-session.tsx`**

Thêm import:

```tsx
import { useRouter } from "next/navigation";
import { SessionFinal } from "@/components/learn/session-final";
```

Thêm `const router = useRouter();` ngay sau các `useState`, rồi thêm nhánh:

```tsx
        {phase === "final" && (
          <SessionFinal
            lesson={lesson}
            words={words}
            grammar={grammar}
            onDone={() => router.push("/dashboard")}
          />
        )}
```

- [ ] **Step 5: Chạy test để xác nhận xanh**

Run: `npx playwright test e2e/learn.spec.ts -g "mo khoa"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/learn e2e/learn.spec.ts
git commit -m "feat(1b): CHOT BUOI — 10 cau tron, bai ngu phap, dat completed"
```

---

### Task 10: Rà soát cuối lát

**Files:** không tạo file mới

**Interfaces:**
- Consumes: toàn bộ Task 1–9
- Produces: xác nhận lát 1b xong

- [ ] **Step 1: Toàn bộ unit test**

Run: `npm test`
Expected: xanh hết, gồm cả `tests/grading-rpc.test.ts`, `tests/session-state.test.ts`, `tests/build-practice.test.ts`.

- [ ] **Step 2: Toàn bộ E2E**

Run: `npm run test:e2e`
Expected: xanh hết — 5 test của `auth.spec.ts` cộng 8 test của `learn.spec.ts`.

- [ ] **Step 3: Build production**

Run: `npm run build`
Expected: build xong không lỗi TypeScript.

- [ ] **Step 4: Kiểm tra bằng mắt rằng đáp án không rò ra client**

```bash
npm run build
grep -rn "blank_answer\|explanation" .next/static/chunks/ | head
```

Expected: không in ra gì. Nếu có, nghĩa là ở đâu đó đang `select` cột đáp án — sửa ngay, đó là lỗi bảo mật chứ không phải lỗi hiển thị.

- [ ] **Step 5: Kiểm tra không sót tài khoản kiểm thử**

```bash
set -a; . ./.env.local; set +a
curl -s "$SUPABASE_URL/auth/v1/admin/users?per_page=100" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | grep -o '"email":"[^"]*test.local"' | sort | uniq -c
```

Expected: không in ra gì.

- [ ] **Step 6: Commit nếu còn thay đổi**

```bash
git status --short
git commit -am "chore(1b): ra soat cuoi lat" || true
```

---

## Đối chiếu với spec

| Mục spec | Task |
|---|---|
| §2 Ràng buộc chặn, hướng A `SECURITY DEFINER` | 2, 3 |
| §2.2 Bốn quy tắc bắt buộc của hàm `SECURITY DEFINER` | 2 Step 3, 3 Step 3 |
| §3.1 Chấm điểm qua RPC | 2, 3 |
| §3.2 Ghi mốc theo cụm | 1, 8 |
| §3.3 Hoàn tất buổi không có ngưỡng | 3 |
| §3.4 Ngữ pháp trần 25 câu | 6 Step 9 |
| §3.5 Bước ② không ghi mastery | 7 Step 3 |
| §4.1 Bố cục | 4, 5, 6, 7, 8, 9 |
| §4.2 Chấm theo dữ liệu đọc được | 7 (client), 8 và 9 (RPC) |
| §4.3 Con trỏ, chặn nhảy cóc, nộp trùng vô hại | 1, 2 |
| §5.1 Bốn lượt gọi server mỗi buổi | 8, 9 |
| §5.2 `mastered` là cột sinh | 1 |
| §5.3 Chốt buổi + trần 25 câu tất định | 6 Step 9, 9 Step 3 |
| §6 Nhiễu cùng từ loại, dùng lại `shuffle-options` | 5 |
| §6 Ba dạng câu bước ②: nghĩa · SYN · ghép nối | 5 (dựng dữ liệu), 7 (giao diện) |
| §7 Xử lý lỗi (thử lại, nộp trùng, sai thứ tự, buổi chưa mở khoá) | 8 Step 3, 2 Step 3, 6 Step 9 |
| §8 Kiểm thử: Vitest hàm thuần · test RPC · Playwright | 4, 5 · 2, 3 · 6, 7, 8, 9 |
| §9.5 `content_md` render bảng bằng `remark-gfm` | 6 Step 1, 9 Step 3 |
