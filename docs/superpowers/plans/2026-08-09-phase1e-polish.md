# Lát 1e — Hoàn thiện: đóng nốt các việc đã hoãn

> **Cho người thực thi:** dùng `superpowers:subagent-driven-development`.

**Mục tiêu:** đóng những việc mà các vòng review của lát 1c và 1d đã ghi nhận và
cố ý hoãn lại. Không thêm tính năng nào cho người học.

**Việc quan trọng nhất là Task 1** — một lỗi ghi nhận sai kết quả bài làm, âm
thầm và vĩnh viễn.

## Ràng buộc toàn cục

- Không `Math.random()` dưới `src/`.
- `SUPABASE_SERVICE_ROLE_KEY` không xuất hiện dưới `src/`.
- Luôn `getUser()`, không `getSession()`.
- Không nuốt lỗi Supabase — kiểm `error` và `throw`.
- Mọi truy vấn theo người dùng lọc `.eq("user_id", user.id)` tường minh.
- Đáp án không bao giờ tới trình duyệt; không hiện đúng/sai từng câu khi đang làm bài.
- Chữ hiển thị tiếng Việt; chú thích tiếng Việt giải thích **vì sao**; chú thích
  SQL không dấu.
- Mọi lệnh xoá trong test buộc theo `user_id` do chính test đó tạo.
- Không nới lỏng khẳng định nào đang có. `e2e/auth.spec.ts` giữ nguyên
  `toHaveCount(35)` và `toHaveCount(20)`.
- **SQL phải được CHẠY THẬT trước khi giao** — dựng PostgreSQL nội bộ, mô phỏng
  bộ role/grant/RLS của Supabase, chạy `0001`→`0009`, và chạy lại lần hai để
  kiểm idempotent. Lát 1c đã có ba lỗi Critical trong một tệp SQL mà chỉ việc
  chạy thật mới thấy: một lỗi cú pháp làm cả tệp không parse, một lệnh `revoke`
  vô hiệu, và hai hàm hoá ra là máy dò đáp án.

---

### Task 1: Đóng bài và ghi điểm trong MỘT câu lệnh

**Files:**
- Create: `supabase/migrations/0009_finalize_atomic.sql`
- Modify: `src/lib/assessment/run.ts`, `tests/assessment-run.test.ts`

**Vấn đề đang có.** `finalize` đóng bài bằng RPC (`status` → `submitted`) rồi
ghi `score`/`passed`/`submitted_at` bằng **một UPDATE riêng**. Hai vòng mạng, và
lần đầu commit trước. Nếu vòng thứ hai không tới — timeout, đứt kết nối, một
lần deploy chen giữa — dòng đó nằm lại `submitted` với `score = NULL`.

Vòng review lát 1c đã bịt một nửa: điều kiện rẽ sớm giờ đòi `score !== null`
nên một lần gọi lại **sửa được** dòng hỏng. Nhưng không có gì **kích hoạt** lần
gọi lại đó: `nextStep` chỉ trả `close-expired` cho dòng `in_progress`, còn dòng
hỏng là `submitted` với `passed = null` nên nó rơi thẳng xuống nhánh
`start remedial` — và bài bổ túc **dựng được**, vì backfill đã chạy. Người học
được 22/25 bị ghi là trượt và bị đẩy vào bài bổ túc họ không hề trượt.

**Cách sửa:** không còn hai lượt ghi để rách ở giữa. Hàm SQL nhận thêm ngưỡng
đạt và mốc thời gian, tự tính điểm, và đóng bài bằng **một** câu lệnh.

- [ ] **Bước 1: Migration `0009_finalize_atomic.sql`**

Thay hàm bằng `create or replace`. Chữ ký mới:

```
finalize_assessment_items(p_assessment_id bigint, p_pass_mark int, p_now timestamptz)
  returns table(total int, correct int, score int, passed boolean)
```

Yêu cầu, theo đúng thứ tự trong thân hàm:

1. Kiểm chủ sở hữu như hiện tại (`auth.uid()` khớp `assessments.user_id`), ném
   `42501` nếu không. **`security definer` bỏ qua RLS, nên phép kiểm bên trong
   hàm là hàng rào duy nhất** — đây là dòng nguy hiểm nhất của cả task.
2. Nếu bài **đã** `submitted` **và** `score is not null` → trả về đúng giá trị
   đã lưu, không ghi gì. Đây là đường nộp hai lần, phải bất biến.
3. Điền `is_correct = false` cho các câu còn `null`.
4. Đếm tổng và đúng.
5. **Nếu tổng = 0 thì `raise exception` và KHÔNG đóng bài** — để dòng nằm lại
   `in_progress` cho một lần gọi sau còn cứu được. Hành vi hiện tại đóng bài
   trước rồi mới ném, tạo ra một dòng vĩnh viễn không chấm được.
6. Tính `v_score = round(correct * 100.0 / total)` và
   `v_passed = v_score >= p_pass_mark`.
7. Đóng bài bằng **một** UPDATE đặt cả `status`, `score`, `passed`,
   `submitted_at`, với điều kiện `status = 'in_progress'` (CAS). Nếu khớp 0
   dòng — có ai đó vừa thắng — thì **đọc lại** giá trị đã lưu và trả về, không
   ném. Hai lượt `finalize` chạy song song phải cho cùng một kết quả.
8. Trả về `total, correct, score, passed`.

Giữ nguyên `set search_path = public, pg_temp`, `revoke ... from public, anon`,
`grant execute ... to authenticated`.

**Chữ ký đổi nên `create or replace` sẽ báo lỗi "cannot change return type".**
Phải `drop function if exists public.finalize_assessment_items(bigint);` trước —
ghi rõ trong tệp, và kiểm bằng cách chạy thật.

