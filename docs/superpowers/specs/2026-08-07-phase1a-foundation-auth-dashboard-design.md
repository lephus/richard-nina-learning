# Thiết kế: Phase 1a — nền tảng, xác thực, dashboard

**Ngày:** 2026-08-07
**Trạng thái:** Đã duyệt thiết kế, chờ lập kế hoạch triển khai
**Tiền đề:** [Thiết kế tổng thể](2026-08-06-english-learning-web-design.md) · Phase 0 đã hoàn tất

---

## 1. Vì sao Phase 1 được chẻ nhỏ

Phase 1 trong spec tổng thể gồm nhiều hệ con độc lập: xác thực, dashboard, luồng học 30 từ, ôn tập, kiểm tra 60 phút có đồng hồ server, bổ túc, thống kê, và triển khai. Gộp vào một kế hoạch thì kế hoạch dài tới mức không kiểm chứng nổi, và rất lâu mới có thứ chạy được để nhìn.

Phase 1 chia thành bốn lát dọc, mỗi lát tự chạy được, có spec và kế hoạch riêng:

| Lát | Nội dung | Chạy được cái gì |
|---|---|---|
| **1a** *(tài liệu này)* | Next.js, xác thực, dashboard, triển khai Vercel | Đăng nhập, thấy lộ trình, app thật trên mạng |
| 1b | `learn/[lessonId]` — 3 cụm × 10 từ; ghi `word_mastery` | Học được một buổi từ đầu tới cuối |
| 1c | `assessments` start/submit, đồng hồ server, ôn tập + kiểm tra | Vòng lặp học đầy đủ có pass/fail |
| 1d | Bổ túc phần sai, `/stats` | Hoàn chỉnh |

---

## 2. Phạm vi lát 1a

**Xong khi:** đăng ký và đăng nhập chạy được, dashboard đọc 20 buổi từ Supabase qua RLS, và app đã lên Vercel truy cập được bằng URL thật.

Bao gồm triển khai thật ngay từ lát đầu vì xác thực Supabase trong Next App Router chạy bằng cookie qua middleware, và hành vi ở local khác hẳn trên Vercel — sai domain cookie, sai redirect URL, thiếu biến môi trường đều chỉ lộ ra lúc deploy. Dồn rủi ro đó về cuối là dồn vào lúc khó gỡ nhất.

### Cố ý không làm ở lát này

Quên mật khẩu · đổi tên hiển thị · chế độ tối · `/stats` · luồng học thật · ôn tập và kiểm tra · PWA.

---

## 3. Các quyết định đã chốt

| # | Vấn đề | Quyết định | Lý do |
|---|---|---|---|
| 1 | Phiên bản | Next 16.3 · React 19.2 · Tailwind 4.3 · `@supabase/ssr` 0.12 | Spec tổng thể viết "Next.js 15" khi đó là bản mới nhất; nay là 16.3. Tailwind 4 cấu hình bằng CSS, không còn `tailwind.config.js` |
| 2 | Bố cục repo | Next dùng thư mục `src/` | `src/content/` đã tồn tại và dùng chung; alias `@content/*` trong `tsconfig.json:12` giữ nguyên. Gốc repo vẫn gọn cho `scripts/` `tests/` `supabase/` `data/` |
| 3 | Đăng ký | Mở cho bất kỳ ai, không xác minh email | Theo spec tổng thể mục 9.1. Giảm thiểu bằng rate limit sẵn có của Supabase Auth và trigger tạo `profiles` ở database. **Cập nhật 2026-08-08 (sửa lại):** tắt "Confirm email" trên project khiến `signUp()` trả session ngay (tự động đăng nhập) khi email mới, nhưng trả lỗi `user_already_exists` (quan sát trực tiếp, `status: 422`) khi email đã có tài khoản — hai kết quả phân biệt được, để lộ email nào đã đăng ký **cả ở nội dung trang lẫn ở header `Set-Cookie` của response** (bù bằng `signOut()` sau khi thấy session vẫn để lại `Set-Cookie` do lệnh xoá cookie cũng phải phát `Set-Cookie`, nên vẫn dò được bằng curl dù trang HTML giống hệt nhau — đã sửa lại lần đầu không triệt để). Bản vá cuối: `signUp()` dùng một client Supabase mà `setAll` là no-op tuyệt đối (`createNonPersistingClient()` trong `src/lib/supabase/server.ts`), không bao giờ ghi cookie dù Supabase trả kèm session hay không — không còn cần `signOut()` bù lại, không còn `redirect()`. Mọi lần đăng ký hợp lệ (mới hay trùng) trả cùng một thông điệp trung lập, và response không bao giờ mang `Set-Cookie`. Xem `src/app/(auth)/actions.ts`, `src/lib/supabase/server.ts`. Giá phải trả: người dùng mới phải đăng nhập thêm một bước sau khi đăng ký — chấp nhận được để đóng kênh dò email |
| 4 | Truy cập dữ liệu | Server Component + `@supabase/ssr`, đăng nhập bằng Server Action | RLS là hàng rào duy nhất, không có bản sao logic phân quyền để lệch pha. Sẵn đường cho lát 1c |
| 5 | Kiểm thử E2E | Playwright | Luồng đăng nhập chạy xuyên middleware và cookie — unit test không chạm tới |

