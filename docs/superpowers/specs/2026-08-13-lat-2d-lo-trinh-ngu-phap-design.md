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
  `write.ts` cũ đã ghi lại. Nó phải lấy từ `scope` của chính bài thi.

Giữ nguyên CAS `user_answer is null` và luật "chỉ cộng tiến độ ở lần trả lời
đầu" — hai thứ đã trả giá ở lát 2b, không được rẽ nhánh nào đi vòng qua chúng.

## 5. `scope` của bài ngữ pháp

`scope = [ordinal bài ngữ pháp]`, một phần tử. `grammar_lessons.ordinal` chạy
1..20, độc lập với `lessons.ordinal` của từ vựng.

Điều này làm `scope` mang **hai không gian số** tuỳ theo `type`: buổi từ vựng với
`lesson`/`review`/`remedial`, bài ngữ pháp với `grammar`. Hai bên không bao giờ
so với nhau vì `progress.ts:108` lọc theo `type` **trước** khi so `scope` — nhưng
sự thật đó phải được ghi ra, vì nó không hiển nhiên và một người đọc lướt sẽ
tưởng `scope[0] = 5` luôn có nghĩa "buổi 5".

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
