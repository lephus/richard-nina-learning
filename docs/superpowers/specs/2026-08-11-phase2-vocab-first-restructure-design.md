# Thiết kế: Phase 2 — tái cấu trúc lấy từ vựng làm trung tâm

**Ngày:** 2026-08-11
**Trạng thái:** Đã duyệt thiết kế, chờ lập kế hoạch triển khai
**Thay thế:** phần 6.1–6.4 của `2026-08-06-english-learning-web-design.md` (nhịp 35 slot, cấu trúc buổi 135 item, route)

---

## 1. Vì sao có lát này

App hiện tại chạy đúng theo thiết kế gốc nhưng ba chỗ đi ngược cách người học thật sự muốn dùng:

| Hiện trạng | Vấn đề |
|---|---|
| Một buổi = 30 từ **và** 1 bài ngữ pháp, trộn trong 135 item | Không chọn được hôm nay học gì |
| 35 hoạt động khoá tuần tự | Muốn ôn nhóm 7 phải đi hết nhóm 1–6 |
| 135 item một chiều, vị trí do server giữ | Không quay lại được từ vừa đọc; mỗi bước một vòng mạng |

Lát này tách hai lộ trình, đổi đơn vị học từ *item* sang *từ*, mở khoá toàn bộ, và cắt gần hết số lần gọi mạng trong lúc học.

**Ràng buộc $0/tháng của thiết kế gốc giữ nguyên** và không đánh đổi. Không thêm thư viện, không gọi AI lúc chạy, không dịch vụ mới.

---

## 2. Các quyết định đã chốt

| # | Vấn đề | Quyết định |
|---|---|---|
| 1 | Ngữ pháp | **Tách sạch** thành lộ trình độc lập. Buổi từ vựng thuần từ vựng; ôn tập nhóm chỉ 60 từ |
| 2 | Bài kiểm tra 4 buổi / 60 phút | **Bỏ hẳn**, cùng toàn bộ cơ chế đồng hồ khoá cứng |
| 3 | Buổi ôn tập của nhóm | Chỉ là bài thi. "Xem lại từ" tách thành tính năng riêng, mở được từ nhóm bất kỳ, lúc nào cũng được |
| 4 | Cấu trúc buổi học | **30 thẻ từ đi tới/lui tự do** + mục lục nhảy nhanh → bấm "Làm bài" → bài thi tuần tự |
| 5 | Dạng bài thi | 30 câu **trắc nghiệm chọn từ**, phủ hết 30 từ: 15 câu nghĩa→từ, 15 câu ví dụ khuyết→từ |
| 6 | Khi chưa đạt | **Giữ nguyên cơ chế bổ túc**, áp cho cả bài cuối buổi lẫn ôn tập nhóm |
| 7 | Dashboard | 2 thẻ chọn lộ trình + 4 số liệu tóm tắt; `/stats` giữ vai trò chi tiết |
| 8 | Trang từ vựng | Danh sách dọc 10 nhóm, 3 ô hoạt động nằm ngang — một lần bấm là vào học |
| 9 | Mục lục từ vựng | **Cột cố định bên trái** ở màn rộng, thu thành ngăn trượt ☰ ở màn hẹp — một component, hai trạng thái |
| 10 | Lộ trình ngữ pháp | 20 bài chọn tự do: đọc lý thuyết → trắc nghiệm → ghi điểm. Không nhóm, không bổ túc |
| 11 | Phản hồi trong bài thi | **Không chặn**: bấm đáp án là sang câu sau ngay, đúng/sai hiện khi server trả lời |
| 12 | Dữ liệu học tập cũ | **Xoá sạch tiến độ**, giữ nội dung và tài khoản. Không cần đường tương thích ngược |

---

## 3. Cấu trúc chương trình

### 3.1 Nhóm là phép chia, không phải bảng

20 buổi giữ nguyên (nội dung đã seed: 20 × 30 từ). **Nhóm `g` gồm buổi `2g−1` và `2g`** → đúng 10 nhóm, suy ra bằng số học, không lưu xuống database. Cùng khuôn tất định mà `itemAt`/`slotAt` đang dùng.

