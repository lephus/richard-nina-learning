# Thiết kế: ô gõ lại từ ở thẻ gặp từ

**Ngày:** 2026-08-10
**Trạng thái:** Đã triển khai
**Tiền đề:** [Thiết kế tổng thể](2026-08-06-english-learning-web-design.md) §6.3 · [Lát 1b](2026-08-07-phase1b-lesson-flow-design.md)

---

## 1. Vấn đề

Thẻ gặp từ là màn hình thuần đọc: từ + IPA + nút nghe + đồng nghĩa + nghĩa + câu ví dụ, rồi bấm "Tiếp". Người học chỉ nhìn và nghe, tay không làm gì, nên mặt chữ không được khắc lại bằng động tác.

Thêm một ô nhập ngay dưới mỗi từ để gõ lại từ đó.

## 2. Quyết định đã chốt

| # | Vấn đề | Quyết định | Lý do |
|---|---|---|---|
| 1 | Có chấm đúng/sai không | **Không.** Gõ tự do, không so sánh, không phản hồi | Việc đánh giá đã do câu luyện tập và câu điền từ đảm nhận. Thêm một cơ chế chấm nữa là thêm một nguồn sai lệch cho cùng một thứ |
| 2 | Có ghi `word_mastery` không | **Không.** Không chạm database | Kéo theo: không migration, không RPC, không Server Action |
| 3 | Che từ tiếng Anh | **Có nút che/hiện** | Từ hiện ngay trên ô gõ thì gõ chỉ là chép. Che đi thì IPA và nghĩa tiếng Việt thành gợi ý để nhớ ra mặt chữ |
| 4 | Che thì che những gì | Từ chính **và câu ví dụ tiếng Anh** | §4 |
| 5 | Công tắc che lưu ở đâu | **Cookie**, đọc ở Server Component | §5 |
| 6 | Chữ đã gõ có giữ không | Không. Sang từ mới là rỗng | §6 |

## 3. Chỗ lắp

Tất cả nằm trong ba file đã có, không thêm component mới:

| Tệp | Sửa gì |
|---|---|
| `src/components/lesson/flashcard.tsx` | Ô nhập, nút che/hiện, khối giữ chỗ khi che |
| `src/components/lesson/lesson-runner.tsx` | Giữ trạng thái `hideWord`, ghi cookie khi bật/tắt |
| `src/app/(app)/learn/[lessonId]/page.tsx` | Đọc cookie, truyền `initialHideWord` xuống |

## 4. Che thì phải che cả câu ví dụ

Thẻ gặp từ hiển thị câu ví dụ **đầy đủ** — `buildItem` đã điền `blankAnswer` vào chỗ `___` mà Phase 0 khoét sẵn. Tức là câu ví dụ chứa chính đáp án.

Che mỗi từ chính mà để câu ví dụ hiện thì nút "Che từ" chỉ là trang trí: người học liếc xuống một dòng là thấy từ.

Nên khi che: giấu **từ chính** và **câu ví dụ tiếng Anh**. Giữ lại IPA, từ đồng nghĩa, nghĩa tiếng Việt, định nghĩa tiếng Anh và **bản dịch tiếng Việt của câu ví dụ** — tất cả đều là gợi ý, không phải đáp án.

Khối giữ chỗ khi che rộng theo độ dài từ (`${word.word.length}ch`) chứ không phải một chiều rộng cố định: nút bật/tắt nằm cùng hàng với từ, layout giật là bấm trượt.

## 5. Cookie chứ không localStorage

Công tắc che là **một giá trị cho cả buổi học**, không phải cho từng thẻ — 30 thẻ mà phải bấm che 30 lần thì không ai dùng. Mặc định là **hiện**.

Chỗ lưu phải là cookie, không phải localStorage. Lý do là một lỗi mà localStorage không tránh được:

> Trình duyệt vẽ HTML của server **trước khi** React hydrate. Nếu quyết định che nằm ở client (đọc localStorage trong `useEffect`), thì khung hình đầu tiên đã vẽ từ ở trạng thái hiện, rồi mới bị che ở khung hình sau. Người bật che nhìn thấy đúng cái từ mình đang cố nhớ, loé lên một nhịp. Tính năng tự phá chính nó.

Cookie thì Server Component đọc được, nên HTML đầu tiên đã đúng. `SameSite=Lax`, `max-age` một năm — đây chỉ là tuỳ chọn hiển thị, không mang gì nhạy cảm.

Trạng thái sống ở `LessonRunner` chứ không ở `Flashcard`: `Flashcard` remount theo `key={position}` mỗi lần sang từ mới, giữ ở đó thì bật che xong qua từ sau là mất.

## 6. Chữ đã gõ không được giữ

Ô gõ là state cục bộ của `Flashcard`. Vì thẻ remount theo `key={position}`, sang từ mới là ô rỗng trở lại — không cần code gì thêm để dọn.

Không có nút quay lại từ trước trong luồng học (buổi học là một chuỗi 135 mục đi thẳng, vị trí do server giữ), nên không có tình huống "quay lại và mong thấy chữ mình đã gõ".

## 7. Bàn phím tiếng Việt

Người học gõ tiếng Việt bằng Telex hoặc VNI. Gõ `concern` khi IME tiếng Việt đang bật rất dễ ra `conceern`, và autocorrect của trình duyệt còn tự "sửa" từ tiếng Anh thành từ khác. Ô nhập khai báo đủ:

```
lang="en"  inputMode="text"  autoComplete="off"
autoCorrect="off"  autoCapitalize="off"  spellCheck={false}
```

Web không tắt được IME của hệ điều hành. `lang="en"` chỉ giúp bàn phím ảo trên điện thoại chuyển sang bố cục tiếng Anh — đó là mức can thiệp xa nhất có thể, và **đây là giới hạn được thừa nhận**: trên máy tính, người học vẫn phải tự tắt bộ gõ tiếng Việt.

## 8. Kiểm thử

Không có logic nghiệp vụ nào để unit test — không chấm, không lưu, không suy diễn. Ba kịch bản trong `e2e/lesson.spec.ts`:

1. Ô gõ nhận chữ, và rỗng trở lại khi sang từ mới.
2. Che từ thì giấu cả từ lẫn câu ví dụ, giữ IPA và nghĩa, ô gõ vẫn còn.
3. Công tắc che giữ nguyên qua từ mới (bảo vệ việc trạng thái nằm ở `LessonRunner`) và qua lần tải lại (bảo vệ đường cookie).

## 9. Việc còn mở

Nếu về sau muốn chấm chính tả, đó là tính năng khác và cần thiết kế riêng: nó kéo theo `word_mastery`, quy tắc so khớp (hoa/thường, khoảng trắng, dạng biến cách như `concern` ↔ `concerns`), và ảnh hưởng tới bài bổ túc.
