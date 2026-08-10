# Thiết kế: Phase 1b — luồng học một buổi

**Ngày:** 2026-08-07
**Trạng thái:** Đã duyệt thiết kế, chờ lập kế hoạch triển khai
**Tiền đề:** [Thiết kế tổng thể](2026-08-06-english-learning-web-design.md) · [Lát 1a](2026-08-07-phase1a-foundation-auth-dashboard-design.md) đã hoàn tất và đã merge

---

## 1. Vì sao lát này tồn tại

Lát 1a dựng xong nền móng: đăng nhập chạy, RLS chặn đúng, dashboard hiện 20 buổi, app đã lên Vercel. Nhưng bấm vào buổi học chỉ ra một trang tạm ghi "Luồng học sẽ được triển khai ở lát 1b". Web chưa dùng để học được.

Lát 1b là lát tạo ra giá trị lớn nhất của cả Phase 1: sau nó, người học học thật được một buổi từ đầu tới cuối, và buổi kế tiếp mở khoá.

Còn lại sau lát này: 1c (ôn tập, kiểm tra 60 phút) và 1d (bổ túc phần sai, thống kê).

---

## 2. Phạm vi

**Xong khi:** người học mở buổi 1, đi hết 135 item, thấy điểm, và buổi 2 chuyển sang `Sẵn sàng` trên dashboard. Đóng tab giữa chừng rồi quay lại thì tiếp đúng chỗ đang dở.

Lát này cũng làm **20 dòng dashboard bấm được** — buổi đã xong mở lại xem được, buổi chưa mở thì chặn ở server.

### Cố ý không làm

Ôn tập · kiểm tra 60 phút · bổ túc phần sai · trang `/stats` — để 1c và 1d.

**Bài tập ghép nối từ ↔ nghĩa** cũng để lại. Spec tổng thể mục 6.3 có liệt kê nó là dạng luyện tập thứ ba, nhưng nó là một mô hình tương tác hoàn toàn khác (kéo thả hoặc bấm-cặp) trong khi hai dạng trắc nghiệm đã phủ đúng kỹ năng nhận diện đó. Đây là mảng giao diện đắt nhất mà lợi ích chồng lấn nhiều nhất.

---

## 3. Các quyết định đã chốt

| # | Vấn đề | Quyết định | Lý do |
|---|---|---|---|
| 1 | Môi trường | **Một môi trường, làm thẳng trên Supabase hiện tại** | Quyết định của chủ dự án sau khi đã cân nhắc rủi ro ở mục 3.1 |
| 2 | Thời điểm phản hồi | **Ngay sau mỗi câu**, sai thì hiện đáp án đúng | Trí nhớ từ vựng sống bằng phản hồi tức thì; biết sai sau 10 câu là đã lặp lại cái sai 10 lần |
| 3 | Đóng tab giữa chừng | **Tiếp đúng chỗ đang dở**, vị trí do server giữ | 30 từ là 18–20 phút; bắt học lại từ đầu là lý do người ta bỏ học |
| 4 | Phương án nhiễu | **Ưu tiên cùng buổi, cùng loại từ**, có chuỗi dự phòng | Nhiễu lấy ngẫu nhiên toàn kho thường lệch nghĩa quá xa, người học đoán trúng mà không nhớ từ |
| 5 | Kiến trúc chấm bài | **Một Server Action `submitAnswer` cho mọi loại câu** | Đã phải gọi server để ghi mastery sau từng câu, nên cho server chấm luôn không tốn thêm; và 1c mở rộng chính hàm này |

### 3.1 Rủi ro đã nêu và được chấp nhận

Từ lát 1b trở đi, test **ghi tiến độ học thật** vào chính database người dùng đang học. Một lỗi trong bước dọn dẹp có thể xoá tiến độ nhiều tuần. Đã đề xuất tách môi trường (Supabase cục bộ qua Docker, hoặc project staging thứ hai trên gói Free); chủ dự án chọn giữ một môi trường.

Hai ràng buộc bắt buộc để giảm thiểu, áp cho mọi test từ lát này trở đi:

- **Mọi lệnh xoá trong test phải giới hạn theo `user_id` của chính tài khoản test nó vừa tạo.** Không bao giờ xoá theo điều kiện rộng như "mọi dòng `word_mastery`". Một câu `delete` thiếu `where` đúng chỗ là mất sạch.
- **Tài khoản test mang đuôi `@test.local` và có timestamp trong địa chỉ**, để phân biệt được với tài khoản thật trong mọi truy vấn.

