# Tối ưu độ trễ điều hướng: Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bỏ ba vòng gọi mạng xác thực mỗi lần điều hướng — 64% thời gian tải trang — bằng cách xác thực JWT cục bộ thay vì hỏi máy chủ.

**Architecture:** Một helper dùng chung bọc `getClaims()` (xác thực chữ ký ES256 tại chỗ, khoá JWKS cache cấp module dùng chung cho cả tiến trình). Mọi chỗ đang gọi `auth.getUser()` chuyển sang helper đó. Không đổi luồng chuyển hướng, không đổi RLS, không đổi truy vấn dữ liệu.

**Tech Stack:** Next.js 16 App Router, `@supabase/ssr` 0.12.4, `@supabase/auth-js` 2.112.1, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-14-toi-uu-do-tre-dieu-huong-design.md`

## Global Constraints

- Tiếng Việt cho mọi chú thích; **đủ dấu** trong `src/` và `tests/`, **không dấu** trong `scripts/`, `supabase/migrations/` và thông điệp commit. Chú thích giải thích **vì sao**.
- `getClaims()` thay `getUser()` ở **cả ba tầng**: `src/middleware.ts`, `src/app/(app)/layout.tsx`, và toàn bộ 11 tệp trang/action (16 chỗ gọi).
- `user.id` lấy từ `claims.sub` — **không** gọi mạng để lấy id.
- **Không đổi hành vi chuyển hướng.** Mọi chỗ đang `if (!user) redirect("/login")` phải giữ nguyên ngữ nghĩa: thiếu phiên hợp lệ → `/login`.
- **Không thêm `loading.tsx`** cho bất kỳ route nào. Gần như mọi route còn lại dùng `notFound()`, và biên Suspense khoá cứng `notFound()` ở HTTP 200 — bẫy đã trả giá, ghi trong `src/app/(app)/vocab/(list)/loading.tsx`.
- Không đổi truy vấn dữ liệu, không gộp query, không thêm prefetch. Xem mục 6 của spec.
- Không có ESLint; không thêm `eslint-disable`. `params` là `Promise` (Next 16).
- Không chạy `supabase db push`, `supabase link`, `psql`, `npm run phase0:seed`, hay `npm run phase0:grammar-lessons`. Lát này **không cần** migration.

## Sự thật đã kiểm, dùng làm nền

Đừng kiểm lại; đã đo và đọc mã:

- Token của project ký bằng **ES256** (`alg: ES256`, có `kid`) → xác thực cục bộ được.
- `getUser()` đo được **127–135ms mỗi lần**; `getClaims()` **321ms lần đầu, 1–2ms sau đó**.
- `claims.sub` **là** `user.id`.
- `getClaims()` gọi `getSession()` bên trong (`node_modules/@supabase/auth-js/dist/module/GoTrueClient.js`), nên **việc làm mới token phiên được giữ nguyên**.
- Cache JWKS là `const GLOBAL_JWKS = {}` **cấp module**, dùng chung cho mọi client trong cùng tiến trình, TTL 10 phút (`lib/constants.js:48`). Nên chi phí 321ms trả một lần cho cả tiến trình, không phải mỗi request.
- `createServerClient` của `@supabase/ssr` **có** `auth.getClaims`.

## Cấu trúc tệp

| Tệp | Trách nhiệm |
|---|---|
| `src/lib/supabase/danh-tinh.ts` | **Tạo.** Helper duy nhất bọc `getClaims()`, trả về id người dùng hoặc `null`. |
| `tests/danh-tinh.test.ts` | **Tạo.** |
| `src/middleware.ts` | **Sửa.** `getUser` → helper. |
| `src/app/(app)/layout.tsx` | **Sửa.** |
| 11 tệp trang/action dưới `src/app/(app)` | **Sửa.** 16 chỗ gọi. |
| `tests/khong-con-getuser.test.ts` | **Tạo.** Chốt chặn để ba vòng gọi không lặng lẽ quay lại. |
| `next.config.ts` | **Sửa.** Bật Router Cache cho trang động. |

---

### Task 1: Helper xác thực cục bộ

**Files:**
- Create: `src/lib/supabase/danh-tinh.ts`
- Test: `tests/danh-tinh.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient` từ `@supabase/supabase-js`.
- Produces:
  ```ts
  export async function danhTinhNguoiDung(
    supabase: SupabaseClient,
  ): Promise<{ id: string } | null>;
  ```

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/danh-tinh.test.ts`. Test bằng client giả — hàm này chỉ đọc kết quả `getClaims()` và quy đổi, nên không cần mạng:

```ts
import { describe, expect, it } from "vitest";
import { danhTinhNguoiDung } from "@/lib/supabase/danh-tinh";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Client giả tối thiểu: chỉ cần đúng hình dạng `auth.getClaims()`. */
function gia(ketQua: unknown): SupabaseClient {
  return { auth: { getClaims: async () => ketQua } } as unknown as SupabaseClient;
}

describe("danhTinhNguoiDung", () => {
  it("trả id từ claims.sub khi token hợp lệ", async () => {
    const r = await danhTinhNguoiDung(
      gia({ data: { claims: { sub: "abc-123", role: "authenticated" } }, error: null }),
    );
    expect(r).toEqual({ id: "abc-123" });
  });

  it("trả null khi getClaims báo lỗi — chữ ký sai hoặc token hết hạn", async () => {
    const r = await danhTinhNguoiDung(
      gia({ data: null, error: { message: "invalid JWT" } }),
    );
    expect(r).toBeNull();
  });

  it("trả null khi không có phiên nào", async () => {
    expect(await danhTinhNguoiDung(gia({ data: null, error: null }))).toBeNull();
  });

  // `sub` là thứ DUY NHẤT hàm này lấy ra, nên thiếu nó phải là `null` chứ không
  // phải `{ id: undefined }` — một id `undefined` lọt xuống `.eq("user_id", ...)`
  // sẽ thành truy vấn không khớp gì thay vì một lỗi thấy được.
  it("trả null khi claims thiếu sub", async () => {
    const r = await danhTinhNguoiDung(
      gia({ data: { claims: { role: "authenticated" } }, error: null }),
    );
    expect(r).toBeNull();
  });

  // Không được ném: mọi chỗ gọi đều dùng kết quả để quyết định chuyển hướng,
  // và một exception ở đó thành trang lỗi thay vì màn hình đăng nhập.
  it("không ném khi getClaims tự ném", async () => {
    const noi = { auth: { getClaims: async () => { throw new Error("mạng hỏng"); } } };
    await expect(
      danhTinhNguoiDung(noi as unknown as SupabaseClient),
    ).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó đỏ**

Run: `npm test -- danh-tinh`
Expected: FAIL — không giải được import `@/lib/supabase/danh-tinh`.

- [ ] **Step 3: Viết `src/lib/supabase/danh-tinh.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Danh tính người dùng cho request hiện tại, **không gọi mạng**.
 *
 * Thay cho `auth.getUser()`, thứ mà mọi trang từng gọi. `getUser()` hỏi máy chủ
 * Supabase Auth mỗi lần — đo được 127–135ms — và app gọi nó BA lần cho một lần
 * điều hướng (middleware, layout, chính trang), tức ~64% thời gian tải trang chỉ
 * để hỏi đi hỏi lại cùng một token là của ai.
 *
 * `getClaims()` xác thực chữ ký **tại chỗ**: project ký JWT bằng ES256 (bất đối
 * xứng), nên SDK kiểm được bằng khoá công khai JWKS. Cache khoá là biến cấp
 * module dùng chung cho mọi client trong cùng tiến trình (`GLOBAL_JWKS` trong
 * `@supabase/auth-js`), TTL 10 phút — nên lần nạp đầu ~321ms trả một lần cho cả
 * tiến trình, còn mỗi lần xác thực sau tốn 1–2ms.
 *
 * Đây KHÔNG phải hạ chuẩn thành "tin cookie": chữ ký vẫn được kiểm bằng mật mã.
 * Cái mất là khả năng biết ngay một phiên đã bị thu hồi ở nơi khác — token sống
 * 60 phút. Đăng xuất trên chính máy đang dùng vẫn tức thì vì cookie bị xoá.
 *
 * `getClaims()` gọi `getSession()` bên trong, nên việc làm mới token phiên mà
 * middleware vốn gánh vẫn diễn ra như cũ.
 */