### Vì sao không đi lối client

Xét hướng để `@supabase/supabase-js` chạy thẳng trong trình duyệt như một SPA: dễ hình dung hơn, ít khái niệm mới. Nhưng tới lát 1c là tắc. Chấm điểm cần đọc `grammar_questions.answer`, mà `0004_rls.sql:46-48` đã thu hồi quyền đọc cột đó khỏi `authenticated`. Đồng hồ 60 phút cũng không thể tin trình duyệt. Chọn lối client ở 1a là mua nợ phải trả ở 1c bằng cách viết lại.

Cũng xét hướng thay Server Action bằng route handler `/api/*` cho mọi thao tác ghi: bề mặt API tường minh hơn. Nhưng đăng nhập không cần tới mức đó. Route handler thật sẽ tới ở lát 1c cho `assessments/start` và `assessments/submit`, dựng đúng lúc cần.

---

## 4. Kiến trúc

### 4.1 Bố cục

```
src/
  middleware.ts              làm mới token, chặn route chưa đăng nhập
  app/
    layout.tsx
    (auth)/
      login/page.tsx
      register/page.tsx
      actions.ts             Server Action: signIn · signUp · signOut
    (app)/
      layout.tsx             lớp chặn thứ hai, đọc user
      dashboard/page.tsx     Server Component
      learn/[lessonId]/page.tsx   trang tạm, xem mục 5.3
    error.tsx
  components/
  lib/
    supabase/client.ts       createBrowserClient
    supabase/server.ts       createServerClient đọc cookie
    curriculum/lesson-status.ts
  content/                   đã có, giữ nguyên
e2e/                         Playwright, tách khỏi tests/
```

### 4.2 Luồng xác thực

Middleware chạy trước mọi request trong nhóm `(app)`, gọi `supabase.auth.getUser()` để token tự làm mới rồi ghi cookie mới vào response.

Dùng `getUser()` chứ **không** dùng `getSession()`. `getSession()` chỉ đọc cookie và tin nó, nên trên server nó không chứng minh được gì; `getUser()` hỏi lại máy chủ auth.

Chưa đăng nhập thì middleware đẩy về `/login`. Layout của `(app)` kiểm tra lần nữa — không thừa, vì middleware có thể bị bỏ qua khi `matcher` cấu hình sai, và đó là loại lỗi âm thầm để lộ dữ liệu.

Đăng nhập và đăng ký là Server Action; form gửi thẳng lên server, không có `onSubmit` phía client. Mật khẩu không đi qua JavaScript của trình duyệt.

### 4.3 Chỗ hở phải bịt: `profiles`

`0003_user_state.sql:1-5` khai báo `profiles.display_name` là `not null`, nhưng không có gì tự tạo dòng `profiles` khi có người đăng ký.