- [ ] **Bước 2: `run.ts` gọi hàm mới**

`finalize` truyền `PASS_MARK[type]` và `now`, rồi đọc thẳng `score`/`passed` từ
kết quả trả về. Bỏ hẳn lượt UPDATE riêng và mọi chú thích nói về "chốt
`score is null`" — cơ chế đó không còn.

`PASS_MARK` **vẫn ở TypeScript** và được truyền vào như tham số: SQL không biết
ngưỡng của từng loại bài, nó chỉ so sánh. Vẫn đúng một nơi định nghĩa ngưỡng.

`submitAssessment` và `closeExpired` vẫn cùng đi qua `finalize` — không được
xuất hiện đường chấm thứ hai.

- [ ] **Bước 3: Test**

Thêm vào `tests/assessment-run.test.ts`:
- Nộp bài bình thường: `score`, `passed`, `submitted_at` đều khác null **trong
  cùng một lần đọc** — không có trạng thái trung gian nào quan sát được.
- Nộp hai lần: lần thứ hai trả đúng kết quả cũ, `submitted_at` không đổi.
- Bài 0 câu: ném, **và dòng vẫn là `in_progress`** sau khi ném. Đây là khẳng
  định phân biệt bản mới với bản cũ.

Xoá test nào chỉ còn đúng với cơ chế cũ, và nói rõ trong báo cáo đã xoá cái gì
và vì sao — không im lặng bỏ một khẳng định.

- [ ] **Bước 4: Kiểm chứng**

Chạy `0001`→`0009` trên PostgreSQL nội bộ, hai lần, và đo:
- nộp thường, nộp hai lần, bài 0 câu, hai `finalize` song song;
- gọi bằng người khác → `42501`;
- gọi trên bài `in_progress` của chính mình → **đóng bài**, đúng như thiết kế
  lát 1c (gọi giữa chừng chỉ là tự nộp sớm, không dò được gì).

Rồi `npx tsc --noEmit` và `npm run build`. `npm test` sẽ đỏ ở những test cần hàm
mới cho tới khi migration được dán — nói rõ test nào và vì sao.

- [ ] **Bước 5: Commit**

```bash
git add supabase/migrations/0009_finalize_atomic.sql src/lib/assessment/run.ts tests/assessment-run.test.ts
git commit -m "fix(1e): dong bai va ghi diem trong MOT cau lenh"
```

---

### Task 2: Ba việc phòng thủ và một nguồn sự thật

**Files:**
- Modify: `src/middleware.ts`, `src/app/(app)/learn/[lessonId]/page.tsx`,
  `src/lib/assessment/slots.ts`, `src/lib/stats/compute.ts`,
  `src/app/(app)/dashboard/page.tsx`, `src/components/lesson/lesson-done.tsx`
- Modify: `tests/slots.test.ts`

Không có SQL ở task này.

- [ ] **Bước 1: `middleware.ts` không được lệch khỏi hệ thống tệp**

`PROTECTED = ["/dashboard", "/learn"]` bỏ sót `/stats` và `/assessment`. Hôm nay
chưa phải lỗ hổng — `AppLayout` chuyển hướng khi chưa đăng nhập, mọi truy vấn có
RLS cộng `.eq("user_id")`, và `Cache-Control: private, no-store` đặt cho mọi
response khớp matcher bất kể danh sách này. Nhưng hằng số đó **đọc lên như một
bản kê các route được bảo vệ** trong khi chỉ nêu hai trong bốn route của nhóm
`(app)`, và chú thích ở `layout.tsx` tự mô tả mình là **lớp thứ hai** đỡ cho
matcher cấu hình sai — với `/stats` và `/assessment` thì không có lớp thứ nhất
nào để đỡ.

Thay danh sách đường dẫn bằng một phép kiểm **thuộc nhóm `(app)`**, để middleware
không thể lệch khỏi hệ thống tệp lần nữa. Ghi rõ trong chú thích vì sao danh
sách tay là sai lầm.

- [ ] **Bước 2: Bổ sung bộ lọc còn thiếu**

`src/app/(app)/learn/[lessonId]/page.tsx` đọc `user_lesson_progress` và
`assessments` mà không có `.eq("user_id", user.id)` tường minh — chỗ duy nhất
trong toàn bộ mã còn thiếu. Thêm vào, kèm chú thích giống các nơi khác.

- [ ] **Bước 3: Một nguồn cho nhãn bài đánh giá**

Chuỗi `"Ôn tập buổi 1–2"` / `"Kiểm tra buổi 1–4"` đang được dựng ở **ba** nơi:
`src/lib/stats/compute.ts`, `src/app/(app)/dashboard/page.tsx`,
`src/components/lesson/lesson-done.tsx`. Hôm nay chúng chưa mâu thuẫn được, vì
`slots.ts` cho ôn tập đúng 2 buổi và kiểm tra đúng 4 — nhưng đó là một sự trùng
hợp do dữ liệu, không phải một bảo đảm.

Xuất một hàm duy nhất từ `src/lib/assessment/slots.ts` (nơi đã định nghĩa hình
dạng slot) và dùng ở cả ba chỗ. Dấu gạch ngang phải là **en dash U+2013**, đúng
byte như hiện tại — Playwright đang so khớp chuỗi này.

Thêm test trong `tests/slots.test.ts` cho cả ba loại và cho mảng một phần tử.

- [ ] **Bước 4: Kiểm chứng**

`npx tsc --noEmit` · `npm test` · `npm run test:e2e` · `npm run build`.
Task này không cần migration nên **phải xanh hết**. Một test đỏ ở đây là lỗi thật.

- [ ] **Bước 5: Commit**

```bash
git commit -m "fix(1e): middleware theo nhom (app), bo loc con thieu, mot nguon cho nhan bai"
```
