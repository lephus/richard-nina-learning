# Thiết kế: Lát 2d — Lộ trình ngữ pháp

> Triển khai mục 5.7 và dòng `grammar` của mục 3.3 trong
> `2026-08-11-phase2-vocab-first-restructure-design.md`.
> Đóng lại rủi ro 11.2 của spec đó, và gỡ chữ "Sắp có" cuối cùng của toàn app.

**Mục tiêu:** thẻ NGỮ PHÁP trên dashboard dẫn tới 20 bài lý thuyết đọc được, mỗi
bài có bài thi trắc nghiệm chấm điểm thật.

**Không thuộc phạm vi:** bài bổ túc cho ngữ pháp (mục 3.3 nói rõ loại này không
có), nhóm, khoá tuần tự.

---

## 1. Rủi ro 11.2 đã thành sự thật, và nó chặn đường

Mục 11.2 spec phase 2 ghi: "`content_md` của 20 bài ngữ pháp chưa được render
thử… có thể phát sinh việc". Đã thử, và nó không phải "có thể" — nó **chặn**.

`grammar_lessons.content_md` chứa **grid table của pandoc**:

```
+------------------------+------------------------+
| **HIỆN TẠI ĐƠN**       | **HIỆN TẠI TIẾP DIỄN** |
+========================+========================+
| 1. **Tobe:**           | 1. (+) S + is/am/are…  |
```

Không thư viện markdown JS phổ thông nào hiểu cú pháp này — `marked`,
`react-markdown`+`remark-gfm` đều render nó thành các dòng `+---+` literal. Toàn
bộ giá trị của 20 bài lý thuyết nằm ở các bảng so sánh hai cột đó (hiện tại đơn
vs. tiếp diễn, v.v.), nên "render tạm được" không phải một lựa chọn.

Đã thử `pandoc -t gfm` để lấy bảng pipe: **không được**. Pandoc rơi về `<table>`
HTML thô, vì ô bảng chứa danh sách đánh số và nhiều đoạn — thứ bảng pipe của
GFM không biểu diễn nổi. Đây là ràng buộc của **dữ liệu**, không phải của cú
pháp ta chọn.

**Quyết định: trích lại bằng `pandoc -t html`, lưu vào cột mới `content_html`,
render trực tiếp.** Bảng, danh sách lồng, in đậm đều giữ nguyên. Không thêm
thư viện markdown nào.

Giữ nguyên `content_md` chứ không sửa đè: nó là dữ liệu đã seed và đã có test
đối chiếu (`tests/db-integrity.test.ts`, `tests/grammar-lessons.test.ts`). Thêm
cột là một migration; sửa nghĩa của cột cũ là một cái bẫy cho người đọc sau.

## 2. `dangerouslySetInnerHTML` — vì sao chấp nhận được ở đây, và cách chứng minh

Render HTML từ database luôn đáng ngờ. Ở đây nó chấp nhận được vì chuỗi cung ứng
khép kín: HTML do **chính pipeline của ta** sinh ra, offline, từ các file `.docx`
trong repo, rồi seed bằng service key. Không có đường nào cho dữ liệu người dùng
lọt vào.

Nhưng "chấp nhận được vì tôi nói vậy" không phải một khẳng định kiểm tra được.
Nên pipeline **phải tự kiểm**: script trích xuất nổ nếu HTML sinh ra chứa
`<script`, `<iframe`, hay thuộc tính `on…=`. Một dòng kiểm, biến lời hứa thành
một bất biến có thể đỏ.

## 3. Bài thi ngữ pháp — dùng lại bộ máy, không dựng cái mới

`grammar_questions` đã seed 537 câu, **đã mang sẵn** `options` (4 phương án) và
`answer` (chữ cái A–D). Không cần sinh phương án nhiễu — khác hẳn từ vựng.

| | Từ vựng | Ngữ pháp |
|---|---|---|
| Nguồn phương án | `pickDistractors` dựng runtime | đã có sẵn trong dữ liệu |
| Chấm | `answer_for_word` / cột `word` | `answer_for_question` |
| Ghi tiến độ | `applyWordMastery` (theo từ) | `applyGrammarMastery` (theo **bài**) |
| Bổ túc | có | **không** (mục 3.3) |

Số câu **thay đổi theo bài**: ít nhất 20, nhiều nhất 100, trung bình 27. Cả 20
bài đều có câu hỏi. Bài thi lấy **toàn bộ** câu của bài đó — đúng mục 3.3
("= số câu có sẵn của bài"). Trộn thứ tự câu và thứ tự phương án theo seed tất
định, dùng lại `shuffleQuestionOptions` đã có.

**`applyGrammarMastery` chưa từng được gọi và chưa test nào phủ** — nó được dựng
ở lát 2b để ranh giới đúng từ đầu. Lát này là lần đầu nó chạy thật, nên nó phải
được test thật, không chỉ được gọi.

## 4. Điểm nối vào `recordAnswer` — chỗ dễ hỏng nhất