### 3.2 Vì sao không đi lối chấm ở client

Xét hướng để trình duyệt tự chấm câu từ vựng, chỉ gửi câu ngữ pháp lên server: ít gọi mạng hơn, phản hồi nhanh hơn.

Bác bỏ vì ba lý do. Vẫn phải gọi server để ghi `word_mastery` sau mỗi câu, nên phần tiết kiệm được nhỏ hơn vẻ ngoài. Nó tạo hai đường mã cho cùng một việc, và chúng sẽ lệch nhau. Và tới 1c lại phải viết đường thứ ba cho kiểm tra, nơi bắt buộc chấm ở server vì `0004_rls.sql:46-48` đã thu hồi quyền đọc `grammar_questions.answer` khỏi `authenticated`.

Cũng xét hướng sinh sẵn toàn bộ đề vào bảng khi bắt đầu buổi, giống cách `assessments` + `assessment_items` đã thiết kế cho 1c. Bác bỏ vì enum `assessment_type` hiện chỉ có `review|test|remedial` nên phải sửa enum hoặc thêm bảng, trong khi buổi học thường không có đồng hồ và được phản hồi ngay — đóng băng đề không mang lại gì. Đó là độ phức tạp trả trước cho nhu cầu chưa tồn tại.

---

## 4. Cấu trúc một buổi

### 4.1 Trình tự 135 item

```
CỤM 1 (từ 1–10)      CỤM 2 (từ 11–20)    CỤM 3 (từ 21–30)
 ① 10 thẻ gặp từ      ① 10 thẻ            ① 10 thẻ
 ② 20 câu luyện       ② 20 câu            ② 20 câu
 ③ 10 câu điền        ③ 10 câu            ③ 10 câu
   = 40 item            = 40 item           = 40 item

CHỐT BUỔI: 10 câu trộn cả 30 từ + 5 câu ngữ pháp của bài = 15 item

Tổng: 3 × 40 + 15 = 135 item, đánh số position 0..134
```

Ba dạng item:

- **① Thẻ gặp từ** — hiện từ, IPA, nghĩa tiếng Việt, định nghĩa tiếng Anh, từ đồng nghĩa, câu ví dụ. Có nút nghe phát âm. Không chấm; bấm "Tiếp" để đi.
- **② Câu luyện** — 2 câu mỗi từ: *chọn nghĩa đúng* (4 phương án tiếng Việt) và *chọn từ đồng nghĩa* (4 phương án tiếng Anh).
- **③ Câu điền** — hiện `example_en` với từ đích bị khoét trống, người học gõ từ vào. So với `blank_answer` sau khi **cắt khoảng trắng hai đầu và hạ về chữ thường ở cả hai vế**. Không so khớp mờ, không sửa lỗi chính tả: gõ sai một chữ là sai. Nhưng hoa/thường và khoảng trắng thừa thì không tính là sai — đó là nhiễu gõ phím, không phải nhớ nhầm từ.

**Chốt buổi** gồm 10 câu **dạng ②-chọn-nghĩa** lấy tất định từ cả 30 từ (chỉ dạng chọn nghĩa, không trộn lẫn dạng chọn từ đồng nghĩa, để 15 item chốt buổi đo đúng một kỹ năng), rồi 5 câu ngữ pháp lấy từ `grammar_questions` của bài. Mọi bài đều có ít nhất 20 câu (trung bình 27, nhiều nhất 100) nên lấy 5 luôn đủ.

### 4.2 Trình tự là tất định, không lưu đề

Item thứ N luôn là cùng một từ và cùng một dạng — chỉ cần phép chia. Không cần bảng lưu đề.

Riêng phương án nhiễu cần ngẫu nhiên nhưng phải ổn định khi tải lại. Dùng lại `hashString` (FNV-1a) và `seededShuffle` (mulberry32) đã có ở `src/content/shuffle-options.ts` từ Phase 0, gieo hạt bằng `${userId}:${lessonId}:${position}`. Cùng người, cùng buổi, cùng vị trí → luôn cùng bộ phương án. **Không dùng `Math.random()` ở bất kỳ đâu.**

`seededShuffle` hiện là hàm nội bộ của tệp đó và sẽ cần export. Đây là thay đổi duy nhất đụng vào mã Phase 0.

---

## 5. Mô hình dữ liệu