Nếu để Server Action chèn sau khi `signUp` thành công, chỉ cần request đứt giữa chừng là sinh ra một `auth.users` không có `profiles` — người dùng đăng nhập được nhưng app vỡ ở mọi chỗ join vào `profiles`.

**Thêm migration `0005_profile_trigger.sql`**: trigger `SECURITY DEFINER` trên `auth.users` tự chèn `profiles`, lấy `display_name` từ `raw_user_meta_data` mà `signUp` truyền lên. Bất biến *"mọi `auth.users` đều có `profiles`"* do database giữ, không do mã ứng dụng giữ.

---

## 5. Luồng dữ liệu

### 5.1 Dashboard đọc gì

Server Component chạy hai truy vấn, cả hai đi qua RLS bằng JWT của chính người dùng:

```
lessons ⋈ grammar_lessons     → 20 dòng: ordinal, tiêu đề bài ngữ pháp
user_lesson_progress          → chỉ dòng của mình, do own_progress lọc
```

**Mã ứng dụng không dùng `service_role` ở bất kỳ đâu.** Chỗ nào trong `src/` cần tới nó là dấu hiệu thiết kế sai. Khoá đó chỉ xuất hiện ngoài ứng dụng: script seed và global setup của Playwright, cả hai chạy trên máy chứ không lên Vercel (xem mục 8).

### 5.2 Trạng thái 20 buổi

Điểm dễ làm hỏng nhất của lát này. `0003_user_state.sql:14` cho `status` mặc định `'locked'`, nhưng lúc mới đăng ký **bảng `user_lesson_progress` rỗng** — không phải 20 dòng `locked`.

Không sinh sẵn 20 dòng lúc đăng ký. Thay vào đó `lib/curriculum/lesson-status.ts` là hàm thuần:

```
lessonStatuses(lessons, progressRows) → 20 trạng thái
  có dòng trong user_lesson_progress → dùng đúng status của dòng đó
  không có dòng, buổi 1              → 'available'
  không có dòng, buổi n (n>1)        → 'available' nếu buổi n−1 tính ra 'completed'
                                        ngược lại 'locked'
```

**Dòng trong bảng luôn thắng luật suy diễn.** Nếu buổi 5 có dòng `in_progress` trong khi buổi 4 chưa xong, buổi 5 vẫn là `in_progress` — hàm không "sửa" dữ liệu lệch, vì tự ý khoá lại một buổi người dùng đang học dở là hành vi tệ hơn nhiều so với việc để lộ một dòng dữ liệu bất thường. Trường hợp này nằm trong bộ test.

Buổi n suy diễn từ trạng thái **đã tính** của buổi n−1, không phải từ dòng thô, nên chuỗi khoá lan đúng qua các buổi chưa có dòng nào.

Bảng chỉ mọc dòng cho buổi thực sự đụng tới, và luật mở khoá nằm gọn trong một hàm kiểm thử được thay vì rải giữa trigger, giá trị mặc định và mã giao diện. Đúng tinh thần mục 6.5 của spec tổng thể: chỗ dễ sai nhất phải là hàm thuần.

Đây là mảnh đầu tiên của `lib/curriculum/`. Hàm `nextStep()` đầy đủ tới ở lát 1c, khi ôn tập và kiểm tra chen vào chuỗi.

### 5.3 Nút "Học tiếp"

Trỏ tới `/learn/[lessonId]` của buổi `available` đầu tiên. Lát 1a chưa có luồng học, nên đó là trang tạm chỉ ghi một dòng *"Buổi N — triển khai ở lát 1b"*. Cố ý làm vậy để Playwright kiểm chứng được điều hướng mà không lấn sang phạm vi 1b.

---