`recordAnswer` hiện giả định mọi câu là từ vựng. Nó phải rẽ theo
`assessment_items.item_type` (`'vocab'` | `'grammar'`, cột đã có sẵn từ `0003`):

- `'grammar'` → chấm bằng `answer_for_question(ref_id)`, ghi bằng
  `applyGrammarMastery(userId, grammarLessonId, correct)`.
- `grammarLessonId` **không suy ra được từ `ref_id`** — đây đúng cái bẫy mà bản
  `write.ts` cũ đã ghi lại. ~~Nó phải lấy từ `scope` của chính bài thi.~~ SAI —
  xem mục 5 (sửa ở Task 4): `scope` LUÔN rỗng cho bài ngữ pháp, không có gì ở
  đó để lấy. Nó lấy từ cột `assessments.grammar_lesson_id`.

Giữ nguyên CAS `user_answer is null` và luật "chỉ cộng tiến độ ở lần trả lời
đầu" — hai thứ đã trả giá ở lát 2b, không được rẽ nhánh nào đi vòng qua chúng.

## 5. `scope` của bài ngữ pháp — SỬA Ở TASK 4: bản dưới đây đã SAI, đã kiểm chứng thật

> **Bản gốc của mục này nói:** `scope = [ordinal bài ngữ pháp]`, một phần tử,
> độc lập với không gian ordinal của `lessons` từ vựng. **Điều đó SAI với
> database đang chạy thật** — không phải một cách diễn đạt khác, mà là một
> INSERT bị Postgres từ chối thẳng. Giữ nguyên đoạn trên (thay vì xoá) để ghi
> lại rằng kế hoạch từng nói vậy, và để không ai lặp lại đúng lỗi đó lần nữa
> — đây là lần plan sai thứ mấy trong lát này đã được ghi lại, xem
> `task-3-report.md` và `task-4-report.md`.
>
> **Sự thật, đã kiểm bằng INSERT thật (Task 3), không phải suy luận từ đọc
> migration:** bài ngữ pháp ghi `type = 'grammar'`, **`scope = []` (RỖNG)**,
> và danh tính bài học nằm ở cột riêng **`assessments.grammar_lesson_id`**
> (FK tới `grammar_lessons.id` — một ID thật, KHÔNG phải ordinal). Ràng buộc
> `check ((type = 'grammar') = (grammar_lesson_id is not null))`, tên
> `assessments_grammar_scope`, sống ở
> **`supabase/migrations/0010_phase2_reset.sql:83`** (cột `grammar_lesson_id`
> được thêm ở dòng 81 của cùng migration đó) — migration này được viết TRƯỚC
> lát 2d, tự ghi lại lý do bằng lời ngay tại chỗ: *"scope dang mang ordinal
> buoi tu vung (1..20), con id bai ngu phap la mot he so hoan toan khac. Tron
> hai he vao mot cot la loi khong bao, khong vo, chi sai."* Một INSERT
> `{type: 'grammar', scope: [ordinal]}` **không kèm** `grammar_lesson_id`
> (đúng câu chữ bản gốc mục này) bị từ chối ngay với lỗi `23514` — đã thử
> thật bằng service role, một user tạm, xoá ngay sau khi xác nhận (Task 3).
>
> Hệ quả cho phần còn lại của tài liệu này: mọi nơi khác nhắc tới `scope` của
> bài ngữ pháp (nếu có) phải đọc lại theo sự thật ở trên. Bài ngữ pháp không
> mang "hai không gian số" trong CÙNG một cột `scope` như bản gốc mô tả — nó
> đơn giản là KHÔNG DÙNG `scope`, dùng một cột khác hẳn. `progress.ts` (lộ
> trình từ vựng) không đọc `grammar_lesson_id` nên không bị ảnh hưởng; `label`
> ở `src/lib/stats/compute.ts` đã giả định sẵn "bài ngữ pháp có `scope` rỗng"
> từ TRƯỚC lát 2d — giả định đó hoá ra ĐÚNG, dù không phải vì lý do bản gốc
> mục này đưa ra.

## 6. Màn hình

| Route | Nội dung |
|---|---|
| `/grammar` | 20 bài, danh sách dọc, mỗi dòng: tên bài + điểm gần nhất. Chọn tự do. |
| `/grammar/[ordinal]` | `content_html` + nút "Làm bài" → Server Action → `/exam/[id]` |

Thẻ NGỮ PHÁP trên dashboard đổi từ khối xám "Sắp có" thành link tới `/grammar`,
kèm số bài đã đạt. Đây là chữ "Sắp có" cuối cùng của app.

Trang kết quả dùng lại `/exam/[id]/ket-qua`, nhưng bài `grammar` **không có nút
bổ túc** — trang phải rẽ theo `type` chứ không chỉ theo `passed`. Làm lại bài thì
luôn được, bao nhiêu lần tuỳ ý.

## 7. Bẫy đã biết, phải né