```
Nhóm 1: buổi 1, buổi 2       Nhóm 6:  buổi 11, buổi 12
Nhóm 2: buổi 3, buổi 4       Nhóm 7:  buổi 13, buổi 14
…                            …
Nhóm 5: buổi 9, buổi 10      Nhóm 10: buổi 19, buổi 20
```

Mỗi nhóm có **3 hoạt động**: Buổi A (30 từ) · Buổi B (30 từ) · Ôn tập (60 từ).
Cộng thêm một lối vào không tính là hoạt động: **Xem lại 60 từ**.

### 3.2 Không còn khoá

Không nhóm nào, không hoạt động nào bị khoá. Người học vào thẳng nhóm 7 khi chưa động tới nhóm 1 cũng được.

Hệ quả trực tiếp: **chuỗi 35 slot chết hẳn**. `lib/assessment/slots.ts`, `next-step.ts`, `current-step.ts` bị xoá — khoảng 400 dòng logic khó nhất hệ thống, gồm cả nhánh "trượt → bổ túc → làm lại" chạy xuyên slot. Thay bằng `lib/curriculum/groups.ts` (số học thuần) và `lib/curriculum/progress.ts` (đọc trạng thái từng nhóm).

### 3.3 Mọi thứ chấm điểm đều là một "bài thi"

Trước lát này có hai khái niệm song song: buổi học tự giữ điểm trong `user_lesson_progress`, còn ôn tập/kiểm tra là `assessments`. Giờ chỉ còn một.

| Loại | Phạm vi | Số câu | Ngưỡng đạt | Trượt thì |
|---|---|---|---|---|
| `lesson` | 1 buổi · 30 từ | 30 | 80% (24/30) | → bổ túc |
| `review` | 1 nhóm · 60 từ | 60 | 80% (48/60) | → bổ túc |
| `remedial` | các từ sai của bài cha | = số từ sai | 80% | → bổ túc tiếp |
| `grammar` | 1 bài ngữ pháp | = số câu có sẵn của bài | 80% | không có bổ túc |

**Ngưỡng đạt là một hằng số 80% cho mọi loại** — không còn `Record<AssessmentType, number>` như hiện tại, vì cả bốn loại giờ dùng chung một con số.

**Ôn tập nhóm phủ hết 60 từ**, theo đúng nguyên tắc đã chọn cho buổi học ("không từ nào lọt"). Với luồng bấm-là-sang-câu-sau, 60 câu tốn ~7–8 phút. Nếu thấy dài, hạ xuống 30 câu ưu tiên từ đang sai là đổi một hằng số trong `lib/exam/build.ts`.

---

## 4. Mô hình dữ liệu

### 4.1 Giữ nguyên

Toàn bộ nội dung — `vocab_words`, `grammar_lessons`, `grammar_questions`, `lessons`, `lesson_words` — cùng `profiles`, `word_mastery`, `grammar_mastery`, `assessment_items`.

Giữ nguyên cả **mọi RLS và mọi RPC giữ đáp án ngoài tầm trình duyệt**: `answer_for_word`, `answer_for_question`, `blank_answers_for_lesson`, `finalize_assessment_items`, `wrong_items_for_assessment`. Các cột `vocab_words.blank_answer` và `grammar_questions.answer` vẫn bị revoke khỏi `authenticated` và `anon`.

### 4.2 Xoá

**Đồng hồ khoá cứng, toàn bộ.** `assessments.expires_at`, giá trị `assessment_status='expired'`, `components/assessment/countdown.tsx`, `closeExpiredAction`, `DURATION_MS`, `HARD_LOCKED`. Bài bỏ ngang không hết hạn nữa; bắt đầu lại một bài cùng phạm vi thì **huỷ bài đang dở** (xoá dòng `in_progress` cũ) rồi dựng bài mới.

**Trạng thái buổi lưu song song.** Bỏ `lesson_status` enum và các cột `status`, `score`, `completed_at`, `position`, `final_correct` của `user_lesson_progress`. Trạng thái mọi hoạt động **suy từ `assessments`**, không lưu ở hai nơi.

