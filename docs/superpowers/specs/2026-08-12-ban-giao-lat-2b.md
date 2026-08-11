# Bàn giao từ lát 2a sang lát 2b

**Ngày:** 2026-08-12
**Nguồn:** ledger thực thi lát 2a (14 task, 28 commit, merge `c6664e5`)

Tài liệu này giữ lại những gì **không nằm trong lịch sử git** — các quyết định đã
phân xử, các khẳng định đã mất và phải dựng lại, và những cái bẫy đã biết. Đọc
trước khi bắt đầu 2b.

---

## 1. Khẳng định đã mất, phải dựng lại ở 2b

Lát 2a xoá luồng học cũ và cùng với nó là 12 tệp test. Test đơn vị giảm **228 →
172**, kịch bản e2e **31 → 29**. Phần lớn mất theo mã đã chết, nhưng những
khẳng định dưới đây bảo vệ thứ vẫn còn giá trị:

**Chống rò dữ liệu ra client — ưu tiên cao nhất**
1. `is_correct` bị thu hồi SELECT khỏi `authenticated` (lỗi `42501`) trong khi
   các cột khác của `assessment_items` vẫn đọc được.
2. `wrong_items_for_assessment` từ chối **cả chính chủ** khi bài còn
   `in_progress` — chặn việc dò từng câu để biết đúng/sai.

**Đường ghi mastery — không còn tồn tại ở đâu dưới `src/`**
3. `src/lib/mastery/write.ts` đã bị xoá (import treo sau khi luồng cũ biến mất,
   và `grep applyMastery` cho 0 kết quả). Luật tính (`masteryDelta` trong
   `src/lib/mastery/apply.ts`) **còn** và vẫn được `tests/mastery.test.ts` phủ;
   **đường ống thì mất**. Hai bài học đã trả giá, ghi trong bản cũ
   (`git show 93b7920:src/lib/mastery/write.ts`):
   - **Bắt buộc `throw` khi lỗi đọc.** Nuốt lỗi khiến `current = null`,
     `masteryDelta` tính lại từ 0, rồi `upsert` **ghi đè** toàn bộ tiến độ đã
     tích luỹ mà không ai biết.
   - `grammar_mastery` khoá theo `(user_id, grammar_lesson_id)`, **không** suy
     ra được từ `question_id`.
4. Khẳng định tích hợp cho đường ghi đó (từ `lesson-completion.test.ts` đã xoá):
   câu ngữ pháp ghi `grammar_mastery` theo đúng khoá kép, đúng và sai **đều**
   đếm; thẻ gặp từ **không** đụng `word_mastery`; trả lời lại **không** cộng
   mastery hai lần.

**Toàn vẹn dữ liệu / đồng thời**
5. CAS chặn double-submit song song (đúng một lần thắng); double-click gửi vị
   trí cũ vẫn trả điểm **thật**, không phải 0%.
6. `finalize_assessment_items` đóng bài + ghi điểm trong **đúng một** UPDATE;
   từ chối người không phải chủ; chặn `p_pass_mark`/`p_now` NULL (`22004`).

**Hiển thị**
7. Lớp chắn cho ép kiểu quan hệ nhúng: nếu postgrest-js trả quan hệ 1-1 dạng
   **mảng** thay vì object, ô đó render **rỗng mà không có lỗi**. Dashboard hiện
   không còn dùng quan hệ nhúng (đã gỡ), nhưng 2b sẽ thêm lại khi hiện điểm.

## 2. `word_mastery.mastered` phải định nghĩa lại — bắt buộc

Luật cũ đếm đúng/sai của luồng 135 item, nơi mỗi từ bị chạm ~4 lần một buổi.
Cấu trúc mới chạm **1 lần/buổi**. Giữ nguyên ngưỡng thì con số "đã thuộc /605"
trên dashboard mất ý nghĩa. Đây là việc bắt buộc của 2b, không phải tuỳ chọn.

## 3. `/stats` đang hiện `0 / 2` và streak `0` cho mọi người học

Nhịp học nay đo **duy nhất** bằng bài đã nộp, mà 2a cố ý chưa có bài thi nào.
Hệ quả: việc học từ vựng (`lesson_cursor`) không tính là sự kiện học nào cả.
Quyết ở 2b hoặc 2c: hoặc gộp `lesson_cursor.updated_at` vào `eventTimes`, hoặc
ẩn thẻ nhịp học tới khi có bài thi.

**Lưu ý nếu chọn phương án đầu:** `lesson_cursor.updated_at` chỉ có
`default now()`, **không có trigger `ON UPDATE`** — mọi đường ghi hiện tại tự
set nó. Nếu cột này thành load-bearing, một đường ghi mới quên set sẽ hỏng âm
thầm.

## 4. Cái bẫy trong `renderCard` — sửa khi chạm lại

```ts
renderCard(lite, blankAnswer, note)   // hai string trần cạnh nhau
```

Đảo vị trí hai tham số **vẫn biên dịch được**, và sẽ đẩy đáp án câu điền từ vào
trường `note` của `VocabCard` — tức rò xuống trình duyệt đúng thứ mà
`0004_rls.sql` đã cố tình thu hồi khỏi `authenticated`.

