# Thiết kế: lát 1b — luồng học `learn/[lessonId]`

**Ngày:** 2026-08-10
**Trạng thái:** Đã duyệt thiết kế, chờ lập kế hoạch triển khai
**Tiền đề:** [Thiết kế tổng thể](2026-08-06-english-learning-web-design.md) §6.3 · [Lát 1a](2026-08-07-phase1a-foundation-auth-dashboard-design.md) · [Ô gõ lại từ](2026-08-10-vocab-typing-field-design.md)

---

## 1. Phạm vi

**Xong khi:** học được trọn một buổi — 3 cụm × 10 từ, rồi chốt buổi gồm 10 câu trộn và bài ngữ pháp — `word_mastery` và `grammar_mastery` có số liệu thật, buổi chuyển `completed` và buổi kế mở khoá trên dashboard.

Lát 1a để lại `learn/[lessonId]` là trang tạm ghi *"Buổi N — triển khai ở lát 1b"*. Lát này thay trang đó bằng luồng học thật.

### Cố ý không làm ở lát này

Ôn tập · kiểm tra 60 phút · bổ túc · `/stats` · bảng `assessments` (lát 1c mới đụng tới).

---

## 2. Ràng buộc chặn: app không có đường nào chấm điểm

Phải giải trước mọi thứ khác, vì nó quyết định toàn bộ kiến trúc còn lại.

`0004_rls.sql:41-48` thu hồi khỏi vai `authenticated` ba cột: `vocab_words.blank_answer`, `grammar_questions.answer`, `grammar_questions.explanation`. Spec 1a §5.1 lại cấm `service_role` xuất hiện trong `src/`.

Điểm dễ hiểu nhầm: **Server Component không đặc quyền hơn trình duyệt.** Nó dùng JWT của chính người dùng qua `@supabase/ssr`, nên cũng chạy dưới vai `authenticated`. Chuyển việc chấm điểm "lên server" theo nghĩa Next.js không gỡ được gì cả.

### 2.1 Ba hướng đã cân nhắc

| | Cách | Đánh giá |
|---|---|---|
| **A** | Hàm Postgres `SECURITY DEFINER`, gọi qua `supabase.rpc()` | **Chọn.** Đáp án không rời database. RLS vẫn bật khắp nơi. Không có `service_role` trong `src/`. Cùng khuôn với trigger `0005_profile_trigger.sql` |
| B | Server Action dùng client `service_role` | Phá §5.1 của lát 1a. Khoá đó bỏ qua **toàn bộ** RLS, nên sai một mệnh đề `where` là đọc/ghi được dữ liệu người khác — đúng loại lỗi mà RLS sinh ra để chặn |
| C | Route handler `/api/grade` + `service_role` | Cùng vấn đề với B. Vấn đề không nằm ở Server Action hay route handler, mà ở **vai nào** chạy truy vấn |

Hướng A giữ được một bất biến quý: trong toàn bộ hệ thống chỉ có script seed và global setup của Playwright dùng `service_role`, cả hai chạy trên máy chứ không lên Vercel.

### 2.2 Hai hàm trong `0006_grading.sql`

```sql
submit_cluster(p_lesson_id bigint, p_cluster smallint, p_answers jsonb)
  returns jsonb   -- [{word_id, correct, correct_answer}]

submit_session_final(p_lesson_id bigint, p_vocab jsonb, p_grammar jsonb)
  returns jsonb   -- {score, vocab:[...], grammar:[{question_id, correct, answer, explanation}]}
```

Bốn quy tắc bắt buộc, mỗi quy tắc bịt một cách hàm `SECURITY DEFINER` trở thành lỗ hổng:

1. **`set search_path = public`** trên cả hai hàm. Thiếu dòng này, người gọi tự trỏ `search_path` sang schema của mình và ép hàm chạy bảng giả.
2. **Không nhận `user_id` qua tham số.** Người học lấy từ `auth.uid()` bên trong hàm. Tham số hoá danh tính là cách kinh điển biến một hàm định danh thành hàm mạo danh.
3. **`revoke execute from public, anon` rồi mới `grant execute to authenticated`.** Postgres mặc định cấp `execute` cho `public`; không thu hồi thì khách chưa đăng nhập gọi được.
4. **Con trỏ tiến độ do hàm tự đẩy**, không lấy từ tham số ngoài `p_cluster` dùng để đối chiếu (xem §4.3).

---

## 3. Quyết định đã chốt

