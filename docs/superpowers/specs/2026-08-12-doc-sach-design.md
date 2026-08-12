# Thiết kế: Trình đọc sách gốc `/doc-sach`

> Tính năng độc lập, không đụng vào phần việc của lát 2b.
> Không có bảng nghiệp vụ mới, không sửa bảng cũ — chỉ thêm một bucket Storage.

**Mục tiêu:** đọc tuần tự bản scan của `VOCAB. Toeic Practice Club.pdf` trên web,
lật trang 1→112 như đọc sách giấy, chạy được cả khi đã deploy.

**Không thuộc phạm vi:** nhảy từ một từ vựng sang trang sách chứa nó; đọc các
file ngữ pháp `.docx`; lưới thumbnail; zoom/pan trong trang; chế độ hai trang.

---

## 1. Vấn đề gốc: 127 MB ảnh không có trong git

`data/images/` chứa 112 file PNG 300 DPI (2550×3300), tổng **127 MB**, và đang
nằm trong `.gitignore` cùng với `toeic-resource/`. Chúng chỉ tồn tại trên máy
người phát triển.

Đây là ràng buộc quyết định toàn bộ thiết kế: một trang web đọc thẳng
`data/images/` sẽ chạy ngon lúc `next dev` và **hỏng ngay khi deploy**, vì thư
mục đó không đi cùng mã nguồn. Nên phần lưu trữ phải giải quyết trước, phần
giao diện chỉ là hệ quả.

Cũng vì vậy mà không chọn cách chép ảnh vào `public/`: 127 MB (hoặc 28 MB sau
nén) đi vào git là gánh nặng vĩnh viễn cho mọi lần clone, để đổi lấy đúng một
thứ mà Storage đã làm tốt hơn.

## 2. Nén ảnh — số đo thật, không phải ước lượng

Đo bằng `cwebp` trên ba trang đại diện (đầu, giữa, cuối sách):

| Trang PDF | Gốc PNG | 2000px q82 | **1600px q80** | 1600px q72 | 1240px q75 |
|---|---|---|---|---|---|
| 3 | 1318 KB | 413 KB | **307 KB** | 271 KB | 201 KB |
| 50 | 1312 KB | 344 KB | **254 KB** | 220 KB | 166 KB |
| 114 | 826 KB | 259 KB | **189 KB** | 166 KB | 125 KB |

**Chọn 1600px, chất lượng 80** → khoảng **28 MB cho cả 112 trang**, giảm 78% so
với bản gốc. Đã mở lại ảnh kết quả để xem tận mắt: chữ thân bài, ký hiệu IPA,
phần tô vàng và ảnh minh họa màu đều sắc nét, không thấy nhiễu nén.

Không lấy 1240px vì sách có ảnh minh họa nhỏ và IPA cỡ chữ bé — đó là chỗ hỏng
trước tiên khi thu nhỏ, mà lại đúng là chỗ người học cần nhìn rõ. 2000px thì
tốn thêm 40% dung lượng cho phần chi tiết mà màn hình thường không hiển thị hết.

## 3. Đánh số trang — ba hệ số cùng tồn tại

Sách **có** số in ở góc dưới phải, và nó lệch với số trang PDF. Đã kiểm chứng
trực tiếp trên ảnh: trang PDF 3 in số `2`, trang PDF 114 in số `113`.

| Khái niệm | Dải | Ví dụ | Dùng ở đâu |
|---|---|---|---|
| Trang đọc | 1–112 | 48 | URL, nhãn, mọi thứ người dùng thấy |
| Tên file Storage | `001.webp`–`112.webp` | `048.webp` | chỉ trong bucket |
| Trang PDF gốc | 3–114 | 50 | chỉ trong script đóng gói |
| Số in trên sách | 2–113 | 49 | chú thích phụ trên nhãn |

Trang PDF 1–2 là bìa, không render, nên trang đọc 1 ứng với PDF 3.