Hôm nay có **hai** chốt chặn thật (đã kiểm chứng bằng cách dựng lại cả hai kịch
bản hỏng): đảo ở chữ ký làm `tests/corpus.test.ts` đỏ trên 183 case; đảo ở nơi
gọi làm `tests/load-cards.test.ts` đỏ ở hai chỗ. Nên đây là **cái bẫy có chốt**,
không phải lỗ hổng đang mở. Khi 2b chạm lại `renderCard`, đổi sang một tham số
object đặt tên — khoảng 5 dòng.

## 5. Bẫy trong bộ e2e

**`drainSaves()` chỉ đợi request ĐÃ bắt đầu**, không đợi một hẹn giờ debounce
500ms chưa bắn. Ba kịch bản cần nó đã được vá bằng `waitForResponse` đặt trước
hành động. **Hai kịch bản còn hở** (kết thúc ngay sau một lần đổi thẻ net-nonzero
mà không đợi gì):

- `mục lục liệt kê 30 từ và nhảy thẳng tới từ được bấm` (index 0 → 19)
- `mục lục đánh dấu từ đang xem` (index 0 → 1)

Hậu quả tối đa: rò một dòng `lesson_cursor` **của tài khoản test** sang kịch bản
kế tiếp, tự lành ở `afterEach` sau đó, và nếu lộ ra thì lộ thành test đỏ nhìn
thấy được. Không đụng dữ liệu người thật.

*(Kịch bản `đi tới rồi lui giữa các thẻ` **an toàn** — 0→1→0 là net-zero nên
`flushCursor` no-op, không POST nào được gửi. Đừng nhầm.)*

## 6. Flake hạ tầng đã biết — đừng đổ tội cho mã

Bộ e2e chạy trên **chính database production** (Supabase Free tier). Hai chữ ký
flake đã gặp nhiều lần:

- `PGRST303 "JWT issued at future"` — lệch đồng hồ giữa máy và Supabase.
- `drainSaves: còn N POST treo sau 5s` — backend trả lời chậm quá deadline.
  Trước khi có deadline (thêm ở Task 12), đúng tình huống này treo **17 phút**
  rồi mới timeout, vì timeout của Playwright không huỷ được vòng `while`.

Cả hai không tái hiện khi chạy lại. Nghi hạ tầng trước, đừng sửa mã.

## 7. Ngoại lệ đã duyệt

Dự án cấm nuốt lỗi Supabase. **Ngoại lệ duy nhất** là ghi `lesson_cursor` ở nền
trong `src/components/vocab/deck.tsx` — mất một dấu trang không đáng dựng lên
thông báo lỗi giữa lúc học, và lần đổi thẻ kế tiếp ghi đè lại đúng. Ngoại lệ
kèm chú thích tại chỗ. **Đừng nhân bản nó sang chỗ khác.**

Giới hạn đã chấp nhận: Server Action fetch của Next.js **không đặt `keepalive`**,
nên rời trang không qua `<Link>` (đóng tab, nút back) có thể huỷ lần ghi con trỏ
cuối — vào lại lệch một thẻ.

## 8. Việc theo sau, không chặn gì

- `0010_phase2_reset.sql` revoke `anon` trên hai bảng mới, **chặt hơn**
  `0004_rls.sql` — tệp đó chưa từng revoke `anon` trên `profiles`,
  `assessments`, `word_mastery`, `grammar_mastery`. Hiện RLS chặn
  (`auth.uid()` null → 0 dòng), nhưng đó đúng là cái bẫy mà chính `0004` đã ghi
  chú cho `vocab_words`. Nên áp cùng cách cho các bảng riêng tư cũ.
- `blank_answers_for_lesson` được `grant execute ... to authenticated`
  (`0007:63`). Một người học đăng nhập gọi thẳng RPC là có đủ 30 đáp án của buổi
  bất kỳ. Spec §11.5 đã chấp nhận ("gian lận là tự hại mình"), nhưng spec §4.1
  gọi nó là "RPC giữ đáp án ngoài tầm trình duyệt" — mô tả đó **rộng hơn sự
  thật**. Nên quyết lại có ý thức ở 2b, khi cột này thành đáp án thi thật.
- `npm run dev` của Next.js 16 tự chèn khối "agent rules" vào `CLAUDE.md`, kèm
  câu tự nhận là chỉ thị bảo commit nó. Tắt bằng `experimental: { agentRules: false }`
  trong `next.config.ts` nếu thấy phiền.

## 9. Module để dành, chưa ai gọi

- `src/lib/exam/distractors.ts` — `pickDistractors`, có test riêng, sẵn cho 2b.
- `src/lib/mastery/apply.ts` — `masteryDelta`, có test riêng; thiếu đường ống
  (mục 1.3).
- `saveCursor` trong `(app)/vocab/actions.ts` — đang dùng; `NOTE_MAX` ở
  `src/lib/vocab/note.ts` **phải** ở tệp riêng vì trong tệp `"use server"` mọi
  export đều thành HTTP endpoint.

## 10. Nút "Làm bài" hiện dẫn đi đâu

`/vocab/learn/[lessonId]/sap-co` — một trang thật ghi "Bài thi sắp có". Lát 2b
thay bằng Server Action dựng đề rồi chuyển sang `/exam/[id]`, và **xoá thư mục
`sap-co`**. Ô "Ôn tập" trên `/vocab` cũng đang hiện chữ "sắp có" theo cùng quy
ước — sửa cùng lúc.
