# Phase 0: Hoàn tất chuẩn bị dữ liệu

## Tổng quan Phase 0

Phase 0 đã chuẩn bị đầy đủ dữ liệu cho web app học tiếng Anh TOEIC. Dữ liệu được làm sạch, kiểm tra toàn vẹn, và sẵn sàng để seed lên Supabase.

### Kết quả Phase 0

| Thành phần | Số lượng | Tệp |
|-----------|---------|-----|
| Từ vựng | 605 | `data/clean/vocab.json` |
| Bài ngữ pháp | 20 | `data/clean/grammar.json` |
| Câu hỏi trắc nghiệm | 537 | `data/clean/questions.json` |
| Buổi học | 20 | `data/clean/lesson-plan.json` |
| Test tự động | 66 | `tests/` |
| Tệp cấu hình DB | 4 migration | `supabase/migrations/` |

### Các Task đã hoàn tất

- **Task 1**: Thiết lập dự án (NPM, Vite, Vitest)
- **Task 2**: OCR tài liệu PDF → văn bản thô (605 mục từ vựng)
- **Task 3**: Phân tích cú pháp → định dạng JSON (593 → 605 mục sau cứu tay)
- **Task 4**: Trích xuất từ ngữ, từ đồng nghĩa, IPA, ví dụ
- **Task 5**: Làm sạch 10 lô (605 mục) — tự viết từ đồng nghĩa, ví dụ, định nghĩa
- **Task 6**: Chuyển đổi 20 tài liệu ngữ pháp PDF → Markdown
- **Task 7**: Chia bài học thành 20 buổi (30 từ/buổi)
- **Task 8**: Phân tích 100 câu trắc nghiệm từ sách
- **Task 9**: Soạn 537 câu hỏi với đáp án + giải thích
- **Task 10**: Lập kế hoạch học 20 buổi (600/605 từ được dùng)
- **Task 11**: Tạo schema Supabase (11 bảng, 4 enum)
- **Task 12**: Triển khai Row-Level Security (RLS) toàn bộ
- **Task 13**: Soạn script seed dữ liệu
- **Task 14**: Kiểm thử toàn vẹn nội dung
- **Task 15**: Áp migration + seed lên Supabase production, kiểm chứng RLS trên môi trường thật

---

## Task 15 — đã hoàn tất

Task 15 gồm 7 bước. Bốn bước đầu tiên cần khoá Supabase, ba bước sau không cần và có thể làm trước:

### ✅ Step 6: Tạo workflow chống ngủ (ĐÃ XONG)

**Tệp:** `.github/workflows/keepalive.yml` — đã được tạo.

**Bối cảnh:** Dự án Supabase gói Free sẽ bị tạm dừng (đi vào chế độ ngủ) sau khoảng 1 tuần không truy vấn. Lịch học của bạn là 2 buổi/tuần, nên bình thường không bị ngủ. Tuy nhiên, nếu bạn nghỉ một tuần trở lên, project sẽ vào chế độ ngủ và phải vào dashboard Supabase bấm khôi phục thủ công.

Workflow này chạy mỗi 3 ngày một lần, gửi một truy vấn nhẹ (lấy 1 bài ngữ pháp) để giữ project thức. Không ảnh hưởng đến dữ liệu, chỉ kích hoạt hệ thống.

**Tiếp theo:** Sau khi bạn có khoá Supabase, hãy thêm hai biến secret vào GitHub repository:
- `SUPABASE_URL`: URL của project Supabase (dạng `https://xxx.supabase.co`)
- `SUPABASE_ANON_KEY`: Khoá công khai của Supabase (có thể chia sẻ)

Tìm những giá trị này ở Supabase Dashboard → Settings → API → anon key.

---

## Các bước cần khoá Supabase (để làm sau)

### Step 1: Tạo `.env.local`

```bash
cp .env.local.example .env.local
```

Mở tệp `.env.local` vừa tạo, điền vào hai giá trị:

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5...
```

**Lấy khoá ở đâu?**
1. Vào [Supabase Dashboard](https://app.supabase.com)
2. Chọn project của bạn
3. Vào **Settings** → **API**
4. Tìm:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_ANON_KEY`
   - **Service Role Secret** → `SUPABASE_SERVICE_ROLE_KEY` (ở dưới cùng, phải nhấp "Reveal")