| # | Vấn đề | Quyết định | Lý do |
|---|---|---|---|
| 1 | Chấm điểm | Hàm `SECURITY DEFINER` gọi qua RPC | §2 |
| 2 | Mất kết nối giữa buổi | Ghi mốc **theo cụm**, 3 mốc mỗi buổi | Vào lại mất tối đa 10 từ. Khớp đúng cấu trúc 3 cụm của spec tổng thể §6.3 |
| 3 | Hoàn tất buổi | Đi hết là `completed`, **không có ngưỡng** | Cổng chặn thật là bài ÔN TẬP sau mỗi 2 buổi (≥80%). Hai lớp cổng chồng nhau làm tiến độ dễ tắc mà không thêm giá trị học tập |
| 4 | Ngữ pháp cuối buổi | Đọc `content_md` rồi làm hết câu của bài, **trần 25 câu** | §5.3 |
| 5 | Bước ② có ghi mastery không | **Không** | §4.2 |

---

## 4. Kiến trúc

### 4.1 Bố cục

```
src/
  app/(app)/learn/[lessonId]/page.tsx   Server Component: nạp 30 từ + con trỏ
  components/
    word-card.tsx                       đã thiết kế riêng, xem tiền đề
    learn/cluster-meet.tsx              ① GẶP TỪ
    learn/cluster-practice.tsx          ② LUYỆN
    learn/cluster-confirm.tsx           ③ CHỐT
    learn/session-final.tsx             CHỐT BUỔI
  lib/learn/
    session-state.ts                    hàm thuần: con trỏ → bước kế tiếp
    build-practice.ts                   hàm thuần: 10 từ → câu hỏi ② + nhiễu
supabase/migrations/0006_grading.sql
```

Server Component chỉ nạp dữ liệu. Cả buổi học là một máy trạng thái ở client, chấm dứt bằng bốn lượt gọi RPC.

### 4.2 Chấm ở đâu — chia theo dữ liệu đọc được

Ranh giới không phải "client hay server" mà là **"dữ liệu cần để chấm có đọc được không"**:

| Bước | Cần gì để chấm | Chấm ở đâu | Ghi mastery |
|---|---|---|---|
| ① GẶP TỪ | — | không chấm | không |
| ② LUYỆN | `meaning_vi`, `synonyms` — đọc được | client, phản hồi tức thì | **không** |
| ③ CHỐT | `blank_answer` — bị chặn | `submit_cluster` | có |
| CHỐT BUỔI | `blank_answer` + `answer` — bị chặn | `submit_session_final` | có |

**Bước ② không ghi mastery là cố ý.** Client tự chấm thì client tự khai được kết quả. Mastery mà khai man được thì bài bổ túc ở lát 1d — thứ đọc thẳng `word_mastery` để biết từ nào đang sai — dựng trên dữ liệu rác. Để ② làm đúng việc của nó (luyện có phản hồi ngay) và để mastery chỉ nhận số liệu server đã xác minh.

Đây là chỗ thiết kế này **chặt hơn** giới hạn mà spec tổng thể §5.1 chấp nhận. Không phải vì lo người học gian lận — tự học thì gian lận là tự hại — mà vì `word_mastery` là *đầu vào của một tính năng khác*, không phải bảng điểm để ngắm.

### 4.3 Con trỏ tiến độ

Thêm cột trong `0006`:

```sql
alter table user_lesson_progress
  add column clusters_done smallint not null default 0;
-- 0 = chưa bắt đầu · 1..3 = đã xong cụm n · 4 = xong chốt buổi (status = 'completed')
```

`submit_cluster` nhận `p_cluster` và **từ chối nếu `p_cluster <> clusters_done + 1`**. Hai lợi ích từ một điều kiện:

- Nhảy cóc bị chặn: không nộp thẳng cụm 3 khi chưa làm cụm 1.
- Gửi trùng thành vô hại: bấm hai lần hoặc thử lại sau khi mạng chập chờn thì lượt thứ hai bị từ chối bằng một mã lỗi riêng, client hiểu đó là *"cụm này đã ghi rồi"* và đi tiếp thay vì cộng đôi mastery.

Hàm cũng kiểm tra buổi đã mở khoá: `ordinal = 1`, hoặc buổi liền trước có dòng `status = 'completed'`.

