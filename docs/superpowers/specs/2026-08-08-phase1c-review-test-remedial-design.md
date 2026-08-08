# Thiết kế: Phase 1c — ôn tập, kiểm tra, bổ túc

**Ngày:** 2026-08-08
**Trạng thái:** Đã duyệt thiết kế, chờ lập kế hoạch triển khai
**Tiền đề:** [Thiết kế tổng thể](2026-08-06-english-learning-web-design.md) · [Lát 1a](2026-08-07-phase1a-foundation-auth-dashboard-design.md) · [Lát 1b](2026-08-07-phase1b-lesson-flow-design.md) — cả hai đã merge và chạy trên production

---

## 1. Vì sao lát này tồn tại

Sau 1b, người học đi hết được một buổi 135 item và mở khoá buổi kế. Nhưng chương trình chỉ là 20 buổi nối đuôi nhau — không có gì kiểm chứng người học **giữ lại** được bao nhiêu sau vài tuần, và không có ngưỡng nào để nói "chưa đạt thì học lại".

Lát 1c dựng vòng lặp đó: ôn tập sau mỗi 2 buổi, kiểm tra sau mỗi 4 buổi, và bổ túc phần sai khi không đạt ngưỡng.

Còn lại sau lát này: 1d — trang thống kê.

---

## 2. Phạm vi

**Xong khi:** người học đi hết một chu kỳ đầy đủ — 4 buổi, 2 bài ôn tập, 1 bài kiểm tra 60 phút — và khi trượt một bài thì có đường bổ túc rồi làm lại để đi tiếp.

### Cố ý không làm

Trang `/stats` để 1d. Không thêm loại bài nào ngoài ba loại ở mục 4. Không làm lịch nhắc học — spec tổng thể mục 3 quyết định #2 đã chốt nhịp 2 buổi/tuần là mục tiêu nhắc nhở, không phải ràng buộc chặn.

---

## 3. Các quyết định đã chốt

| # | Vấn đề | Quyết định | Lý do |
|---|---|---|---|
| 1 | Phạm vi | **Ôn tập + kiểm tra + bổ túc trong cùng một lát** | Ba thứ dùng chung gần hết hạ tầng. Và nếu thiếu bổ túc, người trượt một bài ôn tập không có đường đi tiếp — bổ túc là nhánh thoát của chính vòng lặp lát này tạo ra |
| 2 | Hết giờ mà chưa xong | **Tự nộp, câu chưa làm tính sai** | Giống thi thật, và giữ ngưỡng 70% có nghĩa. Chấm chỉ trên số câu đã làm sẽ khiến "làm 3 câu đúng cả 3" thành 100% |
| 3 | Dashboard | **35 dòng theo trình tự** | Trung thực với nhịp học; người học thấy trước bài kiểm tra 60 phút để sắp xếp thời gian, thay vì bị ập vào bất ngờ |
| 4 | Sau khi qua bổ túc | **Làm lại chính bài đã trượt, đề mới** | Phải chứng minh đạt ngưỡng trên toàn bộ phạm vi, không chỉ phần đã sai |
| 5 | Đề của bài đánh giá | **Sinh sẵn và lưu xuống `assessment_items`** | Có đồng hồ nên bộ câu phải cố định từ lúc bắt đầu; sinh lại mỗi lần tải trang thì chỉ cần F5 tới khi gặp đề dễ |

### 3.1 Cái giá của quyết định #4, đã biết trước

Trượt một bài kiểm tra nghĩa là làm bổ túc **rồi thêm 60 phút nữa**. Đây là đánh đổi có ý thức: chặt chẽ hơn, đổi lại tốn thời gian hơn khi trượt.

### 3.2 Rủi ro chuyển tiếp, vẫn hiệu lực

Một môi trường duy nhất — test ghi thẳng vào Supabase production, nơi đã có tài khoản thật của chủ dự án. **Mọi lệnh xoá trong test phải giới hạn theo `user_id` của chính tài khoản test nó vừa tạo**, không bao giờ theo điều kiện rộng. Tài khoản test mang đuôi `@test.local` kèm timestamp.

---

## 4. Ba loại bài

