# Thiết kế: Lát 1d — Trang thống kê `/stats`

> Triển khai mục 6.6 của spec tổng thể `2026-08-06-english-learning-web-design.md`.
> Lát cuối của Phase 1.

**Mục tiêu:** cho người học thấy họ đang ở đâu, tiến bộ ra sao, và cần ôn lại
những từ nào — bằng dữ liệu đã có sẵn, không thêm bảng nào.

---

## 1. Vì sao lát này không cần migration

Toàn bộ nội dung mục 6.6 dựng được từ bốn bảng đã có:

| Nội dung | Nguồn | Ghi chú |
|---|---|---|
| Số từ đã thuộc / 605 | `word_mastery.mastered` | Cột boolean, đã được `masteryDelta` duy trì từ lát 1b |
| Biểu đồ điểm qua các bài | `assessments` (`score`, `submitted_at`, `type`, `scope`) | Chỉ dòng `status = 'submitted'` |
| Từ hay sai nhất | `word_mastery.wrong_count` + `vocab_words` | **Không** đọc `assessment_items` — xem mục 4 |
| Chuỗi tuần học đều | `user_lesson_progress.completed_at` + `assessments.submitted_at` | Hai loại sự kiện học |
| Tiến độ so với 2 buổi/tuần | như trên | |
| Link luyện đề thật | tĩnh | https://study4.com/tests/toeic/ |

Không có bảng mới, không có cột mới, **không có migration nào phải dán tay**.
Đây là điểm khác biệt lớn nhất so với lát 1c và nên giữ nguyên như vậy: mọi đề
xuất thêm bảng "cho tiện thống kê" đều phải chứng minh là không tính được từ
bốn bảng trên.

## 2. Ngưỡng "đã thuộc" đã có một nguồn duy nhất

`MASTERY_THRESHOLD = 3` nằm ở `src/lib/mastery/apply.ts`, và `masteryDelta` đã
ghi sẵn cột `word_mastery.mastered` mỗi lần trả lời. `/stats` **đếm cột đó**,
không tự tính lại từ `correct_count - wrong_count`.

Lý do: tính lại là tạo bản cài đặt thứ hai của cùng một luật, và hai bản sẽ
trôi khỏi nhau đúng vào lúc ai đó đổi ngưỡng. Cột `mastered` là kết quả đã chốt
tại thời điểm trả lời; đếm nó cho ra con số khớp với thứ người học đã thấy.

## 3. Múi giờ — quyết định có hệ quả

Mọi phép gộp theo ngày và theo tuần dùng **`Asia/Ho_Chi_Minh`**, tuần bắt đầu
**thứ Hai**.

Gộp theo UTC là sai một cách âm thầm với người học Việt Nam: học lúc 21h Chủ
nhật giờ Việt Nam là 14h Chủ nhật UTC — vẫn cùng tuần, nhưng học lúc 8h sáng
thứ Hai giờ Việt Nam là 1h sáng thứ Hai UTC, và một buổi học lúc 23h thứ Hai
giờ Việt Nam rơi vào 16h thứ Hai UTC. Ranh giới lệch 7 tiếng nghĩa là các buổi
học buổi tối cuối tuần bị đếm sang tuần sau, làm đứt chuỗi mà người học không
hiểu vì sao.

`now` là **tham số** của mọi hàm thuần, không đọc `Date.now()` bên trong — đúng
khuôn `nextStep` ở lát 1c, để test kiểm được ranh giới tuần mà không phải chờ.

## 4. Vì sao "từ hay sai nhất" đọc `word_mastery` chứ không đọc `assessment_items`

`0008_assessment_items_grants.sql` đã **thu hồi quyền đọc cột `is_correct`**
khỏi `authenticated`. Thống kê từ sai dựa trên cột đó sẽ cần thêm một hàm
`security definer` nữa — tức là thêm một migration phải dán tay, thêm một bề
mặt tấn công, và thêm một chỗ có thể quên kiểm chủ sở hữu.

