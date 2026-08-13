# Thiết kế: Lát 2b — Bài thi từ vựng, bổ túc, và đường ghi mastery

> Triển khai mục 3.3, 5.4 (pha THI), 5.6 và 6 của
> `2026-08-11-phase2-vocab-first-restructure-design.md`.
> Đóng lại việc bắt buộc ghi ở mục 11.1 của spec đó và mục 1–3 của
> `2026-08-12-ban-giao-lat-2b.md`.

**Mục tiêu:** nút LÀM BÀI dẫn tới một bài thi thật, chấm điểm thật, ghi tiến độ
thật, và người trượt có đường đi tiếp.

**Không thuộc phạm vi:** ôn tập nhóm 60 câu (lát sau), lộ trình ngữ pháp (lát
sau). Cả hai dùng lại đúng bộ máy dựng ở lát này.

---

## 1. Cái đã có và cái đang thiếu

Phần khó nhất đã nằm sẵn trong database và `src/`, không phải viết lại:

| Đã có | Ở đâu |
|---|---|
| Bảng `assessments`, `assessment_items`, enum đủ 4 loại | `0003`, `0010` |
| `finalize_assessment_items(id, pass_mark, now)` — chấm + đóng bài trong **một** UPDATE | `0009`, quyền đã cấp đúng cho chữ ký 3 tham số ở dòng 214–215 |
| `wrong_items_for_assessment` — từ chối cả chính chủ khi bài còn `in_progress` | `0008` |
| `answer_for_word`, `blank_answers_for_lesson` | `0006` |
| `is_correct` đã bị thu hồi SELECT khỏi `authenticated` | `0008` |
| Sinh phương án nhiễu `pickDistractors` | `src/lib/exam/distractors.ts` |
| Luật `masteryDelta` | `src/lib/mastery/apply.ts` |
| Nội dung: 605 từ, 20 buổi | đã seed |

Cái thiếu là **đường ống và giao diện**: `src/lib/assessment/` đã bị xoá ở lát
2a, `src/lib/mastery/write.ts` cũng vậy. Số bài thi đã làm hiện là **0** —
chưa ai chạm được vào phần này.

## 2. "Đã thuộc" — không phải sai lệch, mà là bất khả thi

Mục 11.1 của spec phase 2 nói ngưỡng cũ "sẽ sai lệch". Số học nói mạnh hơn thế.

Cấu trúc mới cho mỗi từ xuất hiện **đúng một câu** trong bài buổi (30 câu/30 từ)
và **đúng một câu** trong bài ôn tập nhóm (60 câu/60 từ). Bài bổ túc chỉ chứa từ
đã sai. Nên một từ **luôn trả lời đúng** được chạm **tối đa 2 lần trong cả đời**.

Luật hiện tại: thuộc khi `đúng − sai ≥ 3`. Trần đạt được là 2. Không từ nào có
thể trở thành "đã thuộc", bao giờ — thẻ "đã thuộc /605" trên dashboard sẽ vĩnh
viễn đứng ở 0.

**Quyết định: `MASTERY_THRESHOLD` từ 3 xuống 2.** "Đã thuộc" nghĩa là *đúng ở cả
bài buổi lẫn bài ôn tập nhóm* — sống sót qua hai lần kiểm riêng biệt, cách nhau
nhiều ngày. Đây là mức cao nhất mà cấu trúc mới còn cho phép đạt tới, và nó vẫn
mang nghĩa thật.

Đánh đổi phải nói rõ: số trên dashboard đứng ở 0 cho tới khi người học làm xong
bài ôn tập nhóm đầu tiên, rồi nhảy một lần tới 60. Chấp nhận, vì lựa chọn còn
lại (ngưỡng 1) biến "đã thuộc" thành "đã đoán trúng một lần" — câu 4 phương án
có 25% đoán trúng.

Ngưỡng nằm ở **một chỗ duy nhất** (`src/lib/mastery/apply.ts`) và `/stats` đếm
cột `mastered` chứ không tự tính lại — giữ nguyên nguyên tắc của lát 1d.

## 3. Bộ máy bài thi

Ba module, ranh giới rõ, mỗi cái test được riêng:

| Module | Việc | Phụ thuộc |
|---|---|---|
| `src/lib/exam/build.ts` | từ phạm vi → mảng câu hỏi (đề + 4 phương án + đáp án) | `distractors.ts`, `shuffle-options.ts` |
| `src/lib/exam/run.ts` | tạo bài, ghi đáp án từng câu, nộp bài | Supabase, `mastery/write.ts` |
| `src/lib/mastery/write.ts` | ghi `word_mastery` sau mỗi câu đúng/sai | `mastery/apply.ts` |

### 3.1 Dựng đề (`build.ts`)

Theo mục 6 của spec phase 2, không đổi:

- Hai dạng câu, cả hai đều là chọn từ: **nghĩa → từ** và **ví dụ khuyết → từ**.
- Dạng thứ hai lấy cả 4 phương án từ `blank_answer`, **không** từ `word`:
  `blankAnswer` có thể là dạng biến cách (`openings`), nên để nhiễu ở dạng gốc
  thì đáp án đúng tự lộ — nó thành phương án duy nhất khớp ngữ pháp.
- Mỗi từ trong phạm vi đúng một câu. Bài `lesson`: 30 câu, chia 15–15 hai dạng.
  Bài `remedial`: mỗi từ sai một câu, chia đôi làm tròn.
- Seed tất định: tải lại trang không đổi đề.
- **Nổ khi thiếu nguồn**, không lặng lẽ trả về đề ngắn hơn.
- Bài `remedial` có thể hẹp dưới 4 từ; khi đó nguồn nhiễu mở rộng ra phạm vi
  của bài cha.

`blank_answer` bị revoke khỏi `authenticated`, nên dựng đề **bắt buộc chạy ở
server**.

### 3.2 Chạy bài (`run.ts`)

- Bấm LÀM BÀI → Server Action dựng câu hỏi, ghi `assessments` +
  `assessment_items`. **`payload` chỉ chứa `prompt` + `options`, không bao giờ
  chứa đáp án.** Đáp án ở lại cột `ref_id` (trỏ tới `vocab_words`), và việc
  chấm đúng/sai xảy ra trên server.
- Client nhận trọn bộ câu hỏi một lần, không hỏi thêm câu nào nữa.
- Bấm một đáp án → **sang câu sau ngay**. Đáp án vào hàng đợi tuần tự gửi ở nền.
- Câu cuối: chờ hàng đợi cạn rồi gọi `finalize_assessment_items` với
  `pass_mark` và `now` truyền từ TypeScript.
- Mất mạng: hàng đợi thử lại; còn câu chưa gửi được thì **chặn nộp** và nói rõ.
- Đóng nhầm tab vào lại vẫn còn bài, vì trạng thái nằm ở server.

**`PASS_MARK` là một hằng số 80% cho mọi loại bài** — không phải
`Record<AssessmentType, number>`. Cả bốn loại dùng chung một con số.

### 3.3 Đường ghi mastery (`write.ts`)

Dựng lại tệp đã bị xoá, mang theo hai bài học đã trả giá (ghi trong
`git show 93b7920:src/lib/mastery/write.ts`):

1. **Bắt buộc `throw` khi lỗi đọc.** Nuốt lỗi khiến `current = null`,
   `masteryDelta` tính lại từ 0, rồi `upsert` **ghi đè sạch** toàn bộ tiến độ
   đã tích luỹ mà không ai biết. Đây là mất dữ liệu âm thầm, không phải một lần
   hiển thị sai.
2. `grammar_mastery` khoá theo `(user_id, grammar_lesson_id)`, **không** suy ra
   được từ `question_id`. Lát này chưa dùng nhánh grammar nhưng ranh giới phải
   đúng từ đầu.

Câu từ vựng ghi `word_mastery`; **đúng và sai đều đếm**. Trả lời lại cùng một
câu **không** được cộng mastery hai lần.

## 4. Màn hình

| Route | Nội dung |
|---|---|
| `/exam/[id]` | làm bài: một câu mỗi lần, dải đúng/sai của câu trước, thanh tiến độ |
| `/exam/[id]/ket-qua` | điểm, đạt/chưa đạt, danh sách từ sai kèm nghĩa |

Xoá `/vocab/learn/[lessonId]/sap-co` — nút LÀM BÀI trỏ thẳng vào Server Action
dựng bài rồi chuyển tới `/exam/[id]`.