| | Phạm vi | Số câu | Đồng hồ | Ngưỡng |
|---|---|---|---|---|
| Ôn tập | 2 buổi (60 từ, 2 bài ngữ pháp) | 25 = 20 từ vựng + 5 ngữ pháp | Hiển thị ~15 phút, **không khoá** | ≥ 80% |
| Kiểm tra | 4 buổi (120 từ, 4 bài ngữ pháp) | 60 = 48 từ vựng + 12 ngữ pháp | **60 phút, khoá cứng** | ≥ 70% |
| Bổ túc | Chỉ các câu đã sai ở lần trượt | Bằng số câu sai | Không | ≥ 80% |

Tỷ lệ 80/20 giữa từ vựng và ngữ pháp phản ánh trọng số chương trình: mỗi buổi có 30 từ nhưng chỉ 1 bài ngữ pháp.

Spec tổng thể mục 6.2 chỉ gọi bài kiểm tra là "khoá cứng", nên ôn tập hiển thị thời gian gợi ý nhưng không bị chặn. Ép đồng hồ lên ôn tập là thêm áp lực mà spec không đòi.

Câu hỏi từ vựng dùng lại đúng dạng **chọn nghĩa** của 1b. Câu ngữ pháp lấy từ `grammar_questions` của các bài trong phạm vi.

---

## 5. Chuỗi 35 hoạt động

### 5.1 Bố cục

20 buổi chia 5 chu kỳ, mỗi chu kỳ 7 hoạt động:

```
chu kỳ k (k = 0..4), buổi cơ sở b = 4k + 1:
  Buổi b      Buổi b+1    ÔN(b, b+1)
  Buổi b+2    Buổi b+3    ÔN(b+2, b+3)
  KIỂM TRA(b .. b+3)

5 chu kỳ × 7 = 35 slot
```

Chuỗi này **tất định** — suy ra từ chỉ số slot bằng phép chia, cùng khuôn `itemAt` ở 1b. Không lưu xuống database.

### 5.2 `nextStep()` — hàm thuần

```
nextStep(lessonProgress, assessments) → { slotIndex, action }
```

Duyệt 35 slot theo thứ tự, dừng ở slot đầu tiên chưa hoàn tất. Slot là buổi học thì tra `user_lesson_progress` như hiện nay. Slot là ôn tập hoặc kiểm tra thì tra **lần thử gần nhất** trong `assessments` khớp `(type, scope)`:

| Trạng thái lần thử gần nhất | Hành động kế tiếp |
|---|---|
| Chưa có lần nào | Làm bài đó |
| `in_progress`, chưa quá `expires_at` | Tiếp tục bài đang dở |
| `in_progress`, đã quá `expires_at` | **Đóng bài** (chấm trên những gì đã có), rồi tính lại từ đầu |
| `submitted`, `passed = true` | Sang slot kế |
| `submitted`, `passed = false`, chưa có bổ túc nào qua | Làm **bổ túc** cho lần thử đó (`parent_id` = lần thử này) |
| Có bổ túc `passed = true` trỏ tới lần thử đó | **Làm lại** bài đã trượt, đề mới |
| Bổ túc gần nhất `passed = false` | Làm lại **bổ túc**, đề từ các câu sai của lần bổ túc đó (mục 5.4) |

Bổ túc và bài làm lại **không chiếm slot riêng** — chúng là nhánh chèn động vào slot đang đứng. Chuỗi 35 slot không đổi; chỉ đường đi qua nó dài ra khi trượt.

Đây là chỗ dễ sai nhất của lát này, đúng như spec tổng thể mục 6.5 đã cảnh báo. Mọi bug kiểu "kẹt không đi tiếp được" sẽ nằm ở bảng trên. Vì vậy nó là hàm thuần, phủ test đủ mọi nhánh mà không cần dựng server — cùng lý do `lessonStatuses` và `itemAt` được tách ra ở hai lát trước.

### 5.3 Bài bổ túc thuộc về một lần thử cụ thể

Một bài bổ túc luôn gắn với **một lần thử đã trượt**. Nó lấy các `assessment_items` có `is_correct = false` của lần thử đó, không lấy gì khác — nên tự động "chỉ phần sai".