> Điều này diệt luôn cái bẫy đã ghi chú kỹ trong `lesson-status.ts`: cột `status` mặc định `'locked'` khiến một INSERT không set tường minh sẽ khoá nhầm một buổi đang mở. Không còn cột thì không còn bẫy.

### 4.3 Đổi

`user_lesson_progress` → **`lesson_cursor`**. Tên cũ hứa "tiến độ" mà bảng mới chỉ giữ chỗ đang đọc. Không `alter` dần từng cột — **`drop table user_lesson_progress` rồi `create table lesson_cursor`**, vì mọi cột cũ trừ khoá chính đều bị bỏ và dữ liệu đã xoá sạch.

```sql
create table lesson_cursor (
  user_id    uuid   not null references auth.users(id) on delete cascade,
  lesson_id  bigint not null references lessons(id),
  word_index int    not null default 0 check (word_index between 0 and 29),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
```

Enum `assessment_type`: `review|test|remedial` → `lesson|review|remedial|grammar`. PostgreSQL không xoá được giá trị enum, nên dựng type mới, chuyển cột, drop type cũ — an toàn vì dữ liệu người học đã xoá sạch.

### 4.4 Thêm

```sql
create table word_notes (
  user_id    uuid   not null references auth.users(id) on delete cascade,
  word_id    bigint not null references vocab_words(id),
  body       text   not null default '' check (char_length(body) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (user_id, word_id)
);
-- RLS bắt buộc: chỉ đọc/ghi dòng của chính mình.

alter table assessments
  add column grammar_lesson_id bigint null references grammar_lessons(id),
  add constraint assessments_grammar_scope
    check ((type = 'grammar') = (grammar_lesson_id is not null));
```

Ngữ pháp có **cột riêng** thay vì nhét id bài vào `scope int[]`: `scope` đang mang *ordinal buổi từ vựng* (1..20), còn id bài ngữ pháp là một hệ số hoàn toàn khác. Trộn hai hệ vào một cột là đúng loại lỗi không báo, không vỡ, chỉ sai.

Trần 2000 ký tự cho ghi chú đặt ở tầng database chứ không chỉ ở form: form là lớp chặn dễ đi vòng nhất.

### 4.5 Xoá dữ liệu người học

Migration xoá thẳng `assessment_items`, `assessments`, `word_mastery`, `grammar_mastery` (và `user_lesson_progress` biến mất cùng bảng, mục 4.3) **trước** khi đổi schema — thứ tự này quan trọng vì việc dựng lại enum `assessment_type` chỉ an toàn khi bảng đã rỗng. Giữ `auth.users` và `profiles`.

---

## 5. Màn hình và luồng

### 5.1 Route

```
(app)/
  dashboard                 2 thẻ chọn lộ trình + 4 số liệu
  vocab                     10 nhóm, danh sách dọc
  vocab/learn/[lessonId]    30 thẻ tự do
  vocab/browse/[groupId]    xem lại 60 từ
  exam/[id]                 bài thi — dùng chung cả 4 loại
  grammar                   20 bài
  grammar/[lessonId]        lý thuyết + nút Làm bài
  stats                     giữ, bỏ khái niệm 35 slot
```

`/learn/[lessonId]` và `/assessment/[id]` cũ chuyển vào đây. `exam` nằm ở gốc chứ không dưới `vocab` vì lộ trình ngữ pháp dùng chung.

### 5.2 Dashboard

Hai thẻ lớn (**Từ vựng** · **Ngữ pháp**) và một dải 4 số liệu:

| Số liệu | Nguồn |
|---|---|
| Từ đã thuộc / 605 | `word_mastery.mastered` |
| Nhóm hoàn thành / 10 | `progress.ts` — nhóm có cả 3 hoạt động đạt |
| Điểm trung bình | các `assessments` đã nộp |
| Chuỗi tuần học đều | như `stats/compute.ts` đang tính |

Thẻ Từ vựng mang thêm một dòng tắt **"Tiếp tục: Nhóm 3 · Buổi 2"** — hoạt động chưa hoàn thành có `(nhóm, thứ tự trong nhóm)` nhỏ nhất. Đây là **gợi ý, không phải luật**: 10 nhóm vẫn tự do.