**⚠️ QUAN TRỌNG:** `.env.local` đã được thêm vào `.gitignore`, nên Git sẽ tự động bỏ qua nó. Điều này là đúng — **không bao giờ commit `.env.local` lên GitHub**, vì nó chứa `SUPABASE_SERVICE_ROLE_KEY` — một khoá bảo mật cấp cao.

Bạn có thể kiểm tra:
```bash
git check-ignore -v .env.local
```

Nếu in ra dòng `.gitignore:5:.env.local`, thì an toàn. Nếu không in gì, đó là lỗi nghiêm trọng — khoá sẽ bị commit.

### Step 2: Xác nhận `.env.local` được ignore

Chạy:
```bash
git check-ignore -v .env.local
```

Phải in ra dòng khớp từ `.gitignore`. Nếu không có output gì, **dừng lại ngay** — service role key sắp lộ lên GitHub!

### Step 3: Áp migration lên project thật

Sau khi điền xong khoá vào `.env.local`:

```bash
supabase link --project-ref <project-id>
```

Thay `<project-id>` bằng ID của project Supabase bạn (xem ở URL: `https://app.supabase.com/project/xxxxx`)

Sau đó:
```bash
supabase db push
```

Lệnh này sẽ áp 4 migration:
1. Tạo 11 bảng (vocab, grammar, questions, v.v.)
2. Cấu hình RLS trên từng bảng
3. Tạo vai trò `educator`
4. Cài đặt hàng rào bảo mật

**Expected output:** 4 migration succeed.

### Step 4: Seed dữ liệu thật

Chạy:
```bash
npm run phase0:seed
```

Script sẽ:
1. Đọc 4 tệp JSON từ `data/clean/`
2. Kết nối tới project Supabase thật (dùng `SUPABASE_SERVICE_ROLE_KEY`)
3. Chèn 605 từ, 20 bài, 537 câu hỏi, 20 buổi vào database

**Expected output:**
```
Seed xong: 605 tu, 20 bai, 537 cau hoi, 20 buoi
```

Nếu lỗi `permission denied`, kiểm tra:
- `SUPABASE_SERVICE_ROLE_KEY` có đúng không?
- RLS đã áp lên project chưa (từ Step 3)?

### Step 5: Chạy test RLS trên project thật

Chạy:
```bash
npm test -- rls
```

**Chú ý:** Test này sẽ tạo tạm thời 6 tài khoản kiểm thử (`@test.local`) trong Supabase auth, rồi tự động xoá. Đây là bình thường và an toàn.

Expected output: **PASS** — 5 test. Chúng kiểm chứng rằng hàng rào RLS hoạt động đúng trên môi trường thật:
- Người dùng không thể xem tiến độ của người khác
- Người dùng không thể xem đáp án trước khi trả lời
- Người dùng không thể sửa bảng nội dung
- Người dùng chỉ có thể đọc bài học công khai

Nếu có test đỏ, điều đó có nghĩa là RLS chưa hoạt động đúng trên project thực.

---

## Tóm tắt quy trình

| Step | Trạng thái | Cần khoá? | Lệnh |
|------|----------|---------|------|
| 1 | ✅ Xong | ✅ Có | `cp .env.local.example .env.local` |
| 2 | ✅ Xong | ✅ Có | `git check-ignore -v .env.local` |
| 3 | ✅ Xong | ✅ Có | Dán SQL lên dashboard (xem ghi chú dưới) |
| 4 | ✅ Xong | ✅ Có | `npm run phase0:seed` |
| 5 | ✅ Xong | ✅ Có | `npm test` |
| 6 | ✅ Xong | ❌ Không | `.github/workflows/keepalive.yml` tạo xong |
| 7 | ✅ Xong | ❌ Không | Commit workflow |

### Ghi chú: Step 3 đi đường dashboard, không dùng `supabase link`

Supabase CLI trên máy đang đăng nhập bằng tài khoản khác — `supabase projects list`
không thấy project này, nên `supabase link` không dùng được. Thay vào đó, 4 file
trong `supabase/migrations/` được gộp theo thứ tự `0001 → 0004` rồi dán vào
Supabase Dashboard → SQL Editor → Run. Kết quả tương đương `supabase db push`.

Nếu sau này cần chạy lại migration trên project khác, đường dashboard vẫn hợp lệ:

```bash
cat supabase/migrations/0001_content.sql \
    supabase/migrations/0002_curriculum.sql \
    supabase/migrations/0003_user_state.sql \
    supabase/migrations/0004_rls.sql | pbcopy
```