**Cần migration `0007`: thêm cột `parent_id` vào `assessments`**, tự tham chiếu, `null` với bài thường và trỏ tới lần thử đã trượt với bài bổ túc:

```sql
alter table assessments
  add column if not exists parent_id bigint references assessments(id) on delete cascade;
```

Không có nó, `nextStep` phải đoán mối liên hệ bằng `(type, scope, started_at)` — và khi một người trượt cùng một bài hai lần, hai bài bổ túc cùng `scope` chỉ phân biệt được bằng thứ tự thời gian. Đó là loại logic đúng cho tới lần đầu tiên nó sai, và khi sai thì người học bị đưa vào bài bổ túc của lần trượt cũ. Một cột khoá ngoại làm mối liên hệ trở nên tường minh.

### 5.4 Trượt chính bài bổ túc

Bổ túc cũng có ngưỡng (≥80%), nên nó cũng có thể trượt. Khi đó **làm lại chính bài bổ túc đó**, đề dựng từ các câu sai của lần bổ túc vừa rồi — `parent_id` vẫn trỏ tới lần thử gốc, không tạo tầng lồng nhau.

Nói cách khác: bổ túc là một nhánh phẳng, không phải một cây. Nếu để nó sinh bổ túc-của-bổ túc thì mỗi lần trượt lại đẻ thêm một tầng, và không có gì đảm bảo dừng.

Vòng này thu hẹp dần một cách tự nhiên vì tập câu sai chỉ nhỏ đi. Nhưng nó **không đảm bảo kết thúc** nếu người học liên tục sai đúng những từ đó — và điều đó là chấp nhận được: nghĩa là họ thật sự chưa thuộc, và đó chính là điều bài bổ túc tồn tại để phát hiện.

### 5.4 Dashboard

35 dòng theo trình tự, phân biệt bằng nhãn: `Buổi N`, `Ôn tập buổi N–M`, `Kiểm tra buổi N–M`.

Trạng thái dùng lại bốn giá trị hiện có (`locked` / `available` / `in_progress` / `completed`) cộng một giá trị mới **`failed`** cho bài đã trượt và đang chờ bổ túc. Không có nó, một bài trượt trông y hệt một bài chưa làm.

`failed` chỉ là nhãn hiển thị, suy ra từ `assessments`. Enum `lesson_status` trong database **không đổi** — nó chỉ dùng cho `user_lesson_progress`, và không bài đánh giá nào ghi vào bảng đó.

---

## 6. Đề, đồng hồ, chấm bài

### 6.1 Đề được đóng băng

Ở 1b, đề suy ra từ `position` bằng phép chia, không lưu gì. Ở 1c thì không được: có đồng hồ, nên bộ câu phải cố định từ lúc bắt đầu.

`startAssessment(type, scope)` tạo một dòng `assessments` với `expires_at`, sinh đủ N câu, ghi xuống `assessment_items`: `position`, `item_type` (`vocab` | `grammar`), `ref_id` (id từ hoặc id câu ngữ pháp), `payload` (đề bài kèm 4 phương án đã xáo).

**`payload` không chứa đáp án.** Nhưng "lấy đáp án ở đâu" phụ thuộc vào LOẠI CÂU, không phải vào lát:

- **Câu từ vựng** của 1c là câu **chọn nghĩa** (mục 4), nên đáp án đúng chính là `vocab_words.meaning_vi` — đọc thẳng, không qua RPC. Cột đó vốn đã được cấp cho `authenticated` (`0004_rls.sql:41-44`) và bản thân đáp án đúng đã nằm sẵn trong 4 phương án gửi xuống trình duyệt, nên không có gì để rò rỉ thêm. `secretFor` ở 1b cũng làm đúng như vậy với item `kind === "meaning"`.
- **Câu ngữ pháp** vẫn lấy qua RPC `answer_for_question` — `grammar_questions.answer` đã bị thu hồi khỏi `authenticated`.
- **`answer_for_word` KHÔNG dùng ở lát này.** Nó trả `blank_answer`, phục vụ câu ĐIỀN TỪ của luồng buổi học ở 1b.