Quy đổi được **áp dụng một lần duy nhất lúc nén ảnh** — file đã mang tên theo
trang đọc, nên runtime không bao giờ cộng trừ chỉ số. Đây là điểm chống sai
lệch quan trọng nhất của thiết kế: mọi lỗi off-by-one chỉ có thể xảy ra trong
một script chạy offline, không thể xảy ra trên đường phục vụ người dùng.

Nhãn hiển thị **"Trang 48/112 · sách in: 49"**. Nói thẳng cả hai số vì người đọc
sẽ nhìn thấy `49` ở góc ảnh và nghi ngờ web đếm sai. Giấu đi thì tạo ra một câu
hỏi không có chỗ trả lời.

## 4. Bucket riêng tư, không phải công khai

Bucket `book-pages` đặt `public = false`; policy trên `storage.objects` chỉ cho
role `authenticated` thực hiện `select`. Không mở insert/update/delete cho người
dùng — ảnh chỉ do script đẩy lên bằng service key.

Lý do không dùng bucket công khai dù nó cache CDN tốt hơn và ít mã hơn: đây là
tài liệu có bản quyền của nhóm Toeic Practice Club. Bucket công khai nghĩa là
đăng cả cuốn sách của người khác lên internet ở một URL đoán được. Cả app vốn
đã nằm sau đăng nhập, nên để sách công khai là chỗ rò rỉ duy nhất, vì đúng một
lý do là tiện.

**Đánh đổi phải chấp nhận:** signed URL đổi token mỗi lần sinh, nên trình duyệt
không tái dùng được ảnh đã tải giữa các lần vào trang — mỗi lần vào một trang
là một lượt tải mới, kể cả khi trang đó vừa được xem trước đó trong phiên.

Bản thiết kế ban đầu định giảm nhẹ đánh đổi này bằng cách xin luôn signed URL
cho **trang kế** trong cùng một lời gọi `createSignedUrls`, rồi phát
`<link rel="prefetch" as="image">` cho URL đó. Ý này đã bị bỏ ở vòng soát toàn
nhánh trước khi merge, vì nó tự mâu thuẫn với đúng tiền đề vừa nêu ở trên:
token đổi mỗi lần sinh nghĩa là URL ký cho trang kế **lúc render trang hiện
tại** chắc chắn khác với URL mà trang kế **tự ký cho chính nó** khi người đọc
thật sự lật tới — hai URL khác `?token=...` là hai khoá cache HTTP khác nhau,
nên trình duyệt không bao giờ nhận ra chúng cùng trỏ tới một ảnh và luôn tải
lại từ đầu. Nói cách khác, phần "prefetch" chỉ tốn thêm đúng gấp đôi egress
Storage và dữ liệu di động của người học, không đổi lại được một byte
cache-hit nào. Đã bỏ hẳn phần này thay vì dựng thêm một tầng cache ký URL —
chi phí ~250 KB/trang cho một lượt xem một lần vẫn chấp nhận được mà không
cần giảm nhẹ gì thêm.

## 5. Không dùng `next/image`