### 5.1 Migration `0006_lesson_position.sql`

```sql
alter table user_lesson_progress
  add column position      int not null default 0,
  add column final_correct int not null default 0;
```

- `position` — item đang làm, 0..135. Bằng 135 nghĩa là đã xong.
- `final_correct` — số câu đúng trong 15 item chốt buổi.

Vị trí do **server** giữ, không phải trình duyệt, nên đóng tab, đổi máy, hay mở lại sau ba ngày đều về đúng chỗ.

Ba bảng `word_mastery`, `grammar_mastery`, `user_lesson_progress` đã có từ Phase 0 và không cần sửa gì khác.

### 5.2 Điểm số

120 item đầu là **luyện tập** — có phản hồi ngay, không tính điểm. 15 item chốt buổi mới là **đo lường**.

Xong buổi: `score = round(final_correct / 15 * 100)`, `status = 'completed'`, `completed_at = now()`. Buổi kế tiếp tự mở khoá theo đúng luật `lessonStatuses` đã cài từ lát 1a — không cần mã riêng.

### 5.3 Ngưỡng "đã thuộc"

`word_mastery.mastered` bật khi `correct_count - wrong_count >= 3`. Tha thứ cho vài lần sai lúc đầu nhưng đòi đúng nhiều hơn sai rõ rệt.

Quy tắc nằm gọn trong `masteryDelta` để đổi ngưỡng chỉ sửa một chỗ, và để `/stats` ở lát 1d đếm được "đã thuộc bao nhiêu trên 605".

---

## 6. Kiến trúc

### 6.1 Một điểm chấm duy nhất

Mở `/learn/[lessonId]`: server đọc `position` từ database, dựng item thứ N, gửi xuống **đã bỏ đáp án**.

Trả lời → Server Action `submitAnswer`:

```
1. đọc lại position từ database   ← KHÔNG nhận position làm nguồn sự thật
2. đối chiếu với position client gửi kèm (chốt kiểm tra, xem 6.3)
3. dựng lại item thứ N ở server
4. nếu là THẺ GẶP TỪ (dạng ①): bỏ qua bước 5-6, chỉ position += 1
   ngược lại: chấm
5. cập nhật word_mastery hoặc grammar_mastery
6. nếu là item chốt buổi và đúng thì final_correct += 1
7. position += 1; nếu position == 135 thì đóng buổi (5.2)
8. trả về { đúng/sai, đáp án đúng, item kế tiếp }
```

Thẻ gặp từ đi qua cùng một Server Action như mọi item khác, nhưng **không chấm và không đụng mastery** — nó chỉ đẩy vị trí. Cho nó dùng chung đường thay vì làm một route "next" riêng, để chốt kiểm tra ở 6.3 và luật đóng buổi ở bước 7 áp cho mọi item, không có ngoại lệ nào phải nhớ.

Bước 1 là điều quan trọng nhất. Nếu server tin `position` do trình duyệt gửi, người dùng có thể khai bừa vị trí để nhảy tới câu dễ, hoặc ghi mastery cho từ chưa hề học.

### 6.2 Bốn hàm thuần

```
lib/lesson/item-plan.ts    itemAt(position) → { loại câu, chỉ số từ }
lib/lesson/build-item.ts   buildItem(spec, words, seed) → câu hỏi + phương án
lib/lesson/grade.ts        gradeItem(item, answer) → { đúng?, đáp án đúng }
lib/mastery/apply.ts       masteryDelta(hiện tại, đúng?) → dòng mastery mới
```

`itemAt` là chỗ dễ sai nhất — nó chỉ là phép chia, nhưng chia nhầm một bậc thì cả buổi lệch. Tách thành hàm thuần để phủ đủ mọi biên mà không cần dựng server.

### 6.3 Bấm hai lần

Lỗ hổng thật của thiết kế "server giữ vị trí": bấm nhanh hai lần, hoặc mạng chậm rồi bấm lại, sinh ra hai lần `submitAnswer` → `position` nhảy hai bậc, **bỏ qua một câu mà không ai biết**.

Client gửi kèm vị trí nó **tin rằng** mình đang trả lời. Server so với vị trí thật; lệch thì đây là lần gửi trùng hoặc đã cũ, server **không làm gì cả** và chỉ trả về item hiện tại.

Vị trí do client gửi chỉ dùng làm **chốt kiểm tra**, không bao giờ làm nguồn sự thật.

