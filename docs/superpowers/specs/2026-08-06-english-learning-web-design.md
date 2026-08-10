# Thiết kế: Web học tiếng Anh TOEIC (từ vựng + ngữ pháp)

**Ngày:** 2026-08-06
**Trạng thái:** Đã duyệt thiết kế, chờ lập kế hoạch triển khai

---

## 1. Mục tiêu

Một web app tự học TOEIC cho nhóm nhỏ người học, xây trên chính bộ tài liệu có sẵn trong `toeic-resource/`. Mỗi buổi học 30 từ vựng và 1 bài ngữ pháp; sau mỗi 2 buổi có bài ôn tập, sau mỗi 4 buổi có bài kiểm tra 60 phút. Không pass thì phải học lại phần sai. Có thống kê tiến độ.

**Ràng buộc bao trùm: toàn bộ hệ thống phải chạy ở mức $0/tháng.** Ràng buộc này quyết định nhiều lựa chọn kỹ thuật bên dưới và không được đánh đổi.

---

## 2. Kho nội dung — hiện trạng đã kiểm chứng

Số liệu dưới đây lấy từ đo đạc thực tế trên `toeic-resource/`, không phải ước lượng.

| Nguồn | Thực trạng |
|---|---|
| `VOCAB. Toeic Practice Club.pdf` | 114 trang, 105MB. **Chỉ trang 1–2 có text; trang 3–114 là ảnh scan** (`pdftotext` trả 0 ký tự, `pdfimages` xác nhận toàn JPEG). Đánh số mục 1 → ~605. |
| `NGỮ PHÁP TOEIC/*.docx` | 14 file, ~53.600 từ, text sạch, trích xuất tốt bằng `pandoc`. |
| `Bài tập/*.docx` | ~150 câu trắc nghiệm (danh từ; tính từ/trạng từ), text sạch, **không có đáp án**. |

### 2.1 Cấu trúc một mục từ vựng

OCR thử nghiệm (`tesseract 5.5.0`, `-l vie+eng`, render 200dpi) cho thấy sách có sẵn đúng các trường cần dùng:

```
43. concern (n). sự quan tâm, lo lắng, vấn đề, SYN: issue, matter, interest, worry.
/kən'sɜːrn/  Mean: <định nghĩa tiếng Anh> (<dịch tiếng Việt>)
             Exp: <câu ví dụ, từ đích bị khoét trống> (<dịch tiếng Việt>)
```

Ba thứ đắt tiền nhất — **từ đồng nghĩa** (`SYN:`), **câu ví dụ thực tế** (`Exp:`), **chỗ trống điền từ** — đều có sẵn trong nguồn, không phải tự sinh.

### 2.2 Hai khoảng trống phải xử lý

1. **Chất lượng OCR ~85–90%.** Dấu tiếng Việt hỏng nhiều (`Trang phuc` → `Trang phục`, `hệ thông` → `hệ thống`); phần trang trí/watermark tạo dòng rác; thỉnh thoảng nhảy mục.
2. **Câu hỏi ngữ pháp thiếu.** 150 câu có sẵn chưa có đáp án; 18/20 chủ đề chưa có câu hỏi nào.

### 2.3 Lệch pha số lượng và cách cân bằng

605 từ ÷ 30 = **20 buổi** (dùng 600 từ; ~5 từ cuối dôi ra, xếp vào buổi 20 hoặc để dành làm câu hỏi ôn tập — chốt ở bước lập kế hoạch). Nhưng chỉ có **14 file ngữ pháp** → hụt 6 buổi. Xử lý bằng cách tách các file lớn thành nhiều bài: `TENSES` (9.659 từ), `CÂU ĐIỀU KIỆN` (6.294), `ARTICLES` (5.291), `INF-Ving` (4.639), `Bị động` (4.555), `WISH/WOULD RATHER` (4.436) đều đủ dài để chia 2–3 bài. Mục tiêu: **đúng 20 bài ngữ pháp khớp 20 buổi từ vựng.**