Next 16 thêm trường `search` vào `remotePatterns`, và `search: ''` chỉ khớp URL
**không có** query string (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md:531`).
Signed URL luôn kèm `?token=...`, nên muốn dùng `next/image` thì phải bỏ trống
`search` — tức mở wildcard cho mọi query, đúng thứ tài liệu khuyến cáo không nên.

Dùng thẻ `<img>` thường. Ảnh đã được nén đúng định dạng và đúng bề rộng ngay
trong pipeline, nên cho qua bộ tối ưu của Next chỉ thêm độ trễ và chi phí hàm
để nhận lại đúng thứ vừa đưa vào.

## 6. Các tệp sẽ thêm

| Tệp | Vai trò |
|---|---|
| `scripts/phase0/06-pack-book-pages.ts` | nén PNG → WebP, đổi tên theo trang đọc, upload |
| `supabase/migrations/0011_book_pages_bucket.sql` | tạo bucket + policy đọc cho `authenticated` |
| `src/lib/book/pages.ts` | logic thuần: kiểm tra biên, quy đổi số, tên file |
| `src/app/(app)/doc-sach/page.tsx` | chuyển hướng sang `/doc-sach/1` |
| `src/app/(app)/doc-sach/[page]/page.tsx` | trang đọc (server component) |
| `src/components/book/PageKeys.tsx` | client component nhỏ, chỉ bắt phím ←/→ |
| `tests/book-pages.test.ts` | unit test cho `src/lib/book/pages.ts` |
| `e2e/book.spec.ts` | e2e cho luồng đọc |

Sửa hai tệp có sẵn:

- `src/app/(app)/layout.tsx` — thêm link "Đọc sách" vào header.
- `package.json` — khai báo `sharp` vào `devDependencies` (xem mục 7).

`src/lib/book/pages.ts` tách riêng vì nó gom toàn bộ phần dễ sai (biên và quy
đổi số) vào một chỗ không cần dựng trang, không cần đăng nhập, không cần mạng
để kiểm tra.

## 7. Script đóng gói

Theo đúng khuôn các script `phase0` đã có — chạy lại được nhiều lần, bỏ qua việc
đã làm xong, in tiến độ:

1. Duyệt trang PDF 3→114, tìm `data/images/pNNN-*.png`.
2. `sharp(png).resize({ width: 1600 }).webp({ quality: 80 })`.
3. Đặt tên theo trang đọc (`PDF − 2`, đệm 3 chữ số), upload lên `book-pages`.
4. Bỏ qua file đã có trên bucket, để chạy lại sau khi đứt mạng không phải làm lại từ đầu.
5. Kết thúc in tổng dung lượng và danh sách trang thiếu, nếu có.

**`sharp` phải được khai báo vào `devDependencies`.** Nó đang có sẵn trong
`node_modules` và chạy đúng (đã thử: nén trang 50 ra 261 KB, khớp với số đo
`cwebp` ở mục 2), nhưng chỉ là phụ thuộc **gián tiếp** do Next kéo theo — không
có dòng nào trong `package.json`. Dùng chùa nó nghĩa là một lần nâng cấp Next có
thể làm script chết mà không ai đụng vào script cả. Khai báo tường minh là việc
một dòng, đổi lấy việc không phải đi truy một lỗi như vậy sau này.

## 8. Luồng trang đọc

1. `const { page } = await params` — `params` là Promise ở bản Next này.
2. Parse số. Không phải số nguyên trong 1–112 → `notFound()`.
3. `createSignedUrl('048.webp', 3600)` — chỉ một đường dẫn, đúng trang đang
   xem. Không còn xin trước trang kế (đã bỏ prefetch, xem mục 4): với chỉ một
   đường dẫn cần ký, `createSignedUrl` số ít là lời gọi tự nhiên, và trường
   hợp đặc biệt ở trang 112 — từng phải xin ít hơn một đường dẫn vì
   `113.webp` không tồn tại — biến mất theo, vì giờ không còn "đường dẫn thứ
   hai" nào để bớt đi nữa.
4. Object không tồn tại lộ ra ngay ở bước ký này, không phải lúc `<img>` tải
   hỏng: Supabase trả lỗi `StorageApiError` với `code: "NoSuchKey"` (xem mục
   10). Render `<img>` trang hiện tại khi ký thành công.

Trang nằm trong nhóm `(app)` nên thừa hưởng lớp chặn đăng nhập của
`(app)/layout.tsx`; không viết lại lớp bảo vệ thứ hai ở đây.

## 9. Giao diện

```
┌────────────────────────────────────────────────────┐
│  ‹ Trước    Trang 48/112 · sách in: 49     Sau ›   │
│               [ 48 ] / 112  [Đi]                    │
├────────────────────────────────────────────────────┤
│                                                     │
│              (ảnh trang, rộng hết khung)            │
│                                                     │
└────────────────────────────────────────────────────┘
```

- **Trước** vô hiệu ở trang 1; **Sau** vô hiệu ở trang 112.
- Ô nhập số + nút **Đi** để nhảy thẳng tới trang bất kỳ.
- Phím **←/→** lật trang. Chỉ phần này là client component; phần còn lại của
  trang vẫn chạy trên server.
- Số trang nằm trên URL nên F5, dán link, hay nút back của trình duyệt đều đúng
  chỗ — không cần lưu trạng thái ở đâu cả.
- Phóng to dùng pinch / ctrl+scroll sẵn có của trình duyệt.

Link **"Đọc sách"** phải được thêm vào header `(app)/layout.tsx`. Route build
xong mà không có link thì không tồn tại với người học — đây đúng là lỗi đã xảy
ra một lần ở lát 1b và được ghi lại ngay trong chú thích của `layout.tsx`.

## 10. Xử lý lỗi

| Tình huống | Cách xử lý |
|---|---|
| Số trang ngoài dải hoặc không phải số | `notFound()` |
| `createSignedUrl` lỗi, **không phải** vì object vắng mặt (`error.code !== "NoSuchKey"`) | Thông báo tiếng Việt + nút thử lại; không để trang trắng |
| `createSignedUrl` lỗi **vì object vắng mặt** (`error.code === "NoSuchKey"`) — ảnh chưa upload | Khối "Chưa có ảnh trang này", **giữ nguyên thanh điều hướng** để đi tiếp được |
| Ảnh tải hỏng ở trình duyệt sau khi đã ký thành công (hiếm — ví dụ mạng đứt giữa chừng) | `onError` của `<img>` đổi sang cùng khối "Chưa có ảnh trang này": nội dung không khớp tuyệt đối với lý do, nhưng vẫn ưu tiên để người đọc đi tiếp thay vì thấy ảnh vỡ |

Trường hợp thứ hai không phải phòng xa: script upload chạy tách rời với deploy,
nên hoàn toàn có thể app đã live trong khi bucket còn thiếu trang. Lúc đó người
đọc cần đi tiếp được, không phải mắc kẹt.

Bản thiết kế ban đầu gán tình huống này cho `onError` của `<img>` (dòng cuối
bảng trên) — tưởng ảnh chưa upload chỉ lộ ra lúc trình duyệt thử tải. Thực tế
lộ ra sớm hơn: `createSignedUrl` tự kiểm tra object có tồn tại hay không
**trước khi** phát hành chữ ký, nên với object vắng mặt, lỗi xảy ra ngay ở
server, `src` truyền xuống `<img>` là `null`, và trình duyệt còn chưa kịp thử
tải gì cả — `onError` không bao giờ được gọi trong trường hợp này. Đã kiểm
chứng trực tiếp bằng cách ký thử một trang không tồn tại trên bucket thật
(xem `tests/book-bucket.test.ts`). Định tuyến theo `error.code` để hai thông
báo "chưa có ảnh" và "thử lại" không lẫn vào nhau.

## 11. Kiểm thử

**Unit — `tests/book-pages.test.ts`**, nhắm vào `src/lib/book/pages.ts`:

- Quy đổi ở cả hai biên: trang 1 → `001.webp` / PDF 3 / in 2; trang 112 →
  `112.webp` / PDF 114 / in 113.
- Từ chối `0`, `113`, `-1`, `1.5`, `"abc"`, `""`, `NaN`.

**E2E — `e2e/book.spec.ts`**, theo khuôn `e2e/vocab.spec.ts`:

- Đăng nhập → `/doc-sach/1` → ảnh hiện ra.
- Bấm **Sau** → URL thành `/doc-sach/2`.
- Trang 1: nút **Trước** vô hiệu. Trang 112: nút **Sau** vô hiệu.
- Link "Đọc sách" ở header dẫn đúng chỗ.

## 12. Việc theo sau, không chặn gì

- Ánh xạ từ vựng → trang sách khả thi: `data/raw/vocab-raw.json` có trường
  `sourcePage`, phủ **593/605** từ (12 từ thêm tay về sau không có). Trang đọc =
  `sourcePage − 2`. Khi nào cần nút "xem trong sách" ở màn hình học từ thì chỉ
  cần đưa cột này vào `vocab_words`.
- Đọc các file ngữ pháp `.docx` là chuyện khác hẳn: `data/clean/grammar.json` đã
  có sẵn 20 bài dạng markdown, nên đó là trang render văn bản, không phải trình
  đọc ảnh.