Cái bẫy, ghi ra để người sau khỏi "dọn dẹp" mất sự phân biệt này: cả hai RPC đều tên là "đáp án của…", nên đọc lướt rất dễ kết luận mọi đáp án của 1c đều đi qua chúng. Nhưng `answer_for_word` trả về từ bị khoét khỏi câu ví dụ, mà chuỗi đó **không nằm trong 4 phương án** của câu chọn nghĩa — chấm bằng nó thì 20/25 câu ôn tập và 48/60 câu kiểm tra luôn sai, điểm trần còn 20%, và **không ai qua nổi ngưỡng 80%/70% của bất kỳ bài nào**. Lỗi đó im lặng với mọi test chỉ trả lời sai, nên phải có ít nhất một test trả lời ĐÚNG mới bắt được (`tests/assessment-run.test.ts`).

### 6.2 Đồng hồ ở server, và nó tự đóng bài

`expires_at` đặt lúc bắt đầu. Ba tình huống:

- **Nộp trước hạn** — chấm bình thường.
- **Nộp sau hạn** — vẫn chấm, chỉ tính những câu đã lưu trước mốc `expires_at`; câu chưa làm tính sai.
- **Bỏ ngang, không nộp** — lần sau người học quay lại, `nextStep` thấy bài `in_progress` đã quá hạn và **tự đóng**: chấm trên những gì đã có, ghi `submitted_at`. Không bài nào treo vĩnh viễn ở `in_progress`.

Đồng hồ trên màn hình chỉ đọc `expires_at` rồi đếm ngược. Sửa giờ máy hay chỉnh JavaScript đều không ảnh hưởng — server không hỏi trình duyệt bây giờ là mấy giờ.

### 6.3 Lưu từng câu

Mỗi câu trả lời ghi ngay vào `assessment_items.user_answer` và `is_correct`. Đóng nhầm tab giữa bài kiểm tra 60 phút thì vào lại vẫn còn nguyên, và đồng hồ vẫn đúng vì nó đọc `expires_at` chứ không đếm từ lúc mở trang.

Điểm cuối bài tính từ `is_correct` của toàn bộ items, không phải từ một bộ đếm riêng — nên không có hai nguồn sự thật để lệch nhau.

### 6.4 Tái dùng từ 1b, không viết lại

`gradeItem`, `masteryDelta`, `pickDistractors` dùng nguyên. Cơ chế chấm một câu ở 1c giống hệt 1b; khác biệt duy nhất là câu hỏi đọc từ `assessment_items` thay vì dựng tại chỗ, và kết quả ghi thêm vào `is_correct`.

Chấm bài vẫn cập nhật `word_mastery` và `grammar_mastery` như 1b — đó là dữ liệu `/stats` ở 1d sẽ đọc.

### 6.5 Route

```
app/(app)/
  dashboard/page.tsx        35 dòng thay vì 20
  review/[id]/page.tsx      làm bài ôn tập
  test/[id]/page.tsx        làm bài kiểm tra, có đồng hồ
  remedial/[id]/page.tsx    làm bài bổ túc
```

Ba trang dùng chung một component làm bài; khác nhau ở việc có đồng hồ hay không và ở màn hình kết quả.

---

## 7. Xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| Mất mạng lúc lưu một câu | Nút chuyển "Đang lưu…", lỗi thì hiện nút thử lại. **Không** tự sang câu sau — cùng khuôn 1b |
| Bấm nộp hai lần | Server thấy `status` đã là `submitted` thì không làm gì, trả về kết quả đã có |
| Vào bài của người khác | RLS `own_assess` (`0004_rls.sql:17-18`) chặn ở database; server kiểm thêm một lớp, không dựa vào việc giấu link |
| Bắt đầu bài mới khi đang dở bài cũ | Từ chối, đưa về bài đang dở. Một người chỉ có một bài `in_progress` tại một thời điểm |
| Supabase lỗi giữa bài kiểm tra | `error.tsx` đã có từ 1a. Đồng hồ vẫn đúng vì nó ở server — quay lại là tiếp tục, không mất giờ oan |