`/stats` giữ nguyên vai trò trang chi tiết (biểu đồ điểm, từ hay sai, nhịp học, link study4.com), chỉ bỏ mọi tham chiếu tới 35 slot và bài `test`.

### 5.3 Trang từ vựng

Danh sách dọc 10 nhóm. Mỗi nhóm một khối: tiêu đề `NHÓM g · từ X–Y`, nút `📖 Xem lại`, và 3 ô hoạt động nằm ngang. Một lần bấm vào ô là vào thẳng việc — không có trang trung gian của nhóm.

Trạng thái mỗi ô do `progress.ts` tính:

| Trạng thái | Điều kiện | Áp cho ô nào |
|---|---|---|
| chưa làm | không có `assessments` cho phạm vi, và (với ô buổi) `lesson_cursor.word_index = 0` | cả 3 |
| đang học | chưa có bài thi nào nhưng `lesson_cursor.word_index > 0` | **chỉ Buổi A/B** |
| đang thi | có bài `in_progress` | cả 3 |
| đạt · *điểm* | lần thử mới nhất `passed = true` | cả 3 |
| chưa đạt · *điểm* | lần thử mới nhất `passed ≠ true` | cả 3 |

Ô **Ôn tập** không có trạng thái "đang học": nó không có pha học nào, `lesson_cursor` chỉ tồn tại cho buổi. Ôn tập đi thẳng từ *chưa làm* sang *đang thi*.

"Lần thử mới nhất" chỉ xét bài `lesson`/`review` khớp phạm vi; bài `remedial` không tính là một lần thử của phạm vi mà treo vào bài cha qua `parent_id`.

### 5.4 Buổi học — hai pha tách hẳn

**Pha HỌC** `/vocab/learn/[lessonId]`

Server Component tải **một lần duy nhất**: 30 từ (câu ví dụ đã điền lại chỗ trống qua `blank_answers_for_lesson`), 30 ghi chú, con trỏ đang đọc — rồi đẩy trọn xuống client. Từ đó **không thao tác nào chạm mạng**: `←`/`→`, bấm mục lục, phím mũi tên, che từ đều là 0 vòng mạng.

Thành phần một thẻ: từ · IPA · nút nghe (Web Speech API, như hiện nay) · đồng nghĩa · nghĩa tiếng Việt · định nghĩa tiếng Anh · câu ví dụ đầy đủ + bản dịch · **ô ghi chú nhiều dòng**.

Nút **Che từ** giữ nguyên hành vi hiện tại: một công tắc cho cả buổi, lưu bằng cookie để server render đúng ngay từ HTML đầu tiên, và che luôn câu ví dụ tiếng Anh vì câu đó chứa chính từ cần nhớ.

Ba thứ ghi ở nền, không bao giờ chặn thao tác: ghi chú (tự lưu sau 600ms ngừng gõ, và khi rời từ hoặc rời trang), `lesson_cursor.word_index`, cookie che từ.

Nút **LÀM BÀI** luôn bấm được — không ép xem hết 30 thẻ mới cho thi.

**Cột phụ lục** — 30 dòng `số · từ · ✎` (dấu ✎ đánh dấu từ đã có ghi chú), làm nổi từ đang xem. Từ 1024px trở lên: cột cố định bên trái. Hẹp hơn: thu thành nút ☰, bấm thì trượt ra phủ lên thẻ. **Một component, hai trạng thái** — không phải hai cây component.

**Pha THI** `/exam/[id]`

Bấm LÀM BÀI → Server Action dựng 30 câu, ghi `assessments` + `assessment_items` (payload chỉ `prompt` + `options`, **không bao giờ có đáp án**), chuyển trang. Client nhận trọn 30 câu và không hỏi server thêm câu nào nữa.

Bấm một đáp án → **sang câu sau ngay lập tức**. Đáp án vào một hàng đợi tuần tự gửi ở nền; đúng/sai của câu vừa rồi hiện thành dải nhỏ phía trên khi server trả lời. Tới câu cuối thì chờ hàng đợi cạn rồi gọi `finalize_assessment_items` — vẫn là một câu lệnh nguyên tử như hiện nay.

