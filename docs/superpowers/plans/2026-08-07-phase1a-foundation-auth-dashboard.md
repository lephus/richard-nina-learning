# Kế hoạch triển khai: Phase 1a — nền tảng, xác thực, dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Người học đăng ký/đăng nhập được, thấy dashboard 20 buổi đọc từ Supabase qua RLS, và app chạy thật trên Vercel bằng URL công khai.

**Architecture:** Next.js App Router đặt trong `src/`. Xác thực bằng `@supabase/ssr` với cookie: middleware làm mới token trên mọi request, Server Component đọc dữ liệu bằng JWT của chính người dùng nên RLS tự áp. Đăng nhập/đăng ký/đăng xuất là Server Action. Luật mở khoá 20 buổi nằm trong một hàm thuần tách khỏi React và database.

**Tech Stack:** Next 16.3 · React 19.2 · Tailwind 4.3 · `@supabase/ssr` 0.12.4 · `@supabase/supabase-js` 2.112 · Vitest 2.1 · Playwright 1.62 · Supabase (Postgres + Auth) · Vercel

**Spec:** [`docs/superpowers/specs/2026-08-07-phase1a-foundation-auth-dashboard-design.md`](../specs/2026-08-07-phase1a-foundation-auth-dashboard-design.md)

## Global Constraints

- Node `>=20.9.0` (yêu cầu của Next 16.3; máy hiện chạy v25.0.0).
- `@supabase/ssr` 0.12 yêu cầu peer `@supabase/supabase-js@^2.111.0`; bản đang cài là 2.112.1 — **không được hạ cấp** `supabase-js`.
- Dùng `getAll` / `setAll` cho cookie. `get` / `set` / `remove` đã bị đánh dấu deprecated và sẽ bỏ ở bản major kế tiếp.
- Trên server luôn dùng `supabase.auth.getUser()`, **không bao giờ** `getSession()`. `getSession()` chỉ đọc cookie và tin nó nên không chứng minh được gì.
- **Mã ứng dụng trong `src/` không được đụng `SUPABASE_SERVICE_ROLE_KEY`.** Khoá đó chỉ dùng ở `scripts/phase0/` và `e2e/` — cả hai chạy trên máy, không lên Vercel.
- Giao diện tiếng Việt; nội dung học giữ nguyên tiếng Anh.
- Giữ thuật ngữ tiếng Việt sẵn có: `danh từ`, `tính từ`, `trạng từ`, `mệnh đề quan hệ`.
- Thông báo lỗi đăng nhập và đăng ký phải **chung chung**, không phân biệt "sai mật khẩu" với "email chưa tồn tại" — phân biệt là để lộ email nào đã đăng ký.
- Không thêm thư viện ngoài những gì kế hoạch này liệt kê.

## Bản đồ tệp

| Tệp | Trách nhiệm |
|---|---|
| `next.config.ts` | Cấu hình Next, để trống mặc định |
| `postcss.config.mjs` | Nạp `@tailwindcss/postcss` (Tailwind 4 không còn `tailwind.config.js`) |
| `src/app/globals.css` | `@import "tailwindcss"` |
| `src/app/layout.tsx` | Khung HTML gốc, `lang="vi"` |
| `src/app/page.tsx` | Chuyển hướng `/` → `/dashboard` |
| `src/app/(auth)/login/page.tsx` | Trang đăng nhập (Server Component) |
| `src/app/(auth)/register/page.tsx` | Trang đăng ký (Server Component) |
| `src/app/(auth)/actions.ts` | Server Action `signIn` · `signUp` · `signOut` |
| `src/components/auth/login-form.tsx` | Form đăng nhập, client, `useActionState` |
| `src/components/auth/register-form.tsx` | Form đăng ký, client, `useActionState` |
| `src/app/(app)/layout.tsx` | Lớp chặn thứ hai + nút đăng xuất |
| `src/app/(app)/error.tsx` | Ranh giới lỗi cho nhóm `(app)` |
| `src/app/(app)/dashboard/page.tsx` | Dashboard 20 buổi |
| `src/app/(app)/learn/[lessonId]/page.tsx` | Trang tạm, thay bằng luồng học thật ở lát 1b |
| `src/lib/supabase/server.ts` | `createClient()` cho Server Component và Server Action |
| `src/middleware.ts` | Làm mới token, chặn route riêng tư, chặn CDN cache |
| `src/lib/curriculum/lesson-status.ts` | `lessonStatuses()` — hàm thuần tính trạng thái 20 buổi |
| `supabase/migrations/0005_profile_trigger.sql` | Trigger tự tạo `profiles` khi có người đăng ký |
| `tests/lesson-status.test.ts` | Vitest cho hàm thuần |
| `tests/profile-trigger.test.ts` | Vitest chạy thật: đăng ký → có `profiles` |
| `e2e/test-user.ts` | Hằng số tài khoản kiểm thử |
| `e2e/admin.ts` | Client `service_role` + xoá tài khoản kiểm thử |
| `e2e/global-setup.ts` | Dựng tài khoản kiểm thử trước khi chạy |
| `e2e/global-teardown.ts` | Xoá tài khoản kiểm thử sau khi chạy |
| `e2e/auth.spec.ts` | 5 kịch bản Playwright |
| `playwright.config.ts` | Cấu hình Playwright, `baseURL` đổi được để test cả production |

