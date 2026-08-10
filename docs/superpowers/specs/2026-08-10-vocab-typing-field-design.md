# Thiết kế: ô gõ lại từ trong thẻ từ vựng

**Ngày:** 2026-08-10
**Trạng thái:** Đã duyệt thiết kế, chờ lát 1b triển khai
**Tiền đề:** [Thiết kế tổng thể](2026-08-06-english-learning-web-design.md) §6.3 · Phase 0 đã hoàn tất

---

## 1. Vấn đề

Bước ① GẶP TỪ trong spec tổng thể là một flashcard thuần đọc: từ + IPA + nghĩa + nút nghe. Người học chỉ nhìn và nghe, tay không làm gì. Mặt chữ của từ tiếng Anh vì thế không được khắc lại bằng động tác.

Thêm một ô nhập ngay dưới mỗi từ để gõ lại từ đó.

## 2. Phạm vi

Ô gõ xuất hiện ở **mọi chỗ hiển thị một thẻ từ vựng**:

| Nơi | Lát | Ghi chú |
|---|---|---|
| `learn/[lessonId]` bước ① GẶP TỪ | 1b | 3 cụm × 10 từ = 30 ô gõ mỗi buổi |
| `/stats` — danh sách từ hay sai, từ đã học | 1d | Cùng component |

**Không** xuất hiện ở bước ② LUYỆN và ③ CHỐT — hai bước đó đã có ô nhập riêng phục vụ việc chấm điểm, thêm ô thứ hai chỉ gây nhiễu.

**Lát 1a không bị ảnh hưởng.** Lát 1a chưa có màn hình từ vựng nào, nên spec và kế hoạch 1a giữ nguyên.

## 3. Quyết định đã chốt

| # | Vấn đề | Quyết định | Lý do |
|---|---|---|---|
| 1 | Có chấm đúng/sai không | **Không.** Gõ tự do, không so sánh, không phản hồi | Việc đánh giá đã do bước ② và ③ đảm nhận. Thêm một cơ chế chấm nữa là thêm một nguồn sai lệch cho cùng một thứ |
| 2 | Có ghi `word_mastery` không | **Không.** Không chạm database | Kéo theo: không migration, không đụng RLS, không route mới |
| 3 | Che từ tiếng Anh | **Có nút che/hiện**, chỉ che từ tiếng Anh | Từ hiện ngay trên ô gõ thì gõ chỉ là chép. Che đi thì IPA và nghĩa tiếng Việt trở thành gợi ý để nhớ ra mặt chữ |
| 4 | Công tắc che đặt ở đâu | **Một công tắc cho cả màn hình**, nhớ trong `localStorage`, mặc định *hiện* | Công tắc riêng từng thẻ thì học 30 từ phải bấm 30 lần — tính năng sẽ chết vì phiền |
| 5 | Chữ đã gõ có lưu không | Giữ trong state màn hình theo `wordId`; mất khi tải lại trang | Hệ quả trực tiếp của quyết định 2 |

## 4. Component `WordCard`

`src/components/word-card.tsx` — Client Component, vì cần state cho ô nhập và nút che/hiện.

```
WordCard({ word, hidden, onToggleHidden, typed, onTyped })

┌──────────────────────────────┐
│  ███████        🔊   👁 hiện │   từ bị che + nút bật/tắt
│  /kənˈsɜːrn/  (n)            │   IPA + từ loại: luôn hiện
│  sự quan tâm, lo lắng        │   nghĩa tiếng Việt: luôn hiện
│                              │
│  Gõ lại từ                   │
│  ┌────────────────────────┐  │
│  │ conc_                  │  │   gõ tự do, không chấm
│  └────────────────────────┘  │
└──────────────────────────────┘
```

Component không giữ state của riêng nó — cả `hidden` lẫn `typed` đều do cha truyền xuống. Nhờ vậy nó thuần trình bày, dùng lại được ở `/stats` mà không kéo theo giả định nào về luồng học.

`onToggleHidden` là prop **tuỳ chọn**, và đó là cách hoà giải giữa "nút nằm ngay tầm mắt" với "công tắc của cả màn hình" ở quyết định 4:

| Màn hình | Truyền `onToggleHidden`? | Kết quả |
|---|---|---|
| Bước ① GẶP TỪ — mỗi lúc chỉ một thẻ | Có | Nút hiện trên thẻ, ngay cạnh từ. Bấm là đổi giá trị dùng chung |
| `/stats` — danh sách nhiều thẻ | Không | Thẻ không có nút. Một công tắc duy nhất đặt ở đầu danh sách |

Cùng một giá trị `hidden` điều khiển mọi thẻ ở cả hai chỗ. Danh sách không gắn nút lên từng dòng, vì mười nút giống hệt nhau mà bấm cái nào cũng ra cùng kết quả là giao diện nói dối về phạm vi tác dụng của nó.

Khi che, từ tiếng Anh được thay bằng khối màu **cùng chiều rộng** với từ gốc, để bật/tắt không làm giật layout. Chiều rộng suy từ độ dài từ, không đo DOM.

IPA và nghĩa tiếng Việt không bao giờ bị che — chúng chính là gợi ý.

## 5. Trạng thái

Hai thứ, sống ở hai nơi khác nhau:

```
hidden   → một giá trị cho cả màn hình
           đọc/ghi localStorage, khoá 'vocab.hideWord'
           đọc trong useEffect sau khi mount, không đọc lúc render
           (server render không có localStorage — đọc lúc render là lỗi hydration)

typed    → Map<wordId, string> trong state của component cha
           không ghi đi đâu; tải lại trang là rỗng
```

Đặt `typed` ở cha chứ không ở từng thẻ, để quay lại từ trước trong cùng cụm vẫn thấy chữ đã gõ. Nếu để trong thẻ, thẻ bị unmount lúc chuyển từ là mất chữ.

## 6. Chi tiết dễ bị bỏ sót — bàn phím tiếng Việt

Người học gõ tiếng Việt bằng Telex hoặc VNI. Gõ `concern` khi IME tiếng Việt đang bật rất dễ ra `conceern`, và autocorrect của trình duyệt còn tự "sửa" từ tiếng Anh thành từ khác. Ô nhập phải khai báo đủ:

```
lang="en"  inputMode="text"  autoComplete="off"
autoCorrect="off"  autoCapitalize="off"  spellCheck={false}
```

Web không tắt được IME của hệ điều hành. `lang="en"` chỉ giúp bàn phím ảo trên điện thoại chuyển sang bố cục tiếng Anh — đó là mức can thiệp xa nhất có thể, và **đây là giới hạn được thừa nhận**: trên máy tính, người học vẫn phải tự tắt bộ gõ tiếng Việt.

Ô nhập cần `<label>` gắn đúng `id`, không dùng `placeholder` thay nhãn.

## 7. Kiểm thử

Component không chấm, không lưu, không suy diễn — không có hàm thuần nào để Vitest bám vào. Việc kiểm thử thuộc về Playwright ở lát 1b:

1. Gõ vào ô của từ 1 → sang từ 2 → quay lại từ 1: chữ đã gõ vẫn còn
2. Bấm "che": từ tiếng Anh biến mất, IPA và nghĩa tiếng Việt vẫn còn
3. Tải lại trang: công tắc che vẫn nhớ trạng thái, ô gõ đã rỗng
4. Che rồi hiện: bố cục không xê dịch

## 8. Giả định

1. Lát 1b sẽ dựng `WordCard` theo thiết kế này; lát 1d dùng lại đúng component đó, không viết bản sao.
2. Không hỗ trợ gõ trên bàn phím vật lý có IME tiếng Việt bật sẵn — xem mục 6.
3. Nếu về sau muốn chấm chính tả, đó là tính năng khác và cần thiết kế riêng: nó kéo theo `word_mastery`, quy tắc so khớp (hoa/thường, khoảng trắng, dạng số nhiều như `concern` ↔ `concerns`), và ảnh hưởng tới bài bổ túc.

## 9. Bước tiếp theo

Sửa §6.3 của spec tổng thể để bước ① GẶP TỪ có ô gõ. Không lập kế hoạch triển khai riêng — công việc này nằm gọn trong lát 1b, sẽ được nhắc tới khi viết spec và kế hoạch 1b.