### 6.4 Phương án nhiễu — chuỗi dự phòng

`buildDistractors(từ đích, kho, seed)` lấy 3 phương án sai theo thứ tự ưu tiên:

1. Từ **cùng buổi, cùng loại từ**
2. Chưa đủ 3 → **cùng buổi, khác loại từ**
3. Vẫn chưa đủ → **toàn kho 605 từ**

Buổi nào cũng có 29 từ khác nên bậc 3 gần như không bao giờ chạm tới, nhưng phải có để hàm không bao giờ trả về thiếu phương án — loại lỗi chỉ lộ ra ở buổi thứ 14 khi tình cờ gặp một buổi lệch loại từ.

### 6.5 Route

```
app/(app)/
  dashboard/page.tsx           20 dòng nay BẤM ĐƯỢC
  learn/[lessonId]/page.tsx    thay trang tạm bằng luồng học thật
```

Vào `/learn/[id]` của buổi đang khoá thì đẩy về `/dashboard`. **Kiểm ở server**, không dựa vào việc giấu link — vì lát này làm dòng dashboard bấm được, nên URL gõ tay là đường tấn công thật.

---

## 7. Xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| Mất mạng lúc gửi đáp án | Nút chuyển "Đang gửi…", lỗi thì hiện nút thử lại. **Không** tự đẩy sang câu sau |
| Gửi trùng do bấm hai lần | Server không làm gì, trả về item hiện tại (6.3) |
| Supabase ngủ hoặc lỗi | `error.tsx` của nhóm `(app)` đã có từ lát 1a, dùng lại |
| Trình duyệt không hỗ trợ Web Speech | **Ẩn nút nghe**, không hiện nút hỏng. Spec tổng thể mục 9.5 đã liệt kê đây là rủi ro đã biết |
| Vào buổi đang khoá | Đẩy về `/dashboard`, kiểm ở server |

---

## 8. Kiểm thử

### Vitest — hàm thuần

`itemAt` phủ mọi biên: item đầu cụm, cuối cụm, chỗ chuyển từ ③ sang cụm sau, item đầu của chốt buổi, item cuối cùng (134), và vị trí quá biên (135).

`buildDistractors` phủ cả ba bậc dự phòng, kể cả trường hợp giả lập một buổi mà loại từ đích chỉ có một từ duy nhất. Cộng một test khẳng định **tính tất định**: cùng seed luôn cho cùng bộ phương án.

`gradeItem` và `masteryDelta` phủ đúng/sai và ngưỡng `mastered`.

### Vitest — tích hợp, chạy hết một buổi

Gọi thẳng logic chấm với một tài khoản test, đi hết 135 item, rồi khẳng định `status = 'completed'`, `score` đúng công thức, và **buổi 2 chuyển sang `available`**. Đây là bằng chứng vòng mở khoá thật sự khép kín.

Không làm việc này bằng Playwright — 135 lần bấm qua trình duyệt là hàng phút mỗi lần chạy.

Test này phải tuân thủ mục 3.1: chỉ xoá theo `user_id` của chính nó.

### Playwright — 3 kịch bản

Cho thứ chỉ trình duyệt mới chứng minh được:

1. Mở buổi 1, thấy thẻ từ đầu tiên
2. Trả lời một câu → phản hồi đúng/sai hiện ngay
3. Tải lại trang giữa buổi → quay đúng vị trí đang dở

---

## 9. Giả định

1. Người học đi hết buổi trong một hoặc vài lần ngồi; không có nhu cầu học hai buổi song song trên hai tab. Mở hai tab cùng một buổi sẽ được chốt kiểm tra ở 6.3 xử lý — tab cũ gửi vị trí lệch và bị bỏ qua.
2. Chất lượng giọng Web Speech API khác nhau giữa các trình duyệt; nếu không đạt thì phương án dự phòng là bỏ nút nghe, vẫn $0.
3. `submitAnswer` và bốn hàm thuần ở mục 6.2 là thứ lát 1c **mở rộng**, không thay thế. Ôn tập và kiểm tra khác buổi học ở ba chỗ — phạm vi câu hỏi rộng hơn, có đồng hồ ở server, có ngưỡng pass/fail — nhưng cơ chế chấm và cập nhật mastery là một.

---

## 10. Bước tiếp theo

Chuyển sang skill `writing-plans` để lập kế hoạch triển khai chi tiết cho lát 1b.