**Không tạo `src/lib/supabase/client.ts` ở lát này.** Spec mục 4.1 có liệt kê, nhưng lát 1a không có component nào cần Supabase phía trình duyệt — đăng nhập, đăng xuất và đọc dữ liệu đều ở server. Tạo file browser client bây giờ là tạo mã chết. Nó sẽ ra đời ở lát 1b khi có component tương tác thật cần tới.

---

### Task 1: Dựng khung Next.js và Tailwind

**Files:**
- Create: `next.config.ts`, `postcss.config.mjs`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`
- Modify: `package.json`, `tsconfig.json`, `.gitignore`

**Interfaces:**
- Consumes: không có
- Produces: `npm run dev` · `npm run build` · `npm run start` chạy được; alias `@/*` trỏ tới `src/*`

- [ ] **Step 1: Cài phụ thuộc**

```bash
npm install next@16.3.0 react@^19.2.0 react-dom@^19.2.0 @supabase/ssr@^0.12.4
npm install -D @types/react@^19 @types/react-dom@^19 tailwindcss@^4.3.3 @tailwindcss/postcss@^4.3.3
```

- [ ] **Step 2: Kiểm chứng `supabase-js` không bị hạ cấp**

Run: `node -p "require('./node_modules/@supabase/supabase-js/package.json').version"`
Expected: in ra `2.111.0` trở lên. Nếu thấp hơn, chạy `npm install @supabase/supabase-js@^2.112.1` rồi kiểm lại — `@supabase/ssr` 0.12 không chạy với bản thấp hơn.

- [ ] **Step 3: Tạo `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 4: Tạo `postcss.config.mjs`**

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

- [ ] **Step 5: Tạo `src/app/globals.css`**

```css
@import "tailwindcss";
```

- [ ] **Step 6: Tạo `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Học TOEIC",
  description: "Web tự học từ vựng và ngữ pháp TOEIC",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Tạo `src/app/page.tsx`**

```tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/dashboard");
}
```

- [ ] **Step 8: Cập nhật `tsconfig.json`**

Thay toàn bộ nội dung:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "allowJs": true,
    "noEmit": true,
    "incremental": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@content/*": ["src/content/*"],
      "@/*": ["src/*"]
    }
  },
  "include": ["src", "scripts", "tests", "e2e", "next-env.d.ts", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Khoá `"types": ["node"]` bị bỏ có chủ ý: nó chặn TypeScript tự nạp `@types/react`, làm mọi tệp `.tsx` đỏ.

- [ ] **Step 9: Cập nhật `.gitignore`**

Thêm vào cuối tệp:

```
.next/
next-env.d.ts
playwright-report/
test-results/
.vercel
```

- [ ] **Step 10: Thêm script vào `package.json`**

Trong khối `"scripts"`, thêm ba dòng, giữ nguyên mọi dòng sẵn có:

```json
"dev": "next dev",
"build": "next build",
"start": "next start",
```

- [ ] **Step 11: Chạy build để kiểm chứng khung dựng đúng**

Run: `npm run build`
Expected: build thành công, in ra bảng route có `/` và không có lỗi TypeScript.

- [ ] **Step 12: Kiểm chứng bộ test cũ không bị ảnh hưởng**

Run: `npm test`
Expected: 66/66 pass. Nếu `tests/rls.test.ts` hoặc `tests/db-integrity.test.ts` đỏ, nguyên nhân nằm ở `tsconfig.json` chứ không phải database — hoàn nguyên bước 8 rồi làm lại.

- [ ] **Step 13: Commit**

```bash
git add next.config.ts postcss.config.mjs src/app tsconfig.json .gitignore package.json package-lock.json
git commit -m "feat(1a): dung khung Next 16 + Tailwind 4 trong src/"
```

---

### Task 2: Hàm thuần `lessonStatuses()`

**Files:**
- Create: `src/lib/curriculum/lesson-status.ts`
- Test: `tests/lesson-status.test.ts`

**Interfaces:**
- Consumes: không có
- Produces:
  - `type LessonStatus = "locked" | "available" | "in_progress" | "completed"`
  - `interface LessonRow { id: number; ordinal: number }`
  - `interface ProgressRow { lesson_id: number; status: LessonStatus }`
  - `lessonStatuses(lessons: LessonRow[], progressRows: ProgressRow[]): Map<number, LessonStatus>` — khoá của Map là `lessons.id`

- [ ] **Step 1: Viết test đỏ**

Tạo `tests/lesson-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  lessonStatuses,
  type LessonRow,
  type ProgressRow,
} from "@/lib/curriculum/lesson-status";

const twentyLessons: LessonRow[] = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  ordinal: i + 1,
}));

describe("lessonStatuses", () => {
  it("bảng tiến độ rỗng: chỉ buổi 1 mở, phần còn lại khoá", () => {
    const s = lessonStatuses(twentyLessons, []);
    expect(s.get(1)).toBe("available");
    expect(s.get(2)).toBe("locked");
    expect(s.get(20)).toBe("locked");
    expect(s.size).toBe(20);
  });

  it("xong buổi 1 thì buổi 2 mở, buổi 3 vẫn khoá", () => {
    const progress: ProgressRow[] = [{ lesson_id: 1, status: "completed" }];
    const s = lessonStatuses(twentyLessons, progress);
    expect(s.get(2)).toBe("available");
    expect(s.get(3)).toBe("locked");
  });

  it("dòng trong bảng thắng luật suy diễn, không tự khoá lại buổi đang học dở", () => {
    const progress: ProgressRow[] = [{ lesson_id: 5, status: "in_progress" }];
    const s = lessonStatuses(twentyLessons, progress);
    expect(s.get(4)).toBe("locked");
    expect(s.get(5)).toBe("in_progress");
  });

  it("buổi sau một buổi đang học dở thì vẫn khoá", () => {
    const progress: ProgressRow[] = [
      { lesson_id: 1, status: "completed" },
      { lesson_id: 2, status: "in_progress" },
    ];
    const s = lessonStatuses(twentyLessons, progress);
    expect(s.get(3)).toBe("locked");
  });

  it("chuỗi mở khoá lan qua nhiều buổi liên tiếp", () => {
    const progress: ProgressRow[] = [
      { lesson_id: 1, status: "completed" },
      { lesson_id: 2, status: "completed" },
      { lesson_id: 3, status: "completed" },
    ];
    const s = lessonStatuses(twentyLessons, progress);
    expect(s.get(4)).toBe("available");
    expect(s.get(5)).toBe("locked");
  });

  it("lessons truyền vào lộn xộn vẫn tính đúng theo ordinal", () => {
    const shuffled: LessonRow[] = [
      { id: 3, ordinal: 3 },
      { id: 1, ordinal: 1 },
      { id: 2, ordinal: 2 },
    ];
    const s = lessonStatuses(shuffled, [{ lesson_id: 1, status: "completed" }]);
    expect(s.get(1)).toBe("completed");
    expect(s.get(2)).toBe("available");
    expect(s.get(3)).toBe("locked");
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

Run: `npx vitest run tests/lesson-status.test.ts`
Expected: FAIL — không phân giải được `@/lib/curriculum/lesson-status`.

- [ ] **Step 3: Dạy Vitest hiểu alias `@/*`**

Sửa `vitest.config.ts`, thêm alias thứ hai vào khối `resolve.alias` đã có:

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup-env.ts"],
    // GIU NGUYEN khoi chu thich va fileParallelism: false dang co trong tep.
    // Do la ban sua cho mot loi that: rls.test.ts va db-integrity.test.ts giam
    // len nhau tren cung mot database khi chay song song. Xoa dong nay thi
    // db-integrity do ngau nhien tro lai.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@content": resolve(__dirname, "src/content"),
      "@": resolve(__dirname, "src"),
    },
  },
});
```

**Chỉ thêm dòng alias `"@"`.** Mọi thứ khác trong tệp giữ nguyên — đặc biệt là `fileParallelism: false` và khối chú thích của nó.

Thứ tự quan trọng: `@content` phải đứng trước `@`, nếu không `@content/types` bị `@` nuốt thành `src/content/types` — lần này thì trùng nhau nên vô hại, nhưng đừng dựa vào may mắn.

- [ ] **Step 4: Viết cài đặt tối thiểu**

Tạo `src/lib/curriculum/lesson-status.ts`:

```ts
/** Khớp enum lesson_status trong supabase/migrations/0003_user_state.sql:7 */
export type LessonStatus = "locked" | "available" | "in_progress" | "completed";

