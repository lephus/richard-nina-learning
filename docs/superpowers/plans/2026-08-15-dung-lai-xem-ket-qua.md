# Dừng lại xem kết quả: Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trả lời xong một câu thì dừng lại, hiện đúng/sai, đáp án đúng và giải thích; người học bấm Tiếp tục mới sang câu sau — cho cả bốn loại bài thi.

**Architecture:** `recordAnswer` trả thêm đáp án và giải thích **sau** khi CAS đã khoá câu trả lời. Câu ngữ pháp lấy cả hai qua một RPC `security definer` mới, thay cho lời gọi chấm điểm đang có, nên không thêm vòng gọi. `ExamRunner` đứng chờ kết quả thay vì chạy trước, việc này xoá luôn bộ máy theo dõi câu gửi hỏng.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-15-dung-lai-xem-ket-qua-design.md`

## Global Constraints

- Tiếng Việt cho mọi chữ người dùng thấy và mọi chú thích; **đủ dấu** trong `src/` và `tests/`, **không dấu** trong `scripts/`, `supabase/migrations/` và thông điệp commit. Chú thích giải thích **vì sao**.
- Áp dụng cho **cả bốn loại bài thi**: `lesson`, `review`, `remedial`, `grammar`.
- **`assessment_items.payload` vẫn chỉ chứa `prompt`, `options`, `kind`** — không bao giờ chứa đáp án. Khẳng định này đã có test canh; nó phải còn nguyên.
- Đáp án chỉ được trả về **sau** khi CAS `user_answer IS NULL` đã ghi xong.
- Trả lời lại một câu đã trả lời: vẫn trả đáp án về để hiện, nhưng **không** cộng mastery lần hai.
- Giữ nguyên CAS và luật cộng-một-lần cho cả ba dạng câu.
- Không có ESLint; không thêm `eslint-disable`. `params` là `Promise` (Next 16).
- Không chạy `supabase db push`, `supabase link`, `psql`, `npm run phase0:seed`, hay `npm run phase0:grammar-lessons`. Task 1 có một migration — **người dùng dán tay**.
- **Cổng 3000 đang bị một dự án khác chiếm** (trả HTML tiếng Pháp). Chạy e2e phải dựng server của repo này trên cổng trống rồi truyền `PLAYWRIGHT_BASE_URL`.

## Sự thật đã kiểm, dùng làm nền

- `vocab_words.word`, `meaning_vi`, `example_vi` **đã** cấp cho `authenticated`; `blank_answer` thì không, nhưng RPC `answer_for_word` đã có.
- `grammar_questions.explanation` **không** cấp cho `authenticated`, và **chưa có RPC nào** trả nó. Server Action dùng chính client của người dùng nên cũng không đọc được.
- 537 câu ngữ pháp đã có `explanation` tiếng Việt thật trong database.
- Câu "nghĩa → từ" hiện select đúng một cột (`run.ts:512`: `.select("word")`), nên mở rộng thêm cột **không** tốn thêm vòng gọi.

## Cấu trúc tệp

| Tệp | Trách nhiệm |
|---|---|
| `supabase/migrations/0013_dap_an_va_giai_thich.sql` | **Tạo.** RPC trả đáp án + giải thích cho câu ngữ pháp. |
| `tests/giai-thich-rpc.test.ts` | **Tạo.** RPC chạy đúng, và `explanation` vẫn không đọc trực tiếp được. |
| `src/lib/exam/run.ts` | **Sửa.** `KetQuaTraLoi` thêm hai trường; ba nhánh chấm điểm lấy thêm dữ liệu. |
| `tests/exam-phan-hoi.test.ts` | **Tạo.** Tích hợp cho cả ba dạng câu. |
| `src/components/exam/ExamRunner.tsx` | **Sửa.** Bốn trạng thái, bỏ `viTriLoi`. |
| `e2e/exam.spec.ts` | **Sửa.** Viết lại kịch bản "sang câu sau ngay"; thêm hai cú bấm mỗi câu. |
| `e2e/grammar.spec.ts`, `e2e/on-tap.spec.ts` | **Sửa.** Cùng lý do: vòng lặp trả lời tốn thêm một cú bấm. |

---

### Task 1: RPC trả đáp án và giải thích

**Files:**
- Create: `supabase/migrations/0013_dap_an_va_giai_thich.sql`, `tests/giai-thich-rpc.test.ts`

**Interfaces:**
- Produces: RPC `dap_an_va_giai_thich(p_question_id bigint)` trả `table(dap_an text, giai_thich text)`.

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/giai-thich-rpc.test.ts`, khuôn `describe.skipIf(!hasEnv)` như `tests/db-integrity.test.ts`, dùng **client anon đã đăng nhập** (không phải service role — mục đích là kiểm đúng quyền của vai `authenticated`):

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const hasEnv = Boolean(URL && SERVICE && ANON);