Mất mạng: hàng đợi thử lại; nếu vẫn còn câu chưa gửi được thì báo rõ và chặn nộp cho tới khi xong. Đáp án nằm trên server theo từng câu, nên đóng nhầm tab vào lại vẫn còn bài.

### 5.5 Xem lại từ

`/vocab/browse/[groupId]` dùng **đúng component thẻ + cột phụ lục của pha học**, chỉ khác: 60 từ thay vì 30, không có nút LÀM BÀI, không ghi `lesson_cursor`. Ghi chú vẫn sửa được. Mở từ nút `📖 Xem lại` của mỗi nhóm, kể cả nhóm chưa học.

### 5.6 Trang kết quả và bổ túc

Hiện điểm, đạt/chưa đạt, và danh sách từ sai kèm nghĩa (qua `wrong_items_for_assessment`).

- Chưa đạt → nút **"Bổ túc N từ sai"**, dựng bài `remedial` với `parent_id` trỏ về bài vừa trượt.
- Đạt bổ túc → nút **"Làm lại bài"**, dựng lại bài chính cùng phạm vi với seed mới.
- Trượt bổ túc → bổ túc tiếp, dựng từ các từ sai của chính lần bổ túc đó.

Đây đúng là cơ chế `parent_id` + `wrong_items_for_assessment` đang chạy; lát này chỉ gỡ phần khoá slot ra khỏi nó.

### 5.7 Lộ trình ngữ pháp

`/grammar` — 20 bài, danh sách dọc, mỗi dòng: tên bài + điểm gần nhất. Chọn tự do.
`/grammar/[lessonId]` — render `content_md` + nút "Làm bài" dẫn sang cùng `/exam/[id]`.

Không nhóm, không bổ túc, làm lại bao nhiêu lần tuỳ ý. Nhẹ hơn hẳn lộ trình từ vựng, đúng chủ trương "app tập trung vào từ vựng".

---

## 6. Dựng đề

### 6.1 Hai dạng câu, cả hai đều là "chọn từ"

| Dạng | Đề | 4 phương án |
|---|---|---|
| Nghĩa → từ | `"bản sơ yếu lý lịch"` | `word` + 3 nhiễu |
| Ví dụ khuyết → từ | `"Fax your ___ and cover letter to the above number."` | `blank_answer` + 3 nhiễu, **cũng ở dạng biến cách** |

Dạng thứ hai phải lấy cả 4 phương án từ `blank_answer`, không phải `word`: `blankAnswer` có thể là dạng biến cách (`openings`), nên nếu 3 phương án nhiễu để nguyên dạng gốc thì đáp án đúng tự lộ — nó là phương án duy nhất khớp ngữ pháp. Cột `blank_answer` bị revoke khỏi `authenticated`, nên việc dựng đề **bắt buộc chạy ở server** qua RPC.

### 6.2 Phủ và phân bổ

Mỗi từ trong phạm vi xuất hiện **đúng một câu**. Bài `lesson`: 30 câu / 30 từ, chia 15–15 hai dạng. Bài `review`: 60 câu / 60 từ, chia 30–30. Bài `remedial`: mỗi từ sai một câu, dạng chia đôi làm tròn.

Từ nào rơi vào dạng nào do seed tất định quyết định, nên tải lại trang không đổi đề.

### 6.3 Phương án nhiễu

Lấy trong chính phạm vi của bài (30 từ của buổi, 60 của nhóm), ưu tiên cùng loại từ — dùng lại `pickDistractors` đã có, chuyển từ `lib/lesson/build-item.ts` sang `lib/exam/`. Với bài `remedial` phạm vi có thể quá hẹp (dưới 4 từ), khi đó mở rộng nguồn nhiễu ra cả buổi/nhóm cha.

Hàm dựng đề **phải nổ khi thiếu nguồn**, không được lặng lẽ trả về đề ngắn hơn — giữ nguyên nguyên tắc đã ghi trong `buildAssessmentItems` hiện tại.