export interface LessonRow {
  id: number;
  ordinal: number;
}

export interface ProgressRow {
  lesson_id: number;
  status: LessonStatus;
}

/**
 * Tính trạng thái hiển thị của từng buổi.
 *
 * Lúc mới đăng ký, user_lesson_progress RỖNG — không phải 20 dòng 'locked'.
 * Vì vậy trạng thái phải suy ra, không đọc thẳng từ bảng.
 *
 * Dòng có thật trong bảng luôn thắng luật suy diễn: nếu người học đang dở
 * buổi 5 mà buổi 4 chưa xong, buổi 5 vẫn 'in_progress'. Tự ý khoá lại một
 * buổi đang học dở tệ hơn nhiều so với việc để lộ một dòng dữ liệu bất thường.
 *
 * Buổi n suy từ trạng thái ĐÃ TÍNH của buổi n−1, không phải từ dòng thô, nên
 * chuỗi khoá lan đúng qua những buổi chưa có dòng nào.
 */
export function lessonStatuses(
  lessons: LessonRow[],
  progressRows: ProgressRow[],
): Map<number, LessonStatus> {
  const stored = new Map(progressRows.map((r) => [r.lesson_id, r.status]));
  const ordered = [...lessons].sort((a, b) => a.ordinal - b.ordinal);

  const out = new Map<number, LessonStatus>();
  let previous: LessonStatus | null = null;

  for (const lesson of ordered) {
    const status: LessonStatus =
      stored.get(lesson.id) ??
      (previous === null || previous === "completed" ? "available" : "locked");
    out.set(lesson.id, status);
    previous = status;
  }

  return out;
}
```

- [ ] **Step 5: Chạy test để xác nhận xanh**

Run: `npx vitest run tests/lesson-status.test.ts`
Expected: PASS — 6 test.

- [ ] **Step 6: Commit**

```bash
git add src/lib/curriculum/lesson-status.ts tests/lesson-status.test.ts vitest.config.ts
git commit -m "feat(1a): ham thuan lessonStatuses tinh trang thai 20 buoi"
```

---

### Task 3: Trigger tạo `profiles`

**Files:**
- Create: `supabase/migrations/0005_profile_trigger.sql`
- Test: `tests/profile-trigger.test.ts`

**Interfaces:**
- Consumes: không có
- Produces: bất biến *"mọi dòng `auth.users` đều có dòng `profiles` tương ứng"*, do database giữ

- [ ] **Step 1: Viết test đỏ**

Tạo `tests/profile-trigger.test.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(URL && SERVICE);

