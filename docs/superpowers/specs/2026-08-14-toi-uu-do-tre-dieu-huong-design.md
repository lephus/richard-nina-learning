# Thiết kế: Tối ưu độ trễ điều hướng

**Mục tiêu:** bỏ ba vòng gọi mạng xác thực mỗi lần điều hướng — thứ chiếm 64%
thời gian tải trang — mà không hạ chuẩn xác thực xuống mức "tin cookie".

**Không thuộc phạm vi:** prefetch dữ liệu, gộp truy vấn, tối ưu ảnh sách. Xem
mục 6.

---

## 1. Số đo, không phải cảm giác

Đo bằng Playwright với đăng nhập thật, trên Supabase thật, cả `next dev` lẫn bản
production. Lần chạy ấm:

| Trang | dev | production |
|---|---|---|
| `/dashboard` | 487ms | 395ms |
| `/vocab` | 647ms | 396ms |
| `/vocab/learn/1` | 833ms | **896ms** |
| `/vocab/browse/1` | 1033ms | 725ms |
| `/stats` | 490ms | 509ms |
| `/grammar/4` | 476ms | 498ms |

**Production không nhanh hơn đáng kể.** Giả thuyết "chậm vì đang chạy dev mode"
bị loại ngay từ đây.

Mô phỏng đúng chuỗi gọi của `/vocab/learn/1`:

```
    719ms  getUser  (middleware)
    309ms  getUser  (layout)
    148ms  getUser  (page)
    280ms  truy vấn lessons
    367ms  Promise.all(cards, cursor)
  ----- tổng: 1823ms
```

**Ba lần `getUser()` chiếm 1176ms — 64%.** Chỉ 647ms là dữ liệu thật.

## 2. Nguyên nhân gốc

Vấn đề không phải "gọi API dữ liệu quá nhiều". Là **xác thực lặp ba lần cho
cùng một token**, mỗi lần một vòng mạng tới Supabase Auth (~130ms trở lên, đo
được 103–502ms tuỳ lúc):

| Chỗ gọi | Lý do tồn tại |
|---|---|
| `src/middleware.ts:83` | làm mới token phiên, chặn sớm người chưa đăng nhập |
| `src/app/(app)/layout.tsx:10` | lớp chặn thứ hai, có chủ đích |
| 12 tệp trang/action | mỗi trang cần `user.id` để truy vấn |

`getUser()` **gọi mạng** để xác thực JWT — khác `getSession()` chỉ đọc cookie.
Chú thích tại `middleware.ts:86` đã ghi đúng điều đó; cái không ai để ý là nó
xảy ra ba lần cho một lần bấm.

## 3. Cách sửa: xác thực cục bộ, không phải bỏ xác thực

Project này ký JWT bằng **ES256** (bất đối xứng, có `kid`) — kiểm bằng cách đọc
header của một access token thật. Nghĩa là `getClaims()` xác thực được chữ ký
**tại chỗ** bằng khoá công khai JWKS, nạp một lần rồi cache.

Đo trực tiếp:

| | Lần đầu | Các lần sau |
|---|---|---|
| `getUser()` | 103ms | **127–135ms mỗi lần** |
| `getClaims()` | 321ms (nạp JWKS) | **1–2ms** |

Và `sub` — chính là `user.id` — **nằm sẵn trong token**. Nên mọi trang đang gọi
mạng chỉ để lấy một giá trị đã có trong tay.

**Quyết định: đổi `getUser()` → `getClaims()` ở cả ba tầng.**

| | Trước | Sau |
|---|---|---|
| Vòng gọi xác thực / điều hướng | 3 | **0** |
| Chi phí xác thực | ~390ms+ | ~3ms |
| Nguồn `user.id` | gọi mạng | `sub` trong token đã xác thực |

Đây không phải hạ chuẩn thành "tin cookie": chữ ký vẫn được kiểm bằng mật mã,
chỉ kiểm tại chỗ thay vì hỏi máy chủ. Đúng cách Supabase khuyến nghị khi project
dùng khoá bất đối xứng.

### 3.1 Việc làm mới token vẫn được giữ — đã kiểm tận nơi

Rủi ro lớn nhất của phương án này là: middleware gọi `getUser()` một phần vì để
**làm mới token phiên**; nếu `getClaims()` không làm mới, người học sẽ bị đá ra
sau 60 phút.

