# Thiết kế: Lát 2c — Ôn tập nhóm

> Triển khai mục 3.3 (dòng `review`) và ô "Ôn tập" của mục 5.3 trong
> `2026-08-11-phase2-vocab-first-restructure-design.md`.
> Dùng lại nguyên bộ máy bài thi đã dựng ở lát 2b.

**Mục tiêu:** ô "Ôn tập" của mỗi nhóm dẫn tới bài thi 60 câu phủ hết 60 từ của
nhóm, và bỏ chữ "sắp có" cuối cùng khỏi màn hình từ vựng.

**Không thuộc phạm vi:** lộ trình ngữ pháp (lát sau).

---

## 1. Vì sao lát này nhỏ

Gần như mọi thứ đã có. Bộ máy bài thi ở lát 2b không hề gắn cứng vào loại
`lesson`:

| Đã có | Ghi chú |
|---|---|
| `buildVocabExam(words, blankAnswers, seed, pool?)` | 60 từ cho 60 câu, chia 30–30 tự nhiên vì `Math.ceil(60/2)` |
| `createVocabExam(..., type, scope, ...)` | `type` đã nhận `"review"`; enum database cũng vậy |
| `recordAnswer`, `submitExam`, `boBaiDangLam` | không phân biệt loại bài |
| `/exam/[id]`, `/exam/[id]/ket-qua`, bài bổ túc | dùng lại nguyên vẹn |
| `PASS_MARK = 80` | một hằng số cho mọi loại |
| Đọc trạng thái ô Ôn tập | `progress.ts:149` **đã** gọi `activityState("review", lessonsOf(group), ...)` |

Cái thiếu đúng ba thứ: một Server Action dựng bài `review`, một `href` cho ô
Ôn tập, và bỏ nhánh `"sắp có"` trong `describe()`.

## 2. `scope` của bài ôn tập

`progress.ts:108` so khớp bài với ô bằng `sameScope(r.scope, scope)`, và mục Ôn
tập truyền vào `lessonsOf(group)` — tức **mảng hai ordinal buổi** của nhóm, ví
dụ nhóm 1 là `[1, 2]`.

Vậy bài `review` phải ghi `scope: [buổi₁, buổi₂]`, đúng thứ tự `lessonsOf` trả
về. Ghi sai thứ tự hoặc ghi `[groupId]` thì bài nộp xong sẽ **không khớp ô nào**
và ô Ôn tập vĩnh viễn hiện "chưa làm" — hỏng âm thầm, không có lỗi nào bật ra.

Lưu ý nợ đã biết từ lát 2b: hai nửa ứng dụng đang dựa vào việc `lessons.id` tình
cờ bằng `ordinal`. `tests/db-integrity.test.ts` đã có khẳng định giữ cho sự
trùng hợp đó vỡ ra thành tiếng nếu ai re-seed. Lát này **không** sửa nợ đó, chỉ
không được làm nó tệ hơn: dùng ordinal ở `scope`, dùng id khi truy `lesson_words`.

## 3. Dựng đề 60 câu

`buildVocabExam` nhận thẳng 60 từ; không cần hằng số mới, không cần nhánh mới.

Hai chi tiết bắt buộc:

- **Bảng đáp án phải gộp từ cả hai buổi.** `blank_answers_for_lesson` nhận đúng
  một `lesson_id`, nên phải gọi hai lần rồi trộn hai `Map` lại. Thiếu một nửa
  thì `buildVocabExam` ném ở câu điền đầu tiên thuộc buổi bị thiếu — và nó ném
  đúng như thiết kế, nhưng người học chỉ thấy trang lỗi.
- **Nguồn nhiễu là cả 60 từ**, không phải 30 của một buổi. Phủ rộng hơn thì
  phương án nhiễu sát nghĩa hơn, và bẫy đồng nghĩa một chiều đã có `reject` chặn
  từ lát 2b nên không phát sinh rủi ro mới.

Ôn tập 60 câu có thể dài (mục 11.3 spec phase 2). Giữ nguyên 60 ở lát này —
phủ hết từ là nguyên tắc đã chọn, và chưa có dữ liệu thật nào nói nó mệt.

## 4. Màn hình

Không thêm route nào. Ô "Ôn tập" ở `/vocab` đổi từ chữ chết thành nút gọi
Server Action `batDauOnTap(groupId)`, dựng bài rồi chuyển sang `/exam/[id]` —
đúng đường mà nút LÀM BÀI của buổi học đang đi.

`describe()` trong `(list)/page.tsx` bỏ nhánh `isReview ? "sắp có" : "chưa học"`.
Sau lát này ô Ôn tập là một hoạt động thật, nên "chưa học" là mô tả đúng cho nó
y như với buổi thường.

Trang kết quả và bài bổ túc dùng lại nguyên vẹn. Bổ túc của một bài `review`
lấy nguồn nhiễu từ `scope` của bài cha — hai buổi — nên `batDauBoTuc` phải xử
lý được `scope` có **hai** phần tử, không chỉ một. Đây là chỗ duy nhất trong mã
lát 2b giả định `scope[0]` là tất cả những gì cần biết.

## 5. Bẫy đã biết, phải né

- **Một bài đang làm dở cho mỗi người.** Chỉ số `assessments_one_in_progress`
  không phân biệt loại. Người đang dở bài buổi mà bấm Ôn tập sẽ được đưa về bài
  buổi đó, kèm cảnh báo lệch phạm vi đã dựng ở lát 2b. Đường này đã có, chỉ cần
  không phá.
- **`batDauBoTuc` đang đọc `scope[0]`.** Với bài `review` thì đó mới là một nửa.
  Phải sửa để gom từ của cả hai buổi.

## 6. Kiểm thử

**Unit** — `buildVocabExam` với 60 từ: đúng 60 câu, mỗi từ một câu, chia 30–30,
không rò đồng nghĩa (dùng lại khuôn test hồi quy đã có).

**Tích hợp** — bài `review` ghi đúng `scope = [buổi₁, buổi₂]`; bổ túc của một
bài `review` gom được từ của cả hai buổi.

**E2E** — bấm ô Ôn tập của nhóm 1 → vào bài thi 60 câu; nhãn ô đổi khỏi
"sắp có"; nộp xong thì ô hiện điểm.