export async function danhTinhNguoiDung(
  supabase: SupabaseClient,
): Promise<{ id: string } | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error) return null;
    const sub = data?.claims?.sub;
    // Thiếu `sub` phải thành `null`, không phải `{ id: undefined }`: một id
    // `undefined` lọt xuống `.eq("user_id", ...)` sẽ cho truy vấn rỗng lặng lẽ
    // thay vì một lỗi nhìn thấy được.
    return typeof sub === "string" && sub.length > 0 ? { id: sub } : null;
  } catch {
    // Fail closed, cùng nguyên tắc mà middleware đã ghi: lỗi thoáng qua thì coi
    // như CHƯA đăng nhập, không bao giờ coi như đã đăng nhập.
    return null;
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận xanh**

Run: `npm test -- danh-tinh`
Expected: PASS cả 5 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/danh-tinh.ts tests/danh-tinh.test.ts
git commit -m "feat(perf): helper xac thuc JWT cuc bo thay cho getUser"
```

---

### Task 2: Chuyển middleware và layout

Hai tầng ngoài cùng, và là hai vòng gọi đắt nhất — middleware chạy trước mọi thứ, layout chạy trước mọi trang.

**Files:**
- Modify: `src/middleware.ts:83`, `src/app/(app)/layout.tsx:10`
- Test: e2e hiện có (`e2e/auth.spec.ts`)

**Interfaces:**
- Consumes: `danhTinhNguoiDung` (Task 1).

- [ ] **Step 1: Đo mốc trước khi sửa**

Chạy bộ e2e xác thực để có mốc xanh: `npm run test:e2e -- auth`
Expected: PASS. Ghi lại số test.

- [ ] **Step 2: Sửa `src/middleware.ts`**

Thay khối `try { const { data: { user: fetchedUser } } = await supabase.auth.getUser(); user = fetchedUser; } catch { user = null; }` bằng `const user = await danhTinhNguoiDung(supabase);`.

Helper đã tự bắt lỗi và fail closed, nên khối `try/catch` ở đây thành thừa — bỏ nó đi, nhưng **giữ nguyên chú thích giải thích fail-closed** bằng cách dời ý đó vào chỗ gọi, kèm một câu nói rõ nó giờ nằm trong helper.

Giữ nguyên `if (!user && isProtectedRoute(...))` và toàn bộ phần gán `Cache-Control` phía dưới.

- [ ] **Step 3: Sửa `src/app/(app)/layout.tsx`**

Thay `const { data: { user } } = await supabase.auth.getUser();` bằng `const user = await danhTinhNguoiDung(supabase);`.

Giữ nguyên `if (!user) redirect("/login")` và **giữ nguyên chú thích "Lớp chặn thứ hai. Không thừa"** — lý do đó không đổi.

- [ ] **Step 4: Chạy e2e xác thực**

Run: `npm run test:e2e -- auth`
Expected: PASS, cùng số test như Step 1. Đây là bộ phủ chuyển hướng khi chưa đăng nhập, đăng nhập, đăng xuất — nếu ngữ nghĩa xác thực đổi, nó đỏ.

- [ ] **Step 5: Kiểm kiểu và build**

Run: `npx tsc --noEmit && npm run build`
Expected: không lỗi.

- [ ] **Step 6: Commit**

```bash
git add src/middleware.ts "src/app/(app)/layout.tsx"
git commit -m "perf: middleware va layout xac thuc cuc bo, bo 2 vong goi mang"
```

---

### Task 3: Chuyển 11 tệp trang và action

16 chỗ gọi còn lại, trên 11 tệp. Cùng một khuôn, nên làm một lượt và để `tsc` chỉ chỗ sót.

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx:9`, `src/app/(app)/stats/page.tsx:46`, `src/app/(app)/grammar/page.tsx:12`, `src/app/(app)/grammar/[ordinal]/page.tsx:41`, `src/app/(app)/grammar/[ordinal]/actions.ts:21`, `src/app/(app)/vocab/(list)/page.tsx:13`, `src/app/(app)/vocab/browse/[groupId]/page.tsx:27`, `src/app/(app)/vocab/learn/[lessonId]/page.tsx:19`, `src/app/(app)/vocab/actions.ts:21,44`, `src/app/(app)/exam/[id]/actions.ts:15,85,117,136`, `src/app/(app)/exam/[id]/ket-qua/actions.ts:23,120`

**Interfaces:**
- Consumes: `danhTinhNguoiDung` (Task 1).

- [ ] **Step 1: Thay từng chỗ theo đúng một khuôn**

Mỗi chỗ đang là:

```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/login");
```

thành:

```ts
const user = await danhTinhNguoiDung(supabase);
if (!user) redirect("/login");
```

`user.id` phía sau **không đổi** — helper trả `{ id }`. Chỗ nào đang dùng trường khác của `user` (ví dụ `user.email`) thì dừng lại và báo, đừng tự chế: `claims` có `email` nhưng đó là quyết định riêng, không nằm trong lát này.

- [ ] **Step 2: Để `tsc` tìm chỗ sót**

Run: `npx tsc --noEmit`
Expected: không lỗi. Nếu có lỗi kiểu ở một tệp chưa sửa, đó chính là chỗ sót — sửa rồi chạy lại.

- [ ] **Step 3: Chạy toàn bộ test**

Run: `npm test && npm run build`
Expected: tất cả xanh.

- [ ] **Step 4: Chạy toàn bộ e2e**

Run: `npm run test:e2e`
Expected: tất cả xanh. Bộ này phủ mọi luồng có đăng nhập, RLS, và chuyển hướng — đây là lưới đỡ chính cho việc đổi 18 chỗ.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "perf: 12 tep trang/action xac thuc cuc bo, bo vong goi mang thu ba"
```

---

### Task 4: Chốt chặn và Router Cache

**Files:**
- Create: `tests/khong-con-getuser.test.ts`
- Modify: `next.config.ts`

- [ ] **Step 1: Viết test chốt chặn**

Tạo `tests/khong-con-getuser.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function moiTepNguon(thuMuc: string): string[] {
  const ra: string[] = [];
  for (const ten of readdirSync(thuMuc)) {
    const duong = join(thuMuc, ten);
    if (statSync(duong).isDirectory()) ra.push(...moiTepNguon(duong));
    else if (/\.tsx?$/.test(ten)) ra.push(duong);
  }
  return ra;
}

describe("không còn gọi auth.getUser() trong src/", () => {
  // Ba vòng gọi `getUser()` mỗi lần điều hướng từng chiếm 64% thời gian tải
  // trang. Chúng quay lại rất dễ: cách tự nhiên nhất để thêm một trang mới là
  // chép một trang cũ. Test này là thứ duy nhất khiến việc đó ồn ào.
  //
  // Quét cả `src/middleware.ts` chứ không riêng thư mục route: middleware nằm
  // ngoài `app/` nhưng chính là vòng gọi đắt nhất trong ba vòng.
  it("không tệp nào dưới src/ gọi auth.getUser()", () => {
    const pham = moiTepNguon("src")
      .filter((f) => readFileSync(f, "utf8").includes("auth.getUser()"))
      .map((f) => f.replace(/^src\//, ""));
    expect(pham).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy test**

Run: `npm test -- khong-con-getuser`
Expected: PASS (Task 2 và 3 đã dọn hết). Nếu đỏ, danh sách trong thông báo lỗi chính là các tệp còn sót.

- [ ] **Step 3: Bật Router Cache cho trang động**

Trong `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Next 15+ mặc định `dynamic: 0` cho trang động, nên bấm "quay lại" cũng
    // tải lại từ server — với app này là một vòng gọi Supabase nữa cho một
    // trang người học vừa xem xong. 30 giây đủ để việc đi tới đi lui giữa
    // /vocab và một buổi học là tức thì, mà vẫn ngắn hơn nhiều so với thời
    // gian một bài thi làm thay đổi trạng thái hiển thị trên đó.
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
```

- [ ] **Step 4: Kiểm tra build nhận cấu hình**

Run: `npm run build`
Expected: build thành công, không cảnh báo về khoá cấu hình không hợp lệ. Nếu Next báo `staleTimes` không còn là `experimental` ở bản này, đọc `node_modules/next/dist/docs/` để lấy đúng vị trí khoá rồi sửa — **không** bỏ qua cảnh báo.

- [ ] **Step 5: Đo lại và so số**

Chạy lại công cụ đo đã dùng khi chẩn đoán: đăng nhập thật, đi qua `/dashboard`, `/vocab`, `/vocab/learn/1`, `/vocab/browse/1`, `/stats`, `/grammar`, `/grammar/4`, ghi thời gian lần chạy ấm trên bản production (`npm run build && npm start`).

So với mốc trước khi sửa:

| Trang | Trước (production, ấm) |
|---|---|
| `/dashboard` | 395ms |
| `/vocab` | 396ms |
| `/vocab/learn/1` | 896ms |
| `/vocab/browse/1` | 725ms |
| `/stats` | 509ms |
| `/grammar` | 494ms |
| `/grammar/4` | 498ms |

Ghi cả hai cột vào báo cáo. Nếu một trang **không** nhanh lên, đó là phát hiện cần điều tra chứ không phải con số để bỏ qua.

- [ ] **Step 6: Commit**

```bash
git add tests/khong-con-getuser.test.ts next.config.ts
git commit -m "perf: chot chan khong con getUser, va bat Router Cache cho trang dong"
```

---

## Đối chiếu với spec

| Mục spec | Task |
|---|---|
| 3. `getClaims()` thay `getUser()` ở cả ba tầng | 1, 2, 3 |
| 3. `user.id` từ `claims.sub` | 1 |
| 3.1 Làm mới token vẫn giữ | 1 (chú thích), 2 (e2e auth phủ) |
| 4. Cái giá (thu hồi trễ tối đa 60 phút) | 1 (ghi trong chú thích helper) |
| 5. Không thêm `loading.tsx`; bật Router Cache | 4 |
| 6. Không prefetch, không gộp query | — cố ý không có task |
| 7. Test chốt chặn không còn `getUser` | 4 |
| 7. E2E hiện có phải xanh nguyên | 2, 3 |
| 7. Đo lại, so số trước/sau | 4 |