---

## 3. Các quyết định đã chốt

| # | Vấn đề | Quyết định | Lý do |
|---|---|---|---|
| 1 | Nguồn từ vựng | OCR tài liệu gốc của người dùng | Giữ đúng nội dung đã chọn lọc; sách có sẵn SYN + Exp |
| 2 | Vòng lặp học | **Mở khoá theo tiến độ, không khoá theo thứ trong tuần** | Lịch 2 buổi/tuần là mục tiêu nhắc nhở, không chặn |
| 3 | Cấu trúc buổi học | **3 cụm × 10 từ**, mỗi cụm: gặp từ → luyện → chốt | Trí nhớ ngắn hạn chứa tốt ~7–10 mục |
| 4 | Cơ chế học lại | **Chỉ bổ túc phần sai**, vòng nhỏ dần | Đúng trọng tâm, không bắt ôn lại từ đã thuộc |
| 5 | Frontend | Next.js 15 App Router + TypeScript + Tailwind | Có server-side để giữ đáp án và đồng hồ ngoài tầm trình duyệt |
| 6 | Làm sạch OCR | Claude Code thực hiện trực tiếp, không script API | $0; đây là việc chạy một lần nên không cần tự động hoá |

---

## 4. Phạm vi: hai giai đoạn tách biệt

### Phase 0 — Pipeline nội dung (offline, chạy một lần)

```
114 trang PDF
  ├─ pdftoppm -r 300 -png          → ảnh                [công cụ]
  ├─ tesseract -l vie+eng          → text thô           [công cụ]
  ├─ regex parser                  → tách mục có cấu trúc [code, tất định]
  ├─ Claude Code làm sạch          → sửa dấu, phục hồi từ khoét, validate
  ├─ JSON schema validate          → loại bản ghi hỏng  [code]
  ├─ người soát ~30 mục ngẫu nhiên → chốt chất lượng
  └─ seed → Supabase
```

Tách khỏi Phase 1 vì khác hẳn về công cụ (tesseract/parser vs React), khác về cách sai (nhiễu OCR vs lỗi UI), và vì **app rỗng nếu chưa có nội dung**.

**Đầu ra Phase 0:**
- 605 bản ghi từ vựng sạch
- 20 bài ngữ pháp (tách từ 14 file docx)
- ~500 câu hỏi ngữ pháp có đáp án (150 câu sẵn có + phần còn thiếu)
- Ánh xạ 20 buổi × 30 từ

### Phase 1 — Web app

Sản phẩm học. **Không gọi AI lúc chạy** — mọi nội dung đã nằm trong database.

---

## 5. Mô hình dữ liệu

### Nhóm A — Nội dung (seed một lần, dùng chung)

```
vocab_words        id, ordinal, word, ipa, pos, meaning_vi,
                   definition_en, definition_vi, synonyms[],
                   example_en, example_vi, blank_answer
grammar_lessons    id, ordinal, title, slug, source_file, content_md, summary
grammar_questions  id, lesson_id, stem, options(jsonb), answer, explanation
```

### Nhóm B — Chương trình học

```
lessons       id, ordinal(1..20), grammar_lesson_id          — 20 dòng
lesson_words  lesson_id, word_id, position(1..30)            — 600 dòng
```

### Nhóm C — Trạng thái người học

```
profiles              id(=auth.users.id), display_name, created_at
user_lesson_progress  user_id, lesson_id, status, score, completed_at
word_mastery       ★  user_id, word_id, correct_count, wrong_count,
                      last_seen_at, mastered
grammar_mastery    ★  user_id, grammar_lesson_id, correct_count, wrong_count
assessments           id, user_id, type(review|test|remedial), scope,
                      status, score, passed, started_at, expires_at, submitted_at
assessment_items      assessment_id, item_type, ref_id, payload(jsonb),
                      user_answer, is_correct
```