`word_mastery.wrong_count` cho cùng thông tin, đã được cấp quyền, và **đã cộng
dồn cả bài học lẫn bài đánh giá** — đúng cái người học muốn biết ("từ nào tôi
hay sai"), rộng hơn cả "từ nào tôi sai trong một bài kiểm tra".

## 5. Một chỗ hai con số sẽ không khớp — và vì sao không ép chúng khớp

Ghi nhận từ ledger lát 1c: khi người học **đổi đáp án** một câu trong bài đánh
giá, `answerItem` cập nhật `is_correct` của câu đó nhưng **giữ nguyên lần ghi
mastery đầu tiên** (chốt chống cộng dồn hai lần). Nên với một câu trả lời sai
rồi sửa thành đúng:

- `assessments.score` tính theo `is_correct` → tính là **đúng**
- `word_mastery.wrong_count` giữ lần ghi đầu → tính là **sai**

Hai con số này **được phép** không khớp, và `/stats` không cố gắng hoà giải:

- **Điểm một bài** trả lời câu hỏi "bài đó tôi làm thế nào" → đọc `assessments.score`
- **Đã thuộc / hay sai** trả lời câu hỏi "tôi biết những gì" → đọc `word_mastery`

Ép chúng khớp nghĩa là hoặc cộng mastery mỗi lần bấm (bơm số bằng cách bấm đi
bấm lại), hoặc chấm điểm theo lần trả lời đầu (phạt người học vì đã sửa lại cho
đúng). Cả hai đều tệ hơn việc để hai chỉ số trả lời hai câu hỏi khác nhau.

Không viết dòng giải thích này lên giao diện — nó chỉ gây hoang mang cho người
học vốn không bao giờ đặt cạnh nhau hai con số ấy. Ghi ở đây và trong chú thích
mã là đủ.

## 6. Bố cục trang

Một trang server component, năm khối, xếp dọc, tiếng Việt:

1. **Từ đã thuộc** — `N / 605`, kèm thanh tiến độ. Phụ đề: số từ đã gặp.
2. **Nhịp học** — chuỗi tuần liên tiếp có học, và tuần này đã học mấy buổi so
   với mục tiêu 2. Ngôn ngữ khích lệ, không trách móc: tuần chưa đạt thì ghi
   "còn 1 buổi nữa là đạt mục tiêu tuần này", không ghi "bạn đang chậm".
3. **Điểm các bài đã làm** — biểu đồ cột, mỗi bài một cột, màu theo đạt/chưa
   đạt, nhãn dưới là loại bài + phạm vi buổi. Không có bài nào thì hiện một
   dòng mời làm bài ôn tập đầu tiên.
4. **Từ hay sai nhất** — tối đa 10 từ, sắp theo `wrong_count` giảm dần, hiện
   `word` + `meaning_vi` + số lần sai. Chưa sai từ nào thì nói vậy.
5. **Luyện đề thật** — link ra https://study4.com/tests/toeic/, `rel="noopener
   noreferrer"`, mở tab mới.

**Biểu đồ vẽ bằng SVG nội tuyến hoặc `div` + Tailwind, KHÔNG thêm thư viện.**
Dự án này chưa có dependency nào cho biểu đồ; thêm một cái cho năm cột là đổi
ngân sách bundle của cả app để lấy một thứ 30 dòng CSS làm được.

## 7. Trang phải tới được

Thêm link `/stats` vào `AppLayout`. Không có link thì trang này không tồn tại
với người học — đúng loại lỗi đã xảy ra ở lát 1b, khi luồng học dựng xong mà
dashboard không trỏ tới.

## 8. Ranh giới module

```
src/lib/stats/
  compute.ts    hàm THUẦN: rows → số liệu. Không I/O, không Date.now().
src/app/(app)/stats/
  page.tsx      đọc 4 bảng, gọi compute, render.
src/components/stats/
  *.tsx         khối hiển thị, không chứa logic tính toán.
```

Mọi phép tính nằm trong `compute.ts` và kiểm được bằng test thuần — cùng lý do
`nextStep` và `slotAt` được tách ra ở lát 1c: ranh giới tuần, chuỗi liên tiếp
và xếp hạng là những chỗ dễ sai mà bấm qua giao diện không phát hiện ra.

## 9. Bảo mật

- Mọi truy vấn lọc `.eq("user_id", user.id)` tường minh, dù RLS đã chặn — đúng
  chuẩn đã áp cho toàn bộ lát 1c.
- **Không đọc `assessment_items`** ở lát này. Không có nhu cầu, và cột
  `is_correct` đã bị thu hồi quyền đọc.
- Trang chỉ hiện **số đếm và từ vựng**, không hiện đáp án của bất kỳ câu nào.
  `meaning_vi` đã được cấp cho `authenticated` và vốn đã nằm trong 4 phương án
  của câu chọn nghĩa, nên hiện nó không làm lộ thêm gì.
- `getUser()` chứ không `getSession()`. Không nuốt lỗi Supabase.

## 10. Kiểm thử

- **Thuần** (`tests/stats-compute.test.ts`): ranh giới tuần theo giờ Việt Nam
  (một sự kiện lúc 23h Chủ nhật và một lúc 00h30 thứ Hai phải rơi vào hai tuần
  khác nhau), chuỗi liên tiếp bị đứt, chuỗi tính tới tuần hiện tại, xếp hạng từ
  sai khi bằng điểm nhau, và trường hợp không có dữ liệu nào.
- **Playwright**: tài khoản mới vào `/stats` thấy trạng thái rỗng tử tế chứ
  không phải trang vỡ; sau khi gieo sẵn mastery và một bài đã nộp thì thấy đúng
  các con số.
- Không có test nào cần migration mới, nên bộ test phải **xanh hết ngay** —
  khác lát 1c.

## 11. Ngoài phạm vi

- Không có bảng xếp hạng, không so sánh với người khác — app một người dùng.
- Không xuất dữ liệu, không biểu đồ theo ngày, không dự đoán điểm TOEIC.
- Không đụng tới `word_mastery` / `grammar_mastery` ngoài việc **đọc**.