**Giới hạn được thừa nhận:** luật mở khoá lúc này tồn tại ở hai nơi — `lib/curriculum/lesson-status.ts` (lát 1a, quyết định hiển thị) và điều kiện SQL trên (quyết định ghi). Hai bản có thể lệch pha. Chấp nhận vì bản SQL chỉ cần chặn trường hợp thô thiển nhất, còn hợp nhất chúng đồng nghĩa với việc chuyển toàn bộ `nextStep()` xuống database — trong khi spec tổng thể §6.5 đã chốt đó phải là hàm thuần TypeScript để kiểm thử được mọi nhánh. Lệch pha ở đây là cái giá rẻ hơn.

---

## 5. Luồng một buổi học

### 5.1 Một cụm = một lượt ghi

```
CỤM n:  ① 10 thẻ từ (kèm ô gõ lại từ)
        ② luyện — chấm tại chỗ, không gửi gì lên server
        ③ 10 câu điền từ vào câu ví dụ
              └── submit_cluster(lesson, n, answers)
                    ├── chấm bằng blank_answer
                    ├── cộng word_mastery cho 10 từ
                    └── clusters_done := n
```

3 cụm + 1 chốt buổi = **4 lượt gọi server cho cả buổi**.

Bước ③ nộp cả 10 câu một lượt rồi mới hiện kết quả, chứ không chấm từng câu. Vừa hợp nghĩa "chốt", vừa giữ số lượt gọi ở mức 1 mỗi cụm.

### 5.2 Cập nhật `word_mastery`

Hàm chỉ cộng `correct_count` / `wrong_count` và đặt `last_seen_at`. Cột `mastered` **không** do hàm gán, mà chuyển thành cột sinh trong `0006`:

```sql
mastered boolean generated always as (correct_count - wrong_count >= 3) stored
```

Luật "đúng nhiều hơn sai từ 3 lượt trở lên" nằm đúng một chỗ và không thể lệch với dữ liệu đếm. Đổi ngưỡng về sau cần một migration — đó là cái giá phải trả, và là cái giá đúng: ngưỡng này quyết định từ nào bị lôi vào bài bổ túc, không phải thứ nên sửa được từ nhiều nơi.

Postgres không đổi tại chỗ một cột thường thành cột sinh, nên `0006` phải `drop column mastered` rồi `add column` bản sinh. Thao tác đó xoá dữ liệu cột — an toàn ở đây vì `word_mastery` chưa có dòng nào (lát 1b là thứ đầu tiên ghi vào bảng này) và không chỗ nào trong `src/`, `scripts/`, `tests/` đang đọc hay ghi cột `mastered`. Nếu tới lúc chạy migration mà điều kiện đó không còn đúng, phải dừng lại xem xét thay vì cứ chạy.

Chọn hiệu số thay vì `correct_count >= 3 and wrong_count = 0` vì công thức sau khiến một từ lỡ sai một lần thì vĩnh viễn không bao giờ thuộc.

### 5.3 Chốt buổi và trần 25 câu

```
CHỐT BUỔI:  10 câu điền từ, trộn cả 30 từ của buổi (chọn tất định)
            đọc bài ngữ pháp (content_md)
            câu hỏi ngữ pháp của bài, TỐI ĐA 25 CÂU
              └── submit_session_final(lesson, vocab, grammar)
                    ├── chấm vocab bằng blank_answer
                    ├── chấm grammar bằng answer, trả kèm explanation
                    ├── cộng word_mastery + grammar_mastery
                    └── clusters_done := 4, status := 'completed', score := ...
```

19/20 buổi có 20–25 câu ngữ pháp nên trần 25 không cắt gì. Buổi 2 (`danh-tu-tinh-tu-va-trang-tu`) có **100 câu** — gấp bốn lần phần còn lại, di sản của tập bài tập gốc. Làm hết ở một buổi là ngồi hơn hai tiếng.

Trần 25 giữ nguyên trải nghiệm cho 19 buổi, và biến điểm dị thường của buổi 2 thành lợi thế: 75 câu còn lại là kho câu **chưa từng gặp** cho ôn tập và kiểm tra ở lát 1c. Cách chọn 25 câu phải **tất định theo `lesson_id`** để vào lại buổi 2 không ra một bộ khác.

`explanation` chỉ theo kết quả trả về **sau khi nộp**, không bao giờ nằm trong dữ liệu tải trang.

---

## 6. Sinh phương án nhiễu cho bước ②

Sinh ở client, tất định, lấy từ chính 30 từ của buổi — dữ liệu đó đã có sẵn trên trang, không tốn thêm truy vấn.