Trang kết quả (mục 5.6 spec phase 2):
- Chưa đạt → nút **"Bổ túc N từ sai"**, dựng bài `remedial` với `parent_id`
  trỏ về bài vừa trượt.
- Đạt bổ túc → nút **"Làm lại bài"**, dựng lại bài chính cùng phạm vi, seed mới.
- Trượt bổ túc → bổ túc tiếp, dựng từ các từ sai của chính lần bổ túc đó.

Danh sách từ sai lấy qua `wrong_items_for_assessment`, hàm này từ chối khi bài
còn `in_progress` — kể cả với chính chủ.

## 5. Nhịp học trên `/stats`

`/stats` đang hiện `0/2` và streak `0` cho mọi người, vì nhịp học đo **duy nhất**
bằng bài đã nộp mà lát 2a cố ý chưa có bài thi nào. Lát này làm nó có số thật mà
không phải sửa gì.

**Quyết định: không gộp `lesson_cursor.updated_at` vào `eventTimes`.** Tài liệu
bàn giao chỉ rõ cột đó chỉ có `default now()`, **không có trigger `ON UPDATE`** —
mọi đường ghi hiện tại tự set nó bằng tay. Biến nó thành load-bearing nghĩa là
một đường ghi mới quên set sẽ làm hỏng thống kê âm thầm. Đo bằng bài đã nộp là
một nguồn sự thật, được database bảo đảm.

Hệ quả chấp nhận: đọc thẻ mà không thi thì không tính là buổi học. Nút LÀM BÀI
nằm ngay trong trang học nên khoảng cách này hẹp.

## 6. Khẳng định an toàn phải dựng lại thành test

Mục 1 của tài liệu bàn giao liệt kê những khẳng định mất theo 12 tệp test bị xoá
ở lát 2a. Lát này phải trả lại, vì chúng bảo vệ thứ vẫn còn giá trị:

1. `is_correct` bị từ chối SELECT với `authenticated` (lỗi `42501`) trong khi
   các cột khác của `assessment_items` vẫn đọc được.
2. `wrong_items_for_assessment` từ chối **cả chính chủ** khi bài còn
   `in_progress` — chặn dò từng câu để biết đúng/sai.
3. `payload` không bao giờ chứa đáp án.
4. CAS chặn double-submit song song: đúng một lần thắng.
5. `finalize_assessment_items` từ chối người không phải chủ, và chặn
   `p_pass_mark`/`p_now` NULL (`22004`).
6. Câu từ vựng ghi `word_mastery` đúng luật; trả lời lại không cộng hai lần.

## 7. Kiểm thử

**Unit** — hàm thuần, không mạng:
- `build.ts`: đủ số câu, mỗi từ đúng một lần, chia 15–15, cùng seed cho cùng đề,
  nổ khi nguồn thiếu, phương án nhiễu không trùng đáp án.
- `apply.ts`: ngưỡng mới — đúng 1 lần chưa thuộc, đúng 2 lần thuộc, đúng 2 sai 1
  chưa thuộc. `tests/mastery.test.ts` hiện khẳng định ngưỡng 3, nên **phải sửa
  cùng lúc** với hằng số; để nguyên thì nó đỏ, và sửa nó cho xanh mà không đọc
  mục 2 ở trên là cách nhanh nhất để mất lý do.

**Tích hợp (Supabase thật)** — sáu khẳng định ở mục 6.

**E2E** — làm trọn một bài: vào trang học → LÀM BÀI → trả lời 30 câu → thấy
điểm; trượt thì thấy nút bổ túc và làm được bài bổ túc.

## 8. Rủi ro đã biết

- **Hai tab cùng làm một bài** (mục 11.6 spec phase 2): CAS ở `finalize` chặn
  double-submit, nhưng hai tab vẫn ghi đáp án chồng nhau. Chấp nhận như thiết kế
  gốc; không thêm khoá.
- **Bài thi 30 câu là lần đầu người học gặp phần chấm điểm.** Nếu `build.ts` nổ
  vì thiếu nguồn nhiễu trên một buổi cụ thể, người học không vào thi được. Test
  dựng đề phải chạy trên **cả 20 buổi**, không phải một buổi mẫu.