// Bỏ qua tường minh khi thiếu env, để `npm test` vẫn chạy được trên máy
// chưa cấu hình Supabase — cùng khuôn với tests/db-integrity.test.ts.
describe.skipIf(!hasEnv)("trigger tao profiles", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "noop", {
    auth: { persistSession: false },
  });
  const email = "trigger-probe@test.local";
  let userId = "";

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "trigger-pass-1234",
      email_confirm: true,
      user_metadata: { display_name: "Người thử trigger" },
    });
    if (error) throw error;
    userId = data.user!.id;
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("tạo user thì có ngay dòng profiles với đúng display_name", async () => {
    const { data, error } = await admin
      .from("profiles")
      .select("id, display_name")
      .eq("id", userId)
      .single();

    expect(error).toBeNull();
    expect(data?.display_name).toBe("Người thử trigger");
  });

  it("xoá user thì dòng profiles biến mất theo (cascade)", async () => {
    await admin.auth.admin.deleteUser(userId);
    const { data } = await admin.from("profiles").select("id").eq("id", userId);
    expect(data).toEqual([]);
    userId = "";
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

Run: `npx vitest run tests/profile-trigger.test.ts`
Expected: FAIL ở test thứ nhất — không tìm thấy dòng `profiles`, vì trigger chưa tồn tại.

- [ ] **Step 3: Viết migration**

Tạo `supabase/migrations/0005_profile_trigger.sql`:

```sql
-- 0003_user_state.sql:1-5 dat profiles.display_name la NOT NULL nhung khong co
-- gi tu tao dong khi co nguoi dang ky. Neu de Server Action chen sau khi
-- signUp thanh cong, chi can request dut giua chung la sinh ra mot auth.users
-- khong co profiles — nguoi dung dang nhap duoc nhung app vo o moi cho join.
--
-- Dat bat bien nay o database, khong o ma ung dung, de khong duong nao pha duoc.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
-- Chan tan cong doi search_path: ham SECURITY DEFINER chay bang quyen chu so
-- huu, neu khong ghim search_path thi ke tan cong co the tro "profiles" sang
-- bang cua ho.
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

Ba chi tiết có chủ ý:
- `security definer` — trigger chạy trong ngữ cảnh `auth.users`, không có nó thì không ghi được vào `public.profiles`.
- `coalesce(... , split_part(new.email, '@', 1))` — `display_name` là `NOT NULL`. Tài khoản tạo thẳng từ Supabase Dashboard không có `display_name` trong metadata; không có phương án dự phòng thì trigger nổ và **chặn luôn việc tạo user**.
- `on conflict (id) do nothing` — để chạy lại migration hoặc backfill không nổ.

- [ ] **Step 4: Áp migration lên Supabase**

Supabase CLI trên máy đang đăng nhập tài khoản khác nên `supabase link` không dùng được (xem `docs/superpowers/PHASE0-HOAN-TAT.md`). Đi đường dashboard:

```bash
pbcopy < supabase/migrations/0005_profile_trigger.sql
```

Mở https://supabase.com/dashboard/project/efouimcmdufsaywudcgx/sql/new → dán → **Run**.
Expected: *Success. No rows returned*.

- [ ] **Step 5: Chạy test để xác nhận xanh**

Run: `npx vitest run tests/profile-trigger.test.ts`
Expected: PASS — 2 test.

- [ ] **Step 6: Xác nhận trigger không phá bộ test sẵn có**

Run: `npm test`
Expected: toàn bộ xanh. `tests/rls.test.ts` tạo 6 tài khoản qua admin API nên giờ chúng cũng sinh dòng `profiles`; `profiles.id` có `on delete cascade` (`0003_user_state.sql:2`) nên phần dọn dẹp sẵn có vẫn sạch. Nếu `db-integrity` đỏ, dừng lại — nghĩa là còn dòng `profiles` mồ côi.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0005_profile_trigger.sql tests/profile-trigger.test.ts
git commit -m "feat(1a): trigger tu tao profiles khi co nguoi dang ky"
```

---

### Task 4: Supabase server client và middleware

**Files:**
- Create: `src/lib/supabase/server.ts`, `src/middleware.ts`
- Modify: `.env.local`, `.env.local.example`

**Interfaces:**
- Consumes: không có
- Produces: `createClient(): Promise<SupabaseClient>` từ `@/lib/supabase/server` — dùng trong Server Component và Server Action

- [ ] **Step 1: Thêm biến `NEXT_PUBLIC_*` vào `.env.local`**

Trình duyệt chỉ thấy biến có tiền tố `NEXT_PUBLIC_`. Giữ nguyên ba biến cũ (script Phase 0 và test RLS đang dùng), thêm hai dòng mới với **cùng giá trị** như `SUPABASE_URL` và `SUPABASE_ANON_KEY`:

```
NEXT_PUBLIC_SUPABASE_URL=<giá trị y hệt SUPABASE_URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<giá trị y hệt SUPABASE_ANON_KEY>
```

- [ ] **Step 2: Cập nhật `.env.local.example`**

Thay toàn bộ nội dung:

```
# Dung cho scripts/phase0/ va tests/ — chay tren may, KHONG len Vercel
SUPABASE_URL=
SUPABASE_ANON_KEY=
# Quyen tuyet doi tren database. Chi dung o script seed va e2e/global-setup.
# KHONG BAO GIO dat bien nay tren Vercel hoac trong GitHub secrets.
SUPABASE_SERVICE_ROLE_KEY=

# Dung cho app Next. Trinh duyet chi thay bien co tien to NEXT_PUBLIC_.
# Hai bien nay dat gia tri Y HET hai bien dau tien, va la hai bien DUY NHAT
# duoc phep len Vercel.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 3: Xác nhận `.env.local` vẫn bị ignore**

Run: `git check-ignore -v .env.local`
Expected: in ra dòng khớp từ `.gitignore`. Không có output nghĩa là service role key sắp bị commit — dừng ngay.

- [ ] **Step 4: Tạo `src/lib/supabase/server.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Client Supabase cho Server Component, Server Action và route handler.
 *
 * LUÔN tạo mới cho mỗi lần render — không bao giờ dùng chung giữa các request,
 * vì cookie phiên của người này sẽ rò sang người khác.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Next chặn ghi cookie từ Server Component. Bỏ qua an toàn vì
            // middleware đã làm mới token trước khi request tới đây.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 5: Tạo `src/middleware.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/dashboard", "/learn"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // @supabase/ssr 0.12 truyền kèm các header chống cache. Bỏ qua chúng
          // thì CDN có thể cache response mang Set-Cookie và phục vụ phiên của
          // người này cho người khác.
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Phải gọi SỚM, trước khi sinh response. Nếu token làm mới xong sau khi
  // response đã chốt thì phiên mới không ghi được vào cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = PROTECTED.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Vercel chạy sau CDN; response của route xác thực không được cache.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 6: Kiểm chứng biên dịch được**

Run: `npm run build`
Expected: build thành công. Nếu báo thiếu `NEXT_PUBLIC_SUPABASE_URL`, biến chưa được thêm ở bước 1.

- [ ] **Step 7: Kiểm chứng chuyển hướng chạy thật**

Chạy `npm run dev` ở một cửa sổ, rồi ở cửa sổ khác:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/dashboard
```

Expected: `307 http://localhost:3000/login`. Đây là bằng chứng middleware đang chặn — kịch bản Playwright ở Task 7 sẽ tự động hoá lại.

- [ ] **Step 8: Commit**

```bash
git add src/lib/supabase/server.ts src/middleware.ts .env.local.example
git commit -m "feat(1a): supabase server client + middleware lam moi token"
```

---

### Task 5: Đăng ký, đăng nhập, đăng xuất

**Files:**
- Create: `src/app/(auth)/actions.ts`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/components/auth/login-form.tsx`, `src/components/auth/register-form.tsx`

**Interfaces:**
- Consumes: `createClient()` từ `@/lib/supabase/server`
- Produces:
  - `type AuthState = { error: string } | null`
  - `signIn(prev: AuthState, formData: FormData): Promise<AuthState>`
  - `signUp(prev: AuthState, formData: FormData): Promise<AuthState>`
  - `signOut(): Promise<void>`

- [ ] **Step 1: Tắt xác minh email trên Supabase**

Spec chốt "không xác minh email". Vào Supabase Dashboard → **Authentication** → **Sign In / Providers** → **Email** → tắt **Confirm email** → Save.

Không làm bước này thì `signUp` trả về user nhưng **không có session**, người dùng đăng ký xong bị đá về `/login` mà không hiểu vì sao.

- [ ] **Step 2: Tạo `src/app/(auth)/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error: string } | null;

// Thông báo cố tình chung chung: phân biệt "sai mật khẩu" với "email chưa
// đăng ký" là để lộ email nào đã có tài khoản.
const GENERIC_SIGNIN_ERROR = "Email hoặc mật khẩu không đúng.";
const GENERIC_SIGNUP_ERROR = "Không tạo được tài khoản. Kiểm tra lại email và mật khẩu.";

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: GENERIC_SIGNIN_ERROR };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: GENERIC_SIGNIN_ERROR };

  redirect("/dashboard");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!displayName) return { error: "Vui lòng nhập tên hiển thị." };
  if (password.length < 8) return { error: "Mật khẩu phải có ít nhất 8 ký tự." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    // Trigger on_auth_user_created đọc đúng khoá này để đặt profiles.display_name.
    options: { data: { display_name: displayName } },
  });
  if (error) return { error: GENERIC_SIGNUP_ERROR };

  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