## 6. Xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| Sai email hoặc mật khẩu | Một thông báo chung *"Email hoặc mật khẩu không đúng"*. Không phân biệt hai trường hợp — phân biệt là để lộ email nào đã đăng ký |
| Đăng ký trùng email | **Cập nhật 2026-08-08:** không còn "thông báo chung" kiểu lỗi — trả CÙNG thông điệp trung lập ("Tài khoản đã sẵn sàng. Vui lòng đăng nhập.") như đăng ký mới thành công, byte-for-byte, không redirect. Lý do và chi tiết ở mục 3, quyết định #3 |
| Supabase ngủ hoặc mất mạng | `error.tsx` cho nhóm `(app)`: thông báo tiếng Việt kèm nút thử lại. Không đổ stack trace ra màn hình |
| Token hết hạn giữa chừng | Middleware làm mới; thất bại thì đẩy về `/login` |

---

## 7. Kiểm thử

### Vitest

`lessonStatuses()` là hàm thuần nên phủ được mọi nhánh không cần server: bảng tiến độ rỗng, buổi giữa vừa `completed`, buổi cuối, và trường hợp dữ liệu lệch (có dòng cho buổi 5 nhưng buổi 4 chưa xong).

### Playwright

Năm kịch bản, đúng loại lỗi mà unit test mù:

1. Chưa đăng nhập vào `/dashboard` → bị đẩy về `/login`
2. Đăng nhập sai → báo lỗi, vẫn ở `/login`
3. Đăng nhập đúng → thấy đủ 20 buổi, buổi 1 mở, buổi 2 khoá
4. Bấm "Học tiếp" → tới `/learn/1`
5. Đăng xuất rồi quay lại `/dashboard` → bị đẩy về `/login`

Test E2E để ở `e2e/`, không phải `tests/`. Vitest gom theo `tests/**/*.test.ts` nên hai bộ không giẫm chân nhau và `npm test` vẫn nhanh. Tách script: `npm test` chạy Vitest, `npm run test:e2e` chạy Playwright.

Tài khoản kiểm thử dựng bằng `service_role` ở global setup rồi xoá ở teardown — cùng khuôn với `tests/rls.test.ts`, khuôn đó đã chứng minh là sạch.

---

## 8. Triển khai

Nối repo `lephus/richard-nina-learning` vào Vercel, nhánh `main` tự deploy.

**Tên biến môi trường phải đổi.** Trình duyệt chỉ thấy biến có tiền tố `NEXT_PUBLIC_`, mà `.env.local` hiện dùng `SUPABASE_URL` và `SUPABASE_ANON_KEY` trần. `.env.local` sẽ mang cả hai bộ:

| Biến | Dùng cho | Lên Vercel? |
|---|---|---|
| `SUPABASE_URL` | script Phase 0, test RLS | Không |
| `SUPABASE_ANON_KEY` | test RLS | Không |
| `SUPABASE_SERVICE_ROLE_KEY` | seed, global setup của Playwright | **Không bao giờ** |
| `NEXT_PUBLIC_SUPABASE_URL` | app | Có |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | app | Có |

Mã ứng dụng không có chỗ nào cần `service_role`, nên khoá đó không có lý do gì xuất hiện trên Vercel. Nó chỉ được dùng bởi hạ tầng chạy trên máy: script seed Phase 0 và global setup của Playwright khi dựng rồi xoá tài khoản kiểm thử.

Còn một bước trong Supabase Dashboard: thêm URL Vercel vào **Site URL** và **Redirect URLs**. Thiếu bước này thì chuyển hướng sau đăng nhập hỏng trên production dù local chạy tốt.

Workflow keepalive giữ nguyên — nó ping thẳng Supabase REST nên không cần route `/api/health` như spec tổng thể dự tính. Bớt được một route.

---

## 9. Giả định

1. Người dùng đã có tài khoản Vercel, hoặc sẵn sàng tạo (gói Hobby $0).
2. Giao diện tiếng Việt, nội dung học tiếng Anh — theo đúng spec tổng thể.
3. Chưa xử lý mở hai tab cùng lúc; lát 1a không có trạng thái nào xung đột được.
4. Playwright chạy trên máy người dùng và trong CI về sau, chưa dựng CI ở lát này.

---

## 10. Bước tiếp theo

Chuyển sang skill `writing-plans` để lập kế hoạch triển khai chi tiết cho lát 1a.