---

## 7. Ranh giới module

**Hàm thuần** — không biết React, không biết Supabase, test không cần dựng gì:

```
lib/curriculum/groups.ts    groupOf(ordinal) · lessonsOf(g) · TOTAL_GROUPS
lib/curriculum/progress.ts  assessments[] + cursors[] → trạng thái 3 hoạt động × 10 nhóm
lib/exam/build.ts           (words, kind, seed) → đề 2 dạng
lib/exam/queue.ts           hàng đợi gửi đáp án: thứ tự, thử lại, cạn hàng
lib/mastery/apply.ts        giữ, xem lại ngưỡng `mastered` (mục 11.1)
lib/stats/compute.ts        cập nhật
```

**Chạm server:** `lib/exam/run.ts` (start · answer · finalize), `lib/notes/save.ts`.

**Component:**

```
components/vocab/deck.tsx        điều phối N thẻ: vị trí, phím ← →, tới/lui
components/vocab/word-card.tsx   một thẻ từ
components/vocab/word-index.tsx  cột phụ lục — cố định ≥1024px, trượt khi hẹp
components/vocab/note-box.tsx    ô ghi chú tự lưu
components/exam/exam-runner.tsx  bài thi không chặn
components/exam/exam-result.tsx  điểm + từ sai + bổ túc
```

`deck.tsx` nhận **danh sách từ + có/không nút LÀM BÀI**, phục vụ cả pha học (30 từ) lẫn xem lại (60 từ). Đây là ranh giới đáng giữ nhất trong lát này: tách thành hai cây component thì mọi sửa đổi thẻ từ về sau phải làm hai lần và sẽ lệch.

**Xoá:** `lib/assessment/slots.ts`, `next-step.ts`, `current-step.ts`, `lib/lesson/item-plan.ts`, `session.ts`, `run-submit.ts`, `grade.ts`, `components/lesson/*`, `components/assessment/countdown.tsx`.
**Giữ và chuyển:** `pickDistractors` trong `lib/lesson/build-item.ts` → `lib/exam/`.

---

## 8. Tốc độ

| Chỗ | Hôm nay | Sau |
|---|---|---|
| Mỗi bước trong buổi học | 1 Server Action + truy vấn DB, **chặn UI** | **0 gọi mạng** — cả buổi tải một lần |
| Mỗi câu thi | bấm → đợi → bấm "Tiếp" | bấm **một** lần, sang ngay, gửi ở nền |
| Dashboard | 3 truy vấn + duyệt 35 slot + `nextStep` | 2 truy vấn nhỏ |
| Chuyển trang | màn trắng chờ | `loading.tsx` mỗi route + `<Link prefetch>` |

Thêm: chỉ `select` những cột thật dùng (dashboard hiện kéo `grammar_lessons(title)` cho cả 20 dòng rồi không hiển thị), không `await` việc ghi nền trong đường bấm, **không thêm thư viện nào** — gói phụ thuộc giữ nguyên Next / React / Supabase / Zod.

**Ngân sách:** một thao tác trong buổi học **< 16ms**; chuyển trang phải thấy khung ngay, dữ liệu tới sau.

**Giới hạn không xoá được:** Supabase Free ở xa, mỗi vòng mạng ~150–400ms. Toàn bộ chiến lược là *giảm số lần gọi*, không phải làm mỗi lần gọi nhanh hơn.

---

## 9. Kiểm thử

**Unit**

- `groups.ts` — biên buổi 1 và 20, nhóm 1 và 10
- `progress.ts` — mọi tổ hợp trạng thái 3 hoạt động, gồm chuỗi trượt → bổ túc → trượt tiếp
- `exam/build.ts` — 30 câu phủ đúng 30 từ không lặp; đúng 15/15 hai dạng; nhiễu không trùng đáp án; dạng ví dụ dùng `blank_answer`; nổ khi thiếu nguồn
- `exam/queue.ts` — thứ tự, thử lại, cạn hàng trước khi nộp

**e2e (Playwright, hạ tầng đã có)**