Không xảy ra. Đọc thẳng phần cài đặt — `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js`,
thân hàm `getClaims` — dòng thứ năm của nó là `await this.getSession()`, và
`getSession()` tự dùng refresh token để làm mới khi access token sắp hết hạn
(ghi trong JSDoc của chính hàm đó). Nên `getClaims()` làm đúng cả hai việc:
làm mới phiên như cũ, rồi xác thực chữ ký cục bộ.

Đây là khẳng định chống đỡ cả thiết kế, nên nó phải được kiểm bằng cách đọc mã
chứ không phải bằng suy đoán từ tên hàm.

## 4. Cái giá phải trả, nói cho chính xác

`getUser()` hỏi máy chủ nên biết ngay khi một phiên bị thu hồi. `getClaims()`
chỉ biết token còn hạn hay không. Access token của project sống **3600 giây
(60 phút)**.

Hệ quả cụ thể:

- Đăng xuất trên **chính máy đang dùng**: có hiệu lực tức thì, vì `signOut()`
  xoá cookie.
- Đăng xuất ở máy khác, hoặc xoá tài khoản qua dashboard: phiên cũ còn dùng
  được **tối đa 60 phút**.

Chấp nhận được với một app học cá nhân. Nếu về sau thấy không chấp nhận được,
đường lùi đã rõ và rẻ: giữ `getUser()` ở **đúng một** chỗ (layout), `getClaims()`
ở hai chỗ kia — còn 1 vòng gọi thay vì 3, không có độ trễ thu hồi. Ghi lại đây
để không phải suy luận lại.

## 5. Không thêm `loading.tsx` — đây là bẫy đã trả giá

Ý đầu tiên là thêm khung chờ cho các route còn thiếu. **Sai.** Gần như mọi route
còn lại đều dùng `notFound()`, và chú thích trong `src/app/(app)/vocab/(list)/loading.tsx`
đã ghi lại, kèm tái hiện có kiểm chứng, rằng một biên Suspense khiến response
được stream và **khoá cứng `notFound()` ở HTTP 200** — làm đỏ đúng những test
đang canh mã 404.

Chính vì vậy tệp đó nằm trong route group `(list)` chứ không phải `vocab/`.

Thay bằng một thứ không đụng route nào: **bật Router Cache cho trang động**.
Next 15+ mặc định `staleTimes.dynamic = 0`, nên bấm back cũng tải lại từ server.
Đặt giá trị dương trong `next.config.ts` khiến quay lại một trang vừa xem là tức
thì, không gọi server.

## 6. Cố ý chưa làm

- **Prefetch.** Sau khi bỏ ba vòng xác thực, các trang còn ~250–650ms thuần truy
  vấn. Đo lại trước rồi mới quyết — prefetch trả chi phí server cho những trang
  người dùng chưa chắc bấm, và Supabase free tier không miễn phí.
- **Gộp truy vấn `/vocab/learn`.** Nó chạy tuần tự hai bước, nhưng bước hai cần
  `lessons.id` từ bước một. Rút ngắn được chỉ bằng cách dựa vào việc `lessons.id`
  tình cờ bằng `ordinal` — đúng khoản nợ mà lát 2c cố ý không đào sâu, và
  `tests/db-integrity.test.ts` đang canh.
- **Ảnh `/doc-sach`.** 1080–1734ms, nhưng phần lớn là tải ~250KB WebP thật, không
  phải chờ server.

## 7. Kiểm thử

- **Một test khẳng định không tệp nào dưới `src/` còn gọi `auth.getUser()`** —
  quét cả `src/app/(app)` lẫn `src/middleware.ts`, vì middleware nằm ngoài thư
  mục route nhưng chính là vòng gọi đắt nhất trong ba vòng. Đây là thứ giữ cho
  chúng không lặng lẽ quay lại khi ai đó thêm trang mới bằng cách chép trang cũ.
- Test khẳng định `getClaims()` trả về `sub` và mã vẫn chặn đúng khi thiếu phiên.
- E2E hiện có (63 kịch bản) phải xanh nguyên — chúng đã phủ mọi luồng đăng nhập,
  chuyển hướng khi chưa đăng nhập, và RLS.
- Chạy lại chính công cụ đo ở mục 1, so số trước/sau, ghi vào báo cáo.