Dòng cuối là chỗ đồng hồ ở server trả công. Nếu đếm giờ ở trình duyệt, một lần mất mạng 5 phút hoặc là ăn gian được 5 phút, hoặc là mất trắng 5 phút.

---

## 8. Kiểm thử

### Vitest — hàm thuần

`nextStep()` phủ **toàn bộ bảng trạng thái** ở mục 5.2: chưa có lần thử, đang dở còn hạn, đang dở quá hạn, đã qua, đã trượt, bổ túc đã qua chưa thi lại, và chuỗi trượt liên tiếp. Cộng biên chuỗi: slot 0, cuối chu kỳ, slot 34, và vị trí quá biên.

### Vitest — tích hợp, chạy thật

Ba kịch bản gọi thẳng logic với tài khoản test, tuân thủ mục 3.2:

1. Làm ôn tập đạt 80% → slot kế mở
2. Làm ôn tập **trượt** → bổ túc xuất hiện → qua bổ túc → bài làm lại xuất hiện với **đề khác** → qua → slot kế mở
3. Bắt đầu kiểm tra, giả lập quá `expires_at`, quay lại → bài tự đóng, câu chưa làm tính sai, điểm đúng công thức

Kịch bản 2 là quan trọng nhất — nó chứng minh vòng thoát khi trượt thực sự khép kín, thứ mà `nextStep()` một mình không chứng minh được.

### Corpus test — mở rộng cái đã có

`tests/corpus.test.ts` ở 1b quét 2700 item của buổi học. Thêm nhánh quét đề ôn tập và kiểm tra cho cả 5 chu kỳ, khẳng định cùng những bất biến: 4 phương án phân biệt theo nội dung hiển thị, không phương án nhiễu nào là đáp án đúng thứ hai, đủ số câu.

Lỗi phương án nhiễu trùng đáp án ở 1b sống sót qua mọi tầng cho tới khi có bài test này. Phạm vi rộng hơn ở 1c (60–120 từ thay vì 30) chỉ làm nó dễ tái diễn hơn.

### Playwright — 3 kịch bản

1. Bắt đầu bài ôn tập, thấy câu đầu tiên
2. Đồng hồ bài kiểm tra đếm ngược, và còn đúng sau khi tải lại trang
3. Nộp bài rồi thấy điểm và kết quả đạt/trượt

---

## 9. Ba việc treo từ trước, gộp vào lát này

- **`signUp` chưa xử lý mã lỗi `email_exists`.** Supabase trả mã này ở một số cấu hình "Confirm email" khác; hiện chỉ `user_already_exists` được xử lý riêng, nên kênh dò email mở lại ở tầng nội dung trang nếu cấu hình đổi. Sửa một dòng.
- **`pickDistractors` có thể trả dưới 3 phương án** mà không báo gì. Phạm vi 1c rộng hơn nên còn an toàn hơn, nhưng thêm guard runtime vẫn đúng — kho 605 từ đã bị bỏ khỏi `loadContext` nên không còn lưới đỡ.
- **168/600 thẻ gặp từ ghép lại sai biến cách**, vì `blank_answer` đôi khi là dạng biến cách của `word`. Sửa bằng **một** RPC theo buổi trả 30 `blank_answer` — rẻ hơn nhiều so với 600 lượt gọi.

---

## 10. Giả định

1. Một người học chỉ làm một bài đánh giá tại một thời điểm. Mở hai tab cùng một bài sẽ được chốt kiểm tra ở mục 7 xử lý.
2. `assessments.scope` là mảng số buổi (`int[]`), đủ để phân biệt mọi bài trong chuỗi 35 slot mà không cần thêm cột.
3. Bổ túc luôn có ít nhất một câu, vì nó chỉ tồn tại sau một lần trượt, và trượt nghĩa là có câu sai.
4. Ba trang `review` / `test` / `remedial` dùng chung một component làm bài; khác nhau ở đồng hồ và màn hình kết quả.

---

## 11. Bước tiếp theo

Chuyển sang skill `writing-plans` để lập kế hoạch triển khai chi tiết cho lát 1c.