Hai bảng ★ là nền cho cơ chế **học lại có trọng tâm**: khi trượt, hệ thống truy `word_mastery` lấy đúng các từ đang sai để dựng buổi bổ túc.

### 5.1 Bảo mật

- **Row Level Security bắt buộc** trên mọi bảng nhóm C: mỗi người chỉ đọc/ghi dữ liệu của chính mình.
- **Đồng hồ 60 phút nằm ở server**: `assessments.expires_at` đặt lúc bắt đầu; route chấm điểm từ chối bài nộp sau mốc đó. Đồng hồ trên màn hình chỉ để hiển thị.
- **Giới hạn được thừa nhận**: đáp án câu từ vựng về lý thuyết vẫn tra ngược được từ dữ liệu client. Với app tự học, gian lận là tự hại mình, nên không đánh đổi thêm phức tạp để bịt kín. Đồng hồ thì bảo vệ chặt; đáp án thì không tuyệt đối.

---

## 6. Kiến trúc ứng dụng

### 6.1 Nhịp chương trình

```
Buổi 1 → Buổi 2 → ÔN TẬP(1,2) → Buổi 3 → Buổi 4 → ÔN TẬP(3,4) → KIỂM TRA(1-4)
```

20 buổi = 5 chu kỳ = 35 hoạt động ≈ **4 tháng** ở nhịp 2 buổi/tuần.

### 6.2 Quy mô và ngưỡng

| Loại | Phạm vi | Số câu | Thời lượng | Ngưỡng pass |
|---|---|---|---|---|
| Ôn tập | 2 buổi (60 từ + 2 ngữ pháp) | 25 | ~15 phút | ≥ 80% |
| Kiểm tra | 4 buổi (120 từ + 4 ngữ pháp) | 60 | 60 phút (khoá cứng) | ≥ 70% |
| Bổ túc | chỉ phần sai | tuỳ số lỗi | ~10 phút | ≥ 80% |

Hai ngưỡng đặt trong một file config tập trung, không rải rác trong code.

### 6.3 Cấu trúc buổi học (30 từ)

```
CỤM 1 (từ 1–10)
  ① GẶP TỪ   flashcard: từ + IPA + nghĩa + nút nghe phát âm
             + ô gõ lại từ (gõ tự do, không chấm) + nút che/hiện từ
  ② LUYỆN    trắc nghiệm nghĩa · chọn từ đồng nghĩa (SYN) · ghép-nối từ ↔ nghĩa
  ③ CHỐT     điền từ vào câu ví dụ thực tế (Exp)
CỤM 2 (từ 11–20) → lặp ①②③
CỤM 3 (từ 21–30) → lặp ①②③
CHỐT BUỔI: 10 câu trộn cả 30 từ  +  1 bài ngữ pháp
```

Ô gõ ở bước ① để khắc mặt chữ bằng động tác tay, **không** chấm và **không** ghi `word_mastery` — việc đánh giá vẫn do bước ② và ③ đảm nhận. Chi tiết: [thiết kế ô gõ lại từ](2026-08-10-vocab-typing-field-design.md).

### 6.4 Route

```
app/
  (auth)/  login · register · logout          (không cần xác minh email)
  (app)/
    dashboard          tiến độ + nút "Học tiếp"
    learn/[lessonId]   buổi học
    review/[id]        ôn tập
    test/[id]          kiểm tra 60'
    remedial/[id]      bổ túc
    stats              thống kê
  api/
    assessments/start  dựng đề, đặt expires_at
    assessments/submit chấm điểm, cập nhật mastery, quyết pass/fail
    health             endpoint cho cron chống ngủ Supabase
```

### 6.5 Ranh giới module

Bốn khối logic tách khỏi cả React lẫn database, đều là hàm thuần:

```
lib/curriculum/   nextStep(progress) → bước kế tiếp
lib/assessment/   buildItems(scope, mastery) → câu hỏi + phương án nhiễu
lib/grading/      grade(items, answers) → điểm, pass/fail, danh sách lỗi
lib/mastery/      applyResults(errors) → cập nhật mastery
```