- **Một bài đang làm dở cho mỗi người.** Chỉ số `assessments_one_in_progress`
  không phân biệt loại: đang dở bài từ vựng mà bấm "Làm bài" ngữ pháp sẽ được
  đưa về bài cũ, kèm cảnh báo lệch phạm vi đã dựng ở lát 2b. Đường này đã có;
  chỉ cần cảnh báo nói đúng cả trường hợp lệch **loại**, không chỉ lệch buổi.
- **Bài 100 câu.** Bài dài nhất gấp hơn ba lần bài từ vựng. Hàng đợi gửi tuần tự
  và cơ chế thử lại ở lát 2c đã xử lý được 60 câu; 100 câu chỉ là nhiều hơn,
  không khác về bản chất. Không hạ số câu — mục 3.3 nói lấy hết.
- **`ExamRunner` tiêu đề.** Đã có ba nhánh (`lesson`/`review`/`remedial`); thêm
  `grammar` bằng đúng khuôn, không thêm predicate rời rạc thứ hai.

## 8. Kiểm thử

**Unit** — dựng đề ngữ pháp: đủ số câu của bài, mỗi câu đúng một lần, cùng seed
cho cùng đề, phương án lấy nguyên từ dữ liệu (không sinh thêm), và **chạy trên
cả 20 bài** — cùng lý do như lát 2b: một bài không dựng được đề nghĩa là người
học không vào thi được bài đó.

**Tích hợp** — `applyGrammarMastery` ghi đúng khoá kép `(user_id,
grammar_lesson_id)`; đúng và sai đều đếm; trả lời lại không cộng hai lần.
`recordAnswer` chấm câu ngữ pháp bằng `answer_for_question`, không đụng
`word_mastery`.

**Pipeline** — HTML sinh ra không chứa `<script`, `<iframe`, hay thuộc tính
`on…=` (mục 2).

**E2E** — vào `/grammar` từ dashboard; mở một bài; **thấy bảng hai cột render
thành `<table>` thật, không phải chữ `+---+`** (đây là khẳng định đóng lại rủi
ro 11.2); làm bài, thấy điểm; trang kết quả của bài ngữ pháp **không** có nút bổ
túc.

## 9. Việc theo sau

**`build-grammar-lessons.ts` đã lệch với `data/clean/grammar.json` từ commit
`3c1914d`, và lát này chủ động không sửa.** Commit đó sửa tay thẳng vào
`data/clean/grammar.json`: mở rộng bài 2 với ~728 từ lý thuyết danh từ (biên
tập từ `LÝ THUYẾT DANH TỪ.pdf`, không qua pandoc) và đổi slug bài 2 thành
`danh-tu-tinh-tu-va-trang-tu`, nhưng không cập nhật lại `LessonSpec` tương ứng
trong `build-grammar-lessons.ts` — script vẫn giữ slug cũ
`tinh-tu-va-trang-tu` và không biết gì về nội dung danh từ.

Chạy `npm run phase0:grammar-lessons` hôm nay sẽ **âm thầm ghi đè bài 2 về bản
cũ** (1100 từ, thiếu lý thuyết danh từ, sai slug), làm đỏ hai file test đang
xanh — `tests/integrity.test.ts` (buổi 2 trỏ tới slug không tồn tại, bài
`tinh-tu-va-trang-tu` "0 câu") và `tests/questions.test.ts` (100 câu ở
`data/clean/questions.json` trỏ tới slug lạ) — và lệch khỏi dữ liệu đang seed
thật trên Supabase (xác minh gián tiếp qua `tests/db-integrity.test.ts`, vốn
chỉ xanh nếu `grammar_lessons` seed hiện tại khớp bản `danh-tu-tinh-tu-va-trang-tu`).

Lát 2d cần thêm `content_html` mà không được đụng tới nội dung đã seed, nên đã
chọn: **sinh `content_html` từ `contentMd` đã có sẵn trong
`data/clean/grammar.json`** (script `scripts/phase0/add-grammar-html.ts`),
không đi qua `build-grammar-lessons.ts`. `data/clean/grammar.json` là nguồn sự
thật cho lát này; generator thì không.

**Ai cần chạy lại `build-grammar-lessons.ts` sau này phải đồng bộ lại
`LessonSpec` của bài 2 trước** — ví dụ tách đoạn lý thuyết danh từ hiện có
trong `contentMd` của bài 2 thành một file thô mới ở `data/raw/grammar/`, thêm
vào `ranges`/`sourceFile` của spec bài 2, và đổi `slug`/`title`/`summary` khớp
bản đang chạy. Việc này ngoài phạm vi lát 2d.

Đã cân nhắc thêm một test bảo vệ ("output của generator khớp với
`grammar.json` đã commit") để lần lệch tiếp theo bị bắt ngay ngày nó xảy ra.
Chưa làm: test đó phải loại trừ đúng bài 2 (ngoại lệ đã biết) mà vẫn bắt được
lệch ở 19 bài còn lại — cách loại trừ "an toàn" (không vô tình che luôn lệch
thật) cần suy nghĩ kỹ hơn một vài dòng, nên để lại thành việc theo sau thay vì
làm vội.