- Vào buổi → nhảy mục lục tới từ 20 → gõ ghi chú → tải lại trang: ghi chú còn, con trỏ đúng
- Bấm 30 câu liên tục không đợi → nộp → điểm đúng
- Trượt → bổ túc → đạt → làm lại
- **Vào thẳng nhóm 7 khi chưa học nhóm nào** — chứng minh hết khoá
- Xem lại 60 từ của một nhóm chưa học

**RLS** — user A không đọc được `word_notes` của user B. Bảng mới, đúng loại lỗi hay quên.

---

## 10. Phân lát

Ba lát, mỗi lát kết thúc ở trạng thái chạy được và xem được.

**2a · Nền + học từ vựng**
Migration (xoá tiến độ, dựng lại enum, `word_notes`, `lesson_cursor`, `grammar_lesson_id`); `groups.ts` + `progress.ts` + test; dashboard mới; `/vocab`; `/vocab/learn` (30 thẻ, cột phụ lục, ghi chú, che từ); `/vocab/browse`. Xoá luồng 135 item và `slots`/`next-step`/`current-step`. Nút LÀM BÀI tạm dẫn tới màn "sắp có".
→ *Học được theo cách mới, chưa thi được.*

**2b · Thi và bổ túc**
`exam/build.ts` hai dạng; `exam-runner` không chặn + hàng đợi; trang kết quả; bổ túc; ôn tập nhóm 60 câu; `progress.ts` sống dậy; xem lại ngưỡng `mastered`.
→ *Lộ trình từ vựng hoàn chỉnh.*

**2c · Ngữ pháp + thống kê + siết tốc độ**
`/grammar` + `/grammar/[lessonId]` dùng lại runner; 4 số liệu dashboard; `/stats` bỏ khái niệm 35 slot và bài `test`; `loading.tsx` + prefetch; đo và siết theo ngân sách mục 8.

---

## 11. Rủi ro và việc còn mở

### 11.1 `word_mastery.mastered` sẽ sai lệch — phải định nghĩa lại ở lát 2b

Luật hiện tại đếm số lần đúng/sai trong luồng 135 item, nơi mỗi từ bị chạm khoảng 4 lần một buổi (thẻ, câu nghĩa, câu đồng nghĩa, câu điền). Cấu trúc mới chạm **1 lần một buổi**. Giữ nguyên ngưỡng thì con số "đã thuộc /605" trên dashboard mất ý nghĩa. Đây là việc bắt buộc của lát 2b, không phải tuỳ chọn.

### 11.2 `content_md` của 20 bài ngữ pháp chưa được render thử

Nguồn gốc là bảng so sánh hai cột dày đặc trong `.docx`. Chưa ai xem chúng hiển thị ra sao trên web. Có thể phát sinh việc ở lát 2c.

### 11.3 Ôn tập 60 câu có thể dài

Một hằng số trong `lib/exam/build.ts`. Nếu dùng thật thấy mệt, hạ xuống 30 câu ưu tiên từ có `wrong_count` cao.

### 11.4 Ô "Gõ lại từ" biến mất

Tan vào ô ghi chú — người học tự gõ từ nhiều lần ngay trong ghi chú nếu muốn. Ô cũ vốn không chấm, không lưu, nên không mất dữ liệu nào.

### 11.5 Giới hạn đã thừa nhận, giữ nguyên từ thiết kế gốc

Đáp án câu từ vựng về lý thuyết vẫn tra ngược được từ dữ liệu client (biết 30 từ của buổi thì đoán được). Với app tự học, gian lận là tự hại mình. Không đánh đổi thêm phức tạp để bịt kín.

### 11.6 Hai tab cùng làm một bài

Vẫn chưa xử lý, như thiết kế gốc. Với luật mới "bắt đầu lại một bài cùng phạm vi thì huỷ bài đang dở", tab cũ sẽ gặp lỗi khi nộp thay vì ghi đè âm thầm — tệ vừa phải, và rõ ràng hơn hiện tại.

---

## 12. Bước tiếp theo

Chuyển sang skill `writing-plans` để lập kế hoạch triển khai chi tiết cho lát 2a.
