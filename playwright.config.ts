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
  // Một test.only bỏ sót trên CI không được phép âm thầm thu hẹp cả bộ xuống
  // một kịch bản — merge gate phải thấy toàn bộ suite chạy.
  forbidOnly: !!process.env.CI,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: isRemote
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: "http://localhost:3000",
        // true sẽ tái dùng bất kỳ thứ gì đang lắng nghe cổng 3000 — kể cả
        // `npm run dev` chạy sẵn lúc code — nên suite âm thầm test server dev
        // với code có thể cũ, không phải bản build production vừa dựng. Chỉ
        // tái dùng khi KHÔNG chạy CI; trên CI luôn build + start mới.
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