`redirect()` hoạt động bằng cách ném một lỗi đặc biệt cho Next bắt — đừng bọc nó trong `try/catch`.

- [ ] **Step 3: Tạo `src/components/auth/login-form.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type AuthState } from "@/app/(auth)/actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(signIn, null);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-semibold">Đăng nhập</h1>

      <label className="flex flex-col gap-1">
        <span className="text-sm">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm">Mật khẩu</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded border border-slate-300 px-3 py-2"
        />
      </label>

      {state?.error && (
        <p data-testid="auth-error" role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>

      <p className="text-sm">
        Chưa có tài khoản?{" "}
        <Link href="/register" className="underline">
          Đăng ký
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 4: Tạo `src/components/auth/register-form.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type AuthState } from "@/app/(auth)/actions";

export function RegisterForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(signUp, null);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-semibold">Đăng ký</h1>

      <label className="flex flex-col gap-1">
        <span className="text-sm">Tên hiển thị</span>
        <input
          name="displayName"
          type="text"
          required
          className="rounded border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm">Mật khẩu</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded border border-slate-300 px-3 py-2"
        />
        <span className="text-xs text-slate-500">Ít nhất 8 ký tự</span>
      </label>

      {state?.error && (
        <p data-testid="auth-error" role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Đang tạo tài khoản…" : "Đăng ký"}
      </button>

      <p className="text-sm">
        Đã có tài khoản?{" "}
        <Link href="/login" className="underline">
          Đăng nhập
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 5: Tạo hai trang**

`src/app/(auth)/login/page.tsx`:

```tsx
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <LoginForm />
    </main>
  );
}
```

`src/app/(auth)/register/page.tsx`:

```tsx
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <RegisterForm />
    </main>
  );
}
```

- [ ] **Step 6: Kiểm chứng build**

Run: `npm run build`
Expected: build thành công, bảng route có `/login` và `/register`.

- [ ] **Step 7: Kiểm chứng bằng tay một lần**

Chạy `npm run dev`, mở http://localhost:3000/register, tạo một tài khoản thật. Expected: được chuyển tới `/dashboard` (lúc này còn 404 — đúng, Task 6 mới tạo trang đó). Sau đó vào Supabase Dashboard → Table Editor → `profiles`, xác nhận có dòng mới đúng tên hiển thị vừa nhập.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(auth)" src/components/auth
git commit -m "feat(1a): dang ky, dang nhap, dang xuat bang Server Action"
```

---

### Task 6: Dashboard và trang tạm buổi học

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/error.tsx`, `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/learn/[lessonId]/page.tsx`

**Interfaces:**
- Consumes: `createClient()` từ `@/lib/supabase/server`; `lessonStatuses`, `LessonRow`, `ProgressRow`, `LessonStatus` từ `@/lib/curriculum/lesson-status`; `signOut` từ `@/app/(auth)/actions`
- Produces: `/dashboard` với `data-testid="lesson-row"` trên mỗi buổi và `data-status` mang một trong bốn giá trị `LessonStatus`

- [ ] **Step 1: Tạo `src/app/(app)/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Lớp chặn thứ hai. Không thừa: middleware có thể bị bỏ qua khi matcher
  // cấu hình sai, và đó là loại lỗi âm thầm để lộ dữ liệu.
  if (!user) redirect("/login");

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col p-6">
      <header className="mb-6 flex items-center justify-between">
        <span className="font-semibold">Học TOEIC</span>
        <form action={signOut}>
          <button type="submit" className="text-sm underline">
            Đăng xuất
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Tạo `src/app/(app)/error.tsx`**

```tsx
"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex flex-col items-start gap-4">
      <h1 className="text-xl font-semibold">Không tải được dữ liệu</h1>
      <p className="text-slate-600">
        Có thể do mất mạng, hoặc máy chủ đang khởi động lại. Thử lại sau giây lát.
      </p>
      <button onClick={reset} className="rounded bg-slate-900 px-4 py-2 text-white">
        Thử lại
      </button>
    </main>
  );
}
```

Chỉ nhận `reset`, cố ý không hiển thị `error.message` — thông điệp lỗi nội bộ không nên đổ ra màn hình người học.

- [ ] **Step 3: Tạo `src/app/(app)/dashboard/page.tsx`**

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  lessonStatuses,
  type LessonRow,
  type LessonStatus,
  type ProgressRow,
} from "@/lib/curriculum/lesson-status";

interface LessonWithGrammar extends LessonRow {
  grammar_lessons: { title: string } | null;
}

const LABEL: Record<LessonStatus, string> = {
  locked: "Chưa mở",
  available: "Sẵn sàng",
  in_progress: "Đang học",
  completed: "Đã xong",
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const [lessonsRes, progressRes] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, ordinal, grammar_lessons(title)")
      .order("ordinal"),
    supabase.from("user_lesson_progress").select("lesson_id, status"),
  ]);

  if (lessonsRes.error) throw lessonsRes.error;
  if (progressRes.error) throw progressRes.error;

  const lessons = (lessonsRes.data ?? []) as LessonWithGrammar[];
  const progress = (progressRes.data ?? []) as ProgressRow[];
  const statuses = lessonStatuses(lessons, progress);

  const next = lessons.find((l) => statuses.get(l.id) !== "completed");

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Lộ trình 20 buổi</h1>
        {next && (
          <Link
            href={`/learn/${next.id}`}
            data-testid="continue-link"
            className="rounded bg-slate-900 px-4 py-2 text-white"
          >
            Học tiếp
          </Link>
        )}
      </div>

      <ol className="flex flex-col gap-2">
        {lessons.map((lesson) => {
          const status = statuses.get(lesson.id) ?? "locked";
          return (
            <li
              key={lesson.id}
              data-testid="lesson-row"
              data-status={status}
              className="flex items-center justify-between rounded border border-slate-200 bg-white px-4 py-3"
            >
              <span>
                <span className="mr-2 font-medium">Buổi {lesson.ordinal}</span>
                <span className="text-slate-600">{lesson.grammar_lessons?.title}</span>
              </span>
              <span className="text-sm text-slate-500">{LABEL[status]}</span>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
```