`nextStep()` là chỗ dễ sai nhất trong hệ thống. Tách thành hàm thuần để kiểm thử mọi nhánh (trượt ôn tập, trượt kiểm tra, trượt bổ túc liên tiếp) mà không cần dựng server hay bấm qua giao diện.

### 6.6 Thống kê (`/stats`)

Số từ đã thuộc / 605 · biểu đồ điểm qua các bài · danh sách từ hay sai nhất · chuỗi tuần học đều · tiến độ so với mục tiêu 2 buổi/tuần · link sang https://study4.com/tests/toeic/ để luyện đề thật.

---

## 7. Hạ tầng — giữ mức $0

| Hạng mục | Dịch vụ | Chi phí |
|---|---|---|
| Hosting + server | Vercel Hobby | $0 |
| Database + Auth | Supabase Free | $0 |
| Phát âm từ vựng | Web Speech API (trình duyệt) | $0 |
| Làm sạch OCR | Claude Code, chạy một lần | $0 |
| AI lúc chạy app | không có | $0 |

**Phát âm dùng Web Speech API thay vì file audio** — không lưu trữ, không dịch vụ TTS. Đây cũng là lý do không tải sẵn 605 file MP3.

**Dung lượng:** 605 từ + 20 bài + ~500 câu hỏi ≈ dưới 5MB, so với hạn mức 500MB.

**Rủi ro đã biết:** dự án Supabase gói Free bị tạm dừng sau khoảng 1 tuần không có truy vấn. Xử lý bằng GitHub Actions cron chạy 3 ngày/lần ping `/api/health` — cũng miễn phí.

---

## 8. Kiểm thử & xử lý lỗi

- **Unit test** cho 4 module `lib/`, trọng tâm `curriculum` (mọi nhánh pass/fail) và `grading`.
- **RLS test**: xác nhận user A không đọc được dữ liệu user B — lỗi bảo mật kinh điển khi quên bật Row Level Security trên Supabase.
- **Kiểm thử toàn vẹn nội dung** sau seed: đủ ~605 từ trong `vocab_words`, đúng 600 từ được xếp vào 20 buổi, mọi từ đủ trường bắt buộc, mọi buổi đủ 30 từ, không từ nào lặp giữa hai buổi.
- **Mất mạng giữa bài kiểm tra**: câu trả lời lưu lên server theo từng câu. Đóng nhầm tab thì vào lại vẫn còn bài, đồng hồ vẫn đúng theo `expires_at`.

---

## 9. Giả định và việc còn mở

1. **Đăng ký mở** cho bất kỳ ai, nhưng thiết kế nhắm tới số người học nhỏ. Không có vai trò admin ở phiên bản đầu.
2. **Giao diện tiếng Việt**, nội dung học tiếng Anh — theo đúng cách tài liệu gốc trình bày.
3. **Cách tách 14 file ngữ pháp thành 20 bài** sẽ chốt ở bước lập kế hoạch, sau khi đọc kỹ nội dung từng file.
4. **~500 câu hỏi ngữ pháp** cần soạn trong Phase 0 (150 câu sẵn có phải bổ sung đáp án; 18 chủ đề còn lại chưa có câu nào).
5. **Chất lượng giọng đọc Web Speech API khác nhau giữa các trình duyệt.** Nếu không đạt, phương án dự phòng là link sang từ điển online — vẫn $0.
6. **Chưa có tính năng học trên nhiều thiết bị cùng lúc**; tiến độ đồng bộ qua server nên không xung đột, nhưng chưa xử lý trường hợp mở hai tab cùng làm một bài kiểm tra.

---

## 10. Bước tiếp theo

Chuyển sang skill `writing-plans` để lập kế hoạch triển khai chi tiết cho Phase 0 rồi Phase 1.