describe.skipIf(!hasEnv)("RPC đáp án và giải thích", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "x", {
    auth: { persistSession: false },
  });
  let alice: SupabaseClient;
  let aliceId = "";
  let questionId = 0;

  beforeAll(async () => {
    const email = `giaithich-${Date.now()}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password: "test-pass-1234", email_confirm: true,
    });
    if (error) throw error;
    aliceId = data.user.id;
    const c = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password: "test-pass-1234" });
    alice = c;

    const { data: q } = await admin
      .from("grammar_questions").select("id").order("id").limit(1).single();
    questionId = q!.id as number;
  });

  afterAll(async () => {
    if (aliceId) await admin.auth.admin.deleteUser(aliceId);
  });

  it("trả về đáp án dạng chữ hiển thị và giải thích không rỗng", async () => {
    const { data, error } = await alice.rpc("dap_an_va_giai_thich", {
      p_question_id: questionId,
    });
    expect(error).toBeNull();
    const hang = Array.isArray(data) ? data[0] : data;
    expect(typeof hang.dap_an).toBe("string");
    expect(hang.dap_an.length).toBeGreaterThan(0);
    expect(typeof hang.giai_thich).toBe("string");
    expect(hang.giai_thich.length).toBeGreaterThan(10);
  });

  it("đáp án trả về đúng là một trong bốn phương án của câu đó", async () => {
    const { data } = await alice.rpc("dap_an_va_giai_thich", { p_question_id: questionId });
    const hang = Array.isArray(data) ? data[0] : data;
    const { data: q } = await admin
      .from("grammar_questions").select("options").eq("id", questionId).single();
    expect(q!.options as string[]).toContain(hang.dap_an);
  });

  // Chốt chặn: RPC là đường HỢP LỆ DUY NHẤT. Nếu ai đó "tiện tay" cấp cột
  // `explanation` cho `authenticated`, client đọc thẳng được giải thích TRƯỚC
  // khi trả lời — tức biết luôn đáp án. Test này giữ cho cửa đó đóng.
  it("explanation vẫn KHÔNG đọc trực tiếp được bằng vai authenticated", async () => {
    const { error } = await alice
      .from("grammar_questions").select("explanation").eq("id", questionId);
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó đỏ**

Run: `npm test -- giai-thich-rpc`
Expected: FAIL — RPC chưa tồn tại. Test thứ ba có thể xanh sẵn (quyền cột đã đúng từ trước); hai test đầu phải đỏ.

- [ ] **Step 3: Viết migration**

Tạo `supabase/migrations/0013_dap_an_va_giai_thich.sql`:

```sql
-- Lat "dung lai xem ket qua": sau khi tra loi, nguoi hoc duoc xem dap an dung
-- va giai thich. 537 cau ngu phap DA co san `explanation` tieng Viet.
--
-- Vi sao phai la RPC security definer: `explanation` KHONG nam trong danh sach
-- cot cap cho `authenticated` (0004_rls.sql:47-48, "answer, explanation chi
-- server doc"). Va Server Action KHONG dac quyen hon client — no dung chinh
-- SupabaseClient cua nguoi dung, cung vai `authenticated`, nen no vap dung hang
-- rao cot do. Cap thang cot nay cho authenticated la mo cua cho client doc giai
-- thich TRUOC khi tra loi, tuc biet luon dap an.
--
-- Ham nay THAY `answer_for_question` trong duong cham diem (xem
-- src/lib/exam/run.ts): tra ca hai truong trong MOT luot, nen so vong goi cho
-- cau ngu phap khong doi. `answer_for_question` van giu nguyen, khong drop —
-- no la mot API nho, va bo di la mot thay doi khong lien quan toi lat nay.
--
-- Bieu thuc lay dap an sao nguyen tu `answer_for_question` (0006): cot `answer`
-- luu chu cai A-D, `options` la mang jsonb, nen chi so la ascii(answer) - 65.
create or replace function public.dap_an_va_giai_thich(p_question_id bigint)
returns table(dap_an text, giai_thich text)
language sql
security definer
set search_path = public, pg_temp
as $$
  select (options ->> (ascii(answer) - ascii('A'))), explanation
  from grammar_questions where id = p_question_id
$$;

revoke all on function public.dap_an_va_giai_thich(bigint) from public, anon;
grant execute on function public.dap_an_va_giai_thich(bigint) to authenticated;
```

- [ ] **Step 4: Dừng lại — người dùng dán tay**

**Không** chạy `supabase db push` hay `psql`. Đưa nội dung file cho người dùng dán vào Supabase Dashboard → SQL Editor → Run, rồi **xác minh độc lập** rằng RPC tồn tại trước khi đi tiếp (gọi thử qua REST bằng service key).

- [ ] **Step 5: Chạy test để xác nhận xanh**

Run: `npm test -- giai-thich-rpc`
Expected: PASS cả 3 test.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0013_dap_an_va_giai_thich.sql tests/giai-thich-rpc.test.ts
git commit -m "feat(phan-hoi): RPC tra dap an va giai thich cho cau ngu phap"
```

---

### Task 2: `recordAnswer` trả phản hồi

**Files:**
- Modify: `src/lib/exam/run.ts` (`KetQuaTraLoi` ~dòng 421, ba nhánh chấm điểm ~dòng 489–515)
- Create: `tests/exam-phan-hoi.test.ts`

**Interfaces:**
- Consumes: RPC `dap_an_va_giai_thich` (Task 1).
- Produces: `KetQuaTraLoi` thêm hai trường:
  ```ts
  /** Chữ hiển thị của đáp án đúng. Chỉ trả về SAU khi CAS đã khoá câu trả lời. */
  dapAnDung: string;
  /** Giải thích, nếu có. Câu ngữ pháp có; câu từ vựng là `null`. */
  giaiThich: string | null;
  ```

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/exam-phan-hoi.test.ts` theo khuôn `tests/exam-security.test.ts` (tạo người dùng thật, dọn trong `afterAll`, dùng client anon đã đăng nhập). Bốn khẳng định:

1. Câu **"nghĩa → từ"**: `dapAnDung` bằng đúng `vocab_words.word` của `ref_id`; `giaiThich` là `null`.
2. Câu **"điền"**: `dapAnDung` bằng đúng `blank_answer` của `ref_id` (lấy đối chiếu qua admin client); `giaiThich` là `null`.
3. Câu **ngữ pháp**: `dapAnDung` nằm trong `options` của câu đó, và `giaiThich` là chuỗi dài hơn 10 ký tự.
4. **Trả lời lại** cùng một vị trí: vẫn trả `dapAnDung` đúng, `ghiNhanLanNay` là `false`, và `word_mastery`/`grammar_mastery` **không** tăng lần hai.

Thêm một khẳng định giữ chốt chặn cũ: đọc `assessment_items.payload` của bài vừa dựng, khẳng định tập khoá đúng bằng `["kind","options","prompt"]` — **không** có đáp án.

- [ ] **Step 2: Chạy test để chắc chắn nó đỏ**

Run: `npm test -- exam-phan-hoi`
Expected: FAIL — `dapAnDung` chưa tồn tại trên `KetQuaTraLoi` (lỗi kiểu hoặc `undefined`).

- [ ] **Step 3: Mở rộng `KetQuaTraLoi` và ba nhánh chấm**

Trong `src/lib/exam/run.ts`:

- Thêm `dapAnDung: string` và `giaiThich: string | null` vào `KetQuaTraLoi`, kèm chú thích nói rõ **vì sao an toàn**: chỉ trả về sau khi CAS đã ghi, nên lúc client biết đáp án thì câu trả lời không đổi được nữa.
- Nhánh **ngữ pháp**: đổi `supabase.rpc("answer_for_question", …)` thành `supabase.rpc("dap_an_va_giai_thich", …)`, lấy cả `dap_an` và `giai_thich`. Ghi chú rằng đây là **thay**, không phải **thêm**, nên không tốn thêm vòng gọi.
- Nhánh **"nghĩa → từ"**: mở rộng `.select("word")` thành `.select("word, meaning_vi, example_vi")` — cùng một vòng gọi. `dapAnDung` là `word`; `giaiThich` là `null` (spec mục 9: không soạn giải thích riêng cho từ vựng).
- Nhánh **"điền"**: giữ RPC `answer_for_word` để lấy `dapAnDung`; thêm một select `meaning_vi, example_vi` cho phần hiển thị. Ghi chú rằng đây là vòng gọi **duy nhất** tăng thêm trong cả lát, và nó chạy trong lúc người học đang đọc kết quả.

Cả ba nhánh trả về `dapAnDung`/`giaiThich` **sau** khi CAS chạy xong, không phải trước.

- [ ] **Step 4: Chạy test để xác nhận xanh**

Run: `npm test -- exam-phan-hoi && npm test -- exam-security`
Expected: PASS cả hai. `exam-security` phải xanh nguyên — nó canh chốt chặn `payload` và CAS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/exam/run.ts tests/exam-phan-hoi.test.ts
git commit -m "feat(phan-hoi): recordAnswer tra dap an va giai thich sau khi CAS khoa"
```

---

### Task 3: `ExamRunner` dừng lại

**Files:**
- Modify: `src/components/exam/ExamRunner.tsx`, `e2e/exam.spec.ts`

**Interfaces:**
- Consumes: `KetQuaTraLoi` với `dapAnDung`, `giaiThich` (Task 2).

- [ ] **Step 1: Viết lại kịch bản e2e đang khẳng định hành vi cũ**

Trong `e2e/exam.spec.ts`, kịch bản `"bấm một đáp án là sang câu sau ngay"` khẳng định đúng thứ đang bị bỏ. **Viết lại**, đừng xoá:

```ts
test("bấm một đáp án thì dừng lại cho xem kết quả, chưa sang câu sau", async ({ page }) => {
  await login(page);
  await page.goto("/vocab/learn/1");
  await page.getByTestId("exam-button").click();
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 1/30");

  await page.getByTestId("exam-option").first().click();

  // Vẫn ở câu 1 — đây là toàn bộ điểm của lát này.
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 1/30");
  await expect(page.getByTestId("exam-phan-hoi")).toBeVisible();
  await expect(page.getByTestId("exam-dap-an-dung")).toBeVisible();
  await expect(page.getByTestId("exam-tiep-tuc")).toBeVisible();

  await page.getByTestId("exam-tiep-tuc").click();
  await expect(page.getByTestId("exam-tien-do")).toHaveText("Câu 2/30");
});
```

Thêm một kịch bản nữa: sau khi trả lời, bấm lại một phương án **không** làm gì (phương án đã đóng băng).

- [ ] **Step 2: Cập nhật mọi vòng lặp trả lời trong tệp này**

Mọi chỗ đang lặp `click exam-option` giờ phải là `click exam-option` rồi `click exam-tiep-tuc`. Câu **cuối** bấm nút nộp thay vì Tiếp tục — dùng `exam-tiep-tuc` cho cả hai và đổi **nhãn** theo vị trí, để kịch bản không phải phân biệt.

Nới timeout của các kịch bản chạy hết bài: số cú bấm tăng gấp đôi. **Không** giảm số câu.

- [ ] **Step 3: Chạy e2e để chắc chắn nó đỏ**

```bash
npm run build && PORT=3001 npm start &
sleep 8
PLAYWRIGHT_BASE_URL=http://localhost:3001 npm run test:e2e -- exam
```
Expected: FAIL — `exam-phan-hoi`, `exam-tiep-tuc` chưa tồn tại.

- [ ] **Step 4: Viết lại `ExamRunner`**

Bốn trạng thái cho câu đang xem:

- **chưa trả lời** — bốn phương án bấm được.
- **đang gửi** — phương án `disabled`.
- **đã có kết quả** — phương án đóng băng, đánh dấu rõ cái người học chọn và cái đúng; khối `data-testid="exam-phan-hoi"` chứa đúng/sai, `data-testid="exam-dap-an-dung"` chứa đáp án, và giải thích nếu `giaiThich` khác `null`; nút `data-testid="exam-tiep-tuc"` với nhãn **"Tiếp tục"**, hoặc **"Nộp bài"** ở câu cuối.
- **gửi hỏng** — thông báo lỗi tại chỗ, phương án mở lại để chọn lại.

**Xoá `viTriLoi` và toàn bộ việc chặn nộp ở cuối bài.** Chúng tồn tại chỉ vì giao diện chạy trước mạng; giờ giao diện đứng chờ nên một câu gửi hỏng hiện ra ngay tại câu đó, với bốn phương án vẫn trên màn hình để bấm lại. Ghi lý do đó vào chú thích — người sau đọc `git log` sẽ thấy một cơ chế an toàn bị gỡ và cần biết vì sao nó không còn cần thiết.

Hàng đợi tuần tự cũng không còn lý do tồn tại: mỗi lúc chỉ có đúng một câu đang gửi. Gỡ nó nếu việc đó làm mã đơn giản hơn thật; nếu thấy còn tác dụng thì giữ và nói rõ tác dụng đó là gì.

- [ ] **Step 5: Chạy e2e để xác nhận xanh**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:3001 npm run test:e2e -- exam`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/exam/ExamRunner.tsx e2e/exam.spec.ts
git commit -m "feat(phan-hoi): dung lai sau moi cau, bo may theo doi cau gui hong"
```

---

### Task 4: Cập nhật hai bộ e2e còn lại

**Files:**
- Modify: `e2e/grammar.spec.ts`, `e2e/on-tap.spec.ts`

- [ ] **Step 1: Chạy để thấy chúng đỏ**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:3001 npm run test:e2e -- grammar on-tap`
Expected: FAIL ở mọi kịch bản chạy hết một bài — vòng lặp thiếu cú bấm Tiếp tục.

- [ ] **Step 2: Thêm cú bấm Tiếp tục vào mọi vòng lặp**

Cùng khuôn với Task 3. Bài ngữ pháp dài nhất có **100 câu**, nên số cú bấm là 200 — **nới timeout, giữ nguyên số câu**. Số câu chính là thứ các kịch bản đó đang canh (`toHaveText("Câu 1/60")`, đếm item, v.v.).

- [ ] **Step 3: Chạy để xác nhận xanh**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:3001 npm run test:e2e -- grammar on-tap`
Expected: PASS.

- [ ] **Step 4: Chạy toàn bộ**

Run: `npm test && npx tsc --noEmit && npm run build && PLAYWRIGHT_BASE_URL=http://localhost:3001 npm run test:e2e`
Expected: tất cả xanh. Nếu `vocab.spec.ts:271` đỏ, chạy riêng nó lại — đó là nhiễu thứ tự đã biết, xanh khi chạy một mình.

- [ ] **Step 5: Commit**

```bash
git add e2e/grammar.spec.ts e2e/on-tap.spec.ts
git commit -m "feat(phan-hoi): cap nhat vong lap tra loi trong e2e ngu phap va on tap"
```

---

## Đối chiếu với spec

| Mục spec | Task |
|---|---|
| 2. Quyền cột; `explanation` cần RPC | 1 |
| 3. Một migration, không thêm vòng gọi | 1, 2 |
| 4. Đáp án chỉ rời server sau CAS; `payload` vẫn sạch | 2 |
| 4. Trả lời lại không cộng mastery hai lần | 2 |
| 5. Bốn trạng thái; bỏ dải "câu trước" | 3 |
| 6. Bỏ `viTriLoi` và chặn-nộp-ở-cuối | 3 |
| 7. Viết lại kịch bản cũ; nới timeout, không cắt số câu | 3, 4 |
| 8. Kiểm thử tích hợp và e2e | 1, 2, 3, 4 |
| 9. Không phím tắt, không nút lùi, không soạn giải thích mới | — cố ý không có task |