Truy vấn nhúng `grammar_lessons(title)` trả về **một đối tượng**, không phải mảng, vì `lessons.grammar_lesson_id` là khoá ngoại `unique` (`0002_curriculum.sql:4`). Cú pháp này đã chạy thật trên database.

Không lọc `user_lesson_progress` theo `user_id` — chính sách `own_progress` trong `0004_rls.sql:11-12` đã lọc sẵn. Thêm điều kiện ở tầng app là tạo bản sao logic phân quyền để về sau lệch pha.

- [ ] **Step 4: Tạo `src/app/(app)/learn/[lessonId]/page.tsx`**

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export default async function LearnPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("lessons")
    .select("ordinal")
    .eq("id", Number(lessonId))
    .single();

  if (!data) notFound();

  return (
    <main className="flex flex-col gap-4">
      <h1 data-testid="learn-heading" className="text-2xl font-semibold">
        Buổi {data.ordinal}
      </h1>
      <p className="text-slate-600">Luồng học sẽ được triển khai ở lát 1b.</p>
      <Link href="/dashboard" className="underline">
        Về lộ trình
      </Link>
    </main>
  );
}
```

`params` là Promise từ Next 15 trở đi — phải `await`.

- [ ] **Step 5: Kiểm chứng build**

Run: `npm run build`
Expected: build thành công, bảng route có `/dashboard` và `/learn/[lessonId]`.

- [ ] **Step 6: Kiểm chứng bằng tay một lần**

Chạy `npm run dev`, đăng nhập bằng tài khoản tạo ở Task 5. Expected: thấy 20 buổi, buổi 1 ghi "Sẵn sàng", buổi 2 trở đi ghi "Chưa mở", nút "Học tiếp" dẫn tới `/learn/1`.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)"
git commit -m "feat(1a): dashboard 20 buoi + trang tam buoi hoc"
```