Nhiễu phải **cùng từ loại** với đáp án khi trong buổi còn đủ từ cùng loại để chọn. Không cùng từ loại thì câu *"chọn nghĩa của concern (n)"* có ba phương án là động từ, và người học loại trừ đúng mà không cần biết nghĩa — câu hỏi đo được kỹ năng đọc từ loại chứ không đo được từ vựng.

Dùng lại `src/content/shuffle-options.ts` có từ Phase 0 thay vì viết bộ trộn thứ hai.

Ba dạng câu ở bước ②, theo spec tổng thể §6.3: trắc nghiệm nghĩa · chọn từ đồng nghĩa (`SYN`) · ghép nối từ ↔ nghĩa. Từ nào `synonyms` rỗng thì bỏ dạng thứ hai cho từ đó, không dựng câu hỏi khuyết.

---

## 7. Xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| Mất mạng lúc nộp cụm | Đáp án còn trong state client, hiện nút thử lại. Không rơi khỏi cụm, không mất bài |
| Nộp trùng (bấm hai lần, thử lại sau timeout) | Hàm từ chối bằng mã lỗi riêng; client coi như đã ghi và đi tiếp. Mastery không cộng đôi |
| Nộp cụm sai thứ tự | Hàm từ chối; client nạp lại con trỏ từ server rồi nhảy về đúng cụm |
| Vào `/learn/[id]` của buổi chưa mở khoá | Server Component đẩy về `/dashboard`. Hàm RPC vẫn kiểm tra lần nữa |
| Supabase ngủ | `error.tsx` của nhóm `(app)` từ lát 1a lo, không thêm gì |

---

## 8. Kiểm thử

### Vitest — hai hàm thuần

`build-practice.ts`: nhiễu không bao giờ trùng đáp án · ưu tiên cùng từ loại · từ không có `synonyms` thì không sinh câu dạng SYN · cùng đầu vào ra cùng kết quả.

`session-state.ts`: mọi giá trị con trỏ 0–4, cộng giá trị lệch ngoài khoảng (dữ liệu hỏng thì không được văng, phải đưa về một trạng thái hiển thị được).

### Test RPC — theo khuôn `tests/rls.test.ts`

Khuôn đó đã chứng minh là sạch (dựng rồi xoá dữ liệu bằng `afterAll`). Bốn điều cần khẳng định:

1. User A gọi `submit_cluster` không ghi được vào `word_mastery` của user B.
2. Sau khi thêm hai hàm, `authenticated` **vẫn không** select thẳng được `blank_answer` và `answer` — hàm mở một cửa hẹp chứ không nới quyền cột.
3. `anon` không `execute` được hai hàm.
4. Nộp cụm sai thứ tự và nộp trùng đều bị từ chối, và `word_mastery` không đổi sau lượt bị từ chối.

### Playwright

Đi trọn cụm 1, tải lại trang, kiểm chứng vào lại đúng đầu cụm 2. Đây là kịch bản mà unit test mù, vì nó xuyên qua RPC, cookie và Server Component.

---

## 9. Giả định và việc còn mở

1. Lát 1a đã xong. Lát 1b dựng trên `middleware`, `(app)/layout.tsx` và `lessonStatuses()` của lát đó.
2. Ngưỡng `mastered` đặt ở hiệu số 3 (§5.2). Con số này chưa có dữ liệu thực nghiệm nào chống lưng; nó sẽ được xem lại khi lát 1d dùng `word_mastery` để dựng bài bổ túc và thấy bài bổ túc quá dài hay quá ngắn.
3. Cách chọn 10 câu chốt buổi và 25 câu ngữ pháp đều tất định theo `lesson_id`; hàm chọn cụ thể chốt ở bước lập kế hoạch.
4. Chưa xử lý mở hai tab cùng học một buổi. Điều kiện `p_cluster = clusters_done + 1` khiến tab chậm hơn bị từ chối, nên hậu quả xấu nhất là một tab báo lỗi — chấp nhận được ở lát này.
5. Bài ngữ pháp hiển thị `content_md` bằng markdown; các file ngữ pháp Phase 0 dùng nhiều bảng so sánh hai cột, nên bộ render phải bật hỗ trợ bảng.

---

## 10. Bước tiếp theo

Chuyển sang skill `writing-plans` để lập kế hoạch triển khai chi tiết cho lát 1b.