### Ghi chú: `.env.local` không tự được nạp

Điền khoá vào `.env.local` là chưa đủ — ban đầu không có gì đọc file đó:

- `scripts/phase0/05-seed.ts` dùng `import "dotenv/config"`, mà lệnh đó chỉ đọc
  `.env` chứ không đọc `.env.local` → seed chết ngay ở dòng kiểm tra biến.
- `vitest.config.ts` không có `setupFiles` → `tests/rls.test.ts` fail lúc thu thập
  test, còn `tests/db-integrity.test.ts` bị bỏ qua **im lặng** (9 test không chạy).

Đã sửa: cả hai nay gọi `config({ path: ".env.local" })`, qua `tests/setup-env.ts`
cho phía test.

### Kết quả thực tế sau Step 4 và Step 5

| Bảng | Số dòng |
|------|--------|
| `vocab_words` | 605 |
| `grammar_lessons` | 20 |
| `grammar_questions` | 537 |
| `lessons` | 20 |
| `lesson_words` | 600 (30 từ × 20 buổi) |

`npm test`: **66/66 xanh**, gồm 5 test RLS và 9 test `db-integrity` chạy trên
project thật. Không còn tài khoản `@test.local` sót lại, không có dòng rác
`ordinal 9999` trong `vocab_words`.

---

## Cảnh báo về khoá Supabase

### `SUPABASE_SERVICE_ROLE_KEY`

- **Bảo mật:** Cấp cao nhất, có quyền tuyệt đối trên database
- **Dùng:** Chỉ trong script seed (máy của bạn), không bao giờ trong client code
- **Rủi ro:** Nếu commit lên GitHub hoặc gửi client, người khác có thể xoá toàn bộ dữ liệu
- **Giải pháp:** Giữ trong `.env.local` (đã ignore), không chia sẻ

### `SUPABASE_ANON_KEY`

- **Bảo mật:** Công khai, chỉ dùng từ client app
- **Dùng:** Có thể thêm vào GitHub secrets (cho workflow keepalive)
- **Rủi ro:** Thấp, vì RLS chặn người dùng anon xem được gì

### `SUPABASE_URL`

- **Bảo mật:** Công khai, chỉ là địa chỉ của server
- **Dùng:** Có thể commit, có thể thêm vào GitHub secrets
- **Rủi ro:** Không có

---

## Nếu gặp vấn đề

### Lỗi "project already linked"

```bash
supabase unlink
supabase link --project-ref <project-id>
```

### Lỗi "permission denied" khi seed

Kiểm tra:
1. Khoá `SUPABASE_SERVICE_ROLE_KEY` có đúng không?
2. RLS đã bật chưa (từ Step 3)?
3. Người dùng hiện tại trong Supabase có vai trò `educator` không?

### Project Supabase bị ngủ

Nhớ thêm `SUPABASE_ANON_KEY` vào GitHub secrets:
1. Vào GitHub repo → Settings → Secrets and variables → Actions
2. Nhấp "New repository secret"
3. Thêm `SUPABASE_URL` và `SUPABASE_ANON_KEY`

Workflow keepalive sẽ chạy tự động mỗi 3 ngày.

### Muốn test workflow keepalive ngay?

```bash
# Trigger lệnh workflow_dispatch
gh workflow run keepalive
```

Hoặc vào GitHub repo → Actions → keepalive → Run workflow.

---

## Bước tiếp theo (Phase 1)

Sau khi hoàn tất Task 15 (seed + test RLS thành công), database production sẵn sàng.

Phase 1 sẽ:
- Xây dựng Next.js client app
- Lấy dữ liệu từ Supabase
- Hiển thị bài học, câu hỏi, theo dõi tiến độ
- Gọi API Supabase an toàn với RLS

Tất cả chỉnh sửa dữ liệu (từ, bài học) từ bây giờ phải thông qua database, không sửa JSON file trực tiếp.

---

## Tệp tham khảo

Để hiểu chi tiết hơn về Phase 0, xem:
- Kế hoạch: `docs/superpowers/plans/2026-08-06-phase0-content-pipeline.md`
- Tiến độ: `.superpowers/sdd/2026-08-06-phase0-content-pipeline/progress.md`
- Brief của từng task: `.superpowers/sdd/2026-08-06-phase0-content-pipeline/task-*.md`