---

### Task 7: Playwright

**Files:**
- Create: `playwright.config.ts`, `e2e/test-user.ts`, `e2e/admin.ts`, `e2e/global-setup.ts`, `e2e/global-teardown.ts`, `e2e/auth.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: toàn bộ app từ Task 1–6
- Produces: `npm run test:e2e`; đặt `PLAYWRIGHT_BASE_URL` để chạy cùng bộ test lên production (Task 8 dùng tới)

- [ ] **Step 1: Cài Playwright**

```bash
npm install -D @playwright/test@^1.62.1
npx playwright install chromium
```

- [ ] **Step 2: Tạo `e2e/test-user.ts`**

```ts
export const TEST_EMAIL = "e2e-phase1a@test.local";
export const TEST_PASSWORD = "e2e-pass-12345";
export const TEST_DISPLAY_NAME = "Người kiểm thử E2E";
```

- [ ] **Step 3: Tạo `e2e/admin.ts`**

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TEST_EMAIL } from "./test-user";

export function adminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Thieu SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY trong .env.local");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Xoá tài khoản kiểm thử nếu còn sót từ lần chạy trước. */
export async function deleteTestUser(admin: SupabaseClient): Promise<void> {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = data?.users.find((u) => u.email === TEST_EMAIL);
  if (found) await admin.auth.admin.deleteUser(found.id);
}
```

- [ ] **Step 4: Tạo `e2e/global-setup.ts`**

```ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { adminClient, deleteTestUser } from "./admin";
import { TEST_DISPLAY_NAME, TEST_EMAIL, TEST_PASSWORD } from "./test-user";

export default async function globalSetup(): Promise<void> {
  const admin = adminClient();
  // Dọn trước, phòng lần chạy trước bị ngắt giữa chừng.
  await deleteTestUser(admin);

  const { error } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: TEST_DISPLAY_NAME },
  });
  if (error) throw error;
}
```

- [ ] **Step 5: Tạo `e2e/global-teardown.ts`**

```ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { adminClient, deleteTestUser } from "./admin";

export default async function globalTeardown(): Promise<void> {
  await deleteTestUser(adminClient());
}
```

- [ ] **Step 6: Tạo `playwright.config.ts`**

```ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { defineConfig, devices } from "@playwright/test";

// Đặt PLAYWRIGHT_BASE_URL để chạy cùng bộ test lên bản đã deploy.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const isRemote = Boolean(process.env.PLAYWRIGHT_BASE_URL);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: isRemote
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
```

`workers: 1` có chủ ý: cả bộ dùng chung một tài khoản kiểm thử, chạy song song sẽ giẫm chân nhau ở trạng thái đăng nhập.

- [ ] **Step 7: Tạo `e2e/auth.spec.ts`**

```ts
import { expect, test } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "./test-user";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

test("chưa đăng nhập vào /dashboard thì bị đẩy về /login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test("đăng nhập sai thì báo lỗi và vẫn ở /login", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', "mat-khau-sai-hoan-toan");
  await page.click('button[type="submit"]');

  await expect(page.getByTestId("auth-error")).toHaveText("Email hoặc mật khẩu không đúng.");
  await expect(page).toHaveURL(/\/login$/);
});

test("đăng nhập đúng thì thấy 20 buổi, buổi 1 mở và buổi 2 khoá", async ({ page }) => {
  await login(page);

  const rows = page.getByTestId("lesson-row");
  await expect(rows).toHaveCount(20);
  await expect(rows.nth(0)).toHaveAttribute("data-status", "available");
  await expect(rows.nth(1)).toHaveAttribute("data-status", "locked");
});

test('bấm "Học tiếp" thì tới trang buổi 1', async ({ page }) => {
  await login(page);
  await page.getByTestId("continue-link").click();
  await expect(page.getByTestId("learn-heading")).toHaveText("Buổi 1");
});

test("đăng xuất rồi quay lại /dashboard thì bị đẩy về /login", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await page.waitForURL("**/login");

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
```

- [ ] **Step 8: Thêm script vào `package.json`**

```json
"test:e2e": "playwright test",
```

- [ ] **Step 9: Chạy bộ E2E**

Run: `npm run test:e2e`
Expected: PASS — 5 test.

Nếu test 3 báo `toHaveCount(20)` nhận về 0, nguyên nhân gần như chắc chắn là RLS: chính sách `read_lessons` trong `0004_rls.sql:36` chỉ cấp cho vai trò `authenticated`, nên nhận 0 dòng nghĩa là request tới database dưới danh nghĩa `anon` — tức cookie phiên không được middleware chuyển tiếp.

- [ ] **Step 10: Xác nhận không sót tài khoản kiểm thử**

```bash
set -a; . ./.env.local; set +a
curl -s "$SUPABASE_URL/auth/v1/admin/users?per_page=100" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | grep -o '"email":"[^"]*test.local"' | sort | uniq -c
```

Expected: không in ra gì.

- [ ] **Step 11: Commit**

```bash
git add playwright.config.ts e2e package.json package-lock.json
git commit -m "feat(1a): Playwright — 5 kich ban luong dang nhap"
```

---

### Task 8: Triển khai Vercel

**Files:**
- Modify: `docs/superpowers/PHASE0-HOAN-TAT.md` (thêm mục ghi URL production)

**Interfaces:**
- Consumes: toàn bộ Task 1–7
- Produces: URL production chạy được; cùng bộ Playwright xanh khi trỏ vào URL đó

- [ ] **Step 1: Đẩy nhánh lên GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Nối repo vào Vercel**

Vào https://vercel.com/new, chọn repo `lephus/richard-nina-learning`. Framework tự nhận Next.js. **Root Directory để nguyên gốc repo** — Next nằm ở `src/app`, không phải thư mục con.

- [ ] **Step 3: Đặt biến môi trường trên Vercel**

Thêm đúng **hai** biến, cho cả ba môi trường Production / Preview / Development:

| Biến | Giá trị |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://efouimcmdufsaywudcgx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key trong `.env.local` |

**Không thêm `SUPABASE_SERVICE_ROLE_KEY`.** Không có mã nào trong `src/` dùng tới nó; đưa lên là mở cửa hậu không lý do.

- [ ] **Step 4: Deploy và lấy URL**

Bấm Deploy. Expected: build xanh, nhận được URL dạng `https://<tên>.vercel.app`.

- [ ] **Step 5: Khai báo URL với Supabase Auth**

Supabase Dashboard → **Authentication** → **URL Configuration**:
- **Site URL**: URL Vercel vừa nhận
- **Redirect URLs**: thêm `https://<tên>.vercel.app/**`

Thiếu bước này thì chuyển hướng sau đăng nhập hỏng trên production dù local chạy tốt.

- [ ] **Step 6: Chạy Playwright lên production**

```bash
PLAYWRIGHT_BASE_URL=https://<tên>.vercel.app npm run test:e2e
```

Expected: PASS — 5 test. Đây là bằng chứng lát 1a xong: cùng bộ kiểm chứng đã chạy trên bản thật, không chỉ trên máy.

- [ ] **Step 7: Ghi lại URL production**

Thêm vào cuối `docs/superpowers/PHASE0-HOAN-TAT.md`, thay `<tên>` bằng URL thật và ngày bằng ngày deploy:

```markdown
---

## Môi trường production

| Hạng mục | Giá trị |
|---|---|
| App | https://<tên>.vercel.app |
| Supabase project | `efouimcmdufsaywudcgx` |
| Deploy lần đầu | 2026-08-07 |

Chạy lại bộ E2E trên bản production:

​```bash
PLAYWRIGHT_BASE_URL=https://<tên>.vercel.app npm run test:e2e
​```
```

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/PHASE0-HOAN-TAT.md
git commit -m "chore(1a): ghi lai URL production sau khi deploy Vercel"
git push origin main
```

---

## Đối chiếu với spec

| Mục spec | Task |
|---|---|
| 3.1 phiên bản Next 16.3 / Tailwind 4 | Task 1 |
| 3.2 bố cục `src/` | Task 1 |
| 3.3 đăng ký mở, không xác minh email | Task 5 bước 1 |
| 3.4 Server Component + `@supabase/ssr` | Task 4, 6 |
| 3.5 Playwright | Task 7 |
| 4.2 luồng xác thực, `getUser()` không `getSession()` | Task 4, 5, 6 |
| 4.3 trigger `profiles` | Task 3 |
| 5.1 dashboard đọc gì, không dùng `service_role` | Task 6 |
| 5.2 `lessonStatuses()` | Task 2 |
| 5.3 nút "Học tiếp" và trang tạm | Task 6 |
| 6 xử lý lỗi | Task 5 (thông báo chung), Task 6 (`error.tsx`) |
| 7 Vitest + Playwright | Task 2, 3, 7 |
| 8 triển khai, tên biến môi trường | Task 4 bước 1–2, Task 8 |

Một sai lệch có chủ ý so với spec mục 4.1: **không tạo `src/lib/supabase/client.ts`**. Lát 1a không có component nào cần Supabase phía trình duyệt, nên tạo file đó bây giờ là tạo mã chết. Nó sẽ ra đời ở lát 1b.
