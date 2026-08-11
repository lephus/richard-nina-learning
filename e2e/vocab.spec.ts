import { expect, test as base, type Page } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "./test-user";
import { adminClient } from "./admin";

/**
 * Task 11 làm mỗi lần vào trang học, hoặc đổi thẻ, bắn một POST lưu con trỏ Ở
 * NỀN — không đợi trên đường bấm (đúng thiết kế). Server Action của Next POST
 * thẳng tới URL của trang đang mở (đọc từ mã nguồn
 * `next/dist/client/.../server-action-reducer.js`) và KHÔNG đặt cờ keepalive,
 * nên một lần điều hướng thật (page.goto/reload) sẽ huỷ request còn đang bay.
 * Bấm <Link> trong app thì không sao — đó là điều hướng phía client, không
 * huỷ fetch — nhưng e2e mô phỏng "rời trang" bằng page.goto()/reload() nên
 * cần đợi các POST này lắng xuống trước khi điều hướng.
 *
 * `page.waitForLoadState("networkidle")` KHÔNG dùng được ở đây: Next tự
 * prefetch mọi <Link> đang trong khung nhìn theo chu kỳ (đo được: trang
 * /vocab một mình đã có hơn 30 link buổi + nhóm), nên mạng gần như không bao
 * giờ thật sự rảnh. Bộ đếm này CHỈ theo dõi POST (bỏ qua toàn bộ GET prefetch
 * ồn ào đó) nên chờ đúng thứ cần chờ.
 */
const test = base.extend<{ drainSaves: () => Promise<void> }>({
  drainSaves: [
    async ({ page }, use) => {
      let pending = 0;
      const onSettled = (req: { method(): string }) => {
        if (req.method() === "POST") pending = Math.max(0, pending - 1);
      };
      page.on("request", (req) => {
        if (req.method() === "POST") pending++;
      });
      page.on("requestfinished", onSettled);
      page.on("requestfailed", onSettled);
      await use(async () => {
        while (pending > 0) await new Promise((r) => setTimeout(r, 50));
      });
    },
    // Fixture Playwright chỉ khởi tạo khi có test/hook nào đó THAM CHIẾU tới
    // nó — phần lớn kịch bản trong tệp này không cần gọi `drainSaves()` trực
    // tiếp nên không khai báo nó trong tham số. Nếu không bật `auto: true`,
    // bộ đếm chỉ bắt đầu gắn listener từ lúc `afterEach` (nơi DUY NHẤT luôn
    // tham chiếu tới nó) mới nhắc tên nó lần đầu — tức là SAU khi toàn bộ
    // request của kịch bản đã bắn xong, đếm sót hết, và trở thành vô tác
    // dụng. `auto: true` buộc gắn listener ngay từ đầu MỌI kịch bản.
    { auto: true },
  ],
});

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

test.afterEach(async ({ drainSaves }) => {
  // Trang chỉ thật sự đóng SAU khối afterEach này, nên nếu dọn dữ liệu trước
  // khi POST lưu con trỏ cuối cùng của kịch bản vừa xong tới nơi, nó sẽ ghi
  // ĐÈ LẠI sau khi đã xoá — rò con trỏ sang kịch bản kế tiếp dùng chung buổi
  // học. Đợi các POST đang bay lắng xuống trước khi xoá để loại trừ race này.
  await drainSaves();

  // Dọn tiến độ của CHÍNH tài khoản test, không đụng ai khác.
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const u = data?.users.find((x) => x.email === TEST_EMAIL);
  if (u) {
    // Mỗi lượt xoá đọc `error` riêng và ném ngay: nuốt lỗi ở một trong ba
    // lượt để lại tiến độ rò sang kịch bản kế tiếp.
    const delCursor = await admin.from("lesson_cursor").delete().eq("user_id", u.id);
    if (delCursor.error) throw delCursor.error;
    const delNotes = await admin.from("word_notes").delete().eq("user_id", u.id);
    if (delNotes.error) throw delNotes.error;
    const delMastery = await admin.from("word_mastery").delete().eq("user_id", u.id);
    if (delMastery.error) throw delMastery.error;
  }
});

test("trang từ vựng liệt kê đúng 10 nhóm, mỗi nhóm 3 hoạt động", async ({ page }) => {
  await login(page);
  await page.getByTestId("vocab-link").click();
  await page.waitForURL("**/vocab");

  await expect(page.getByTestId("group-row")).toHaveCount(10);
  await expect(page.getByTestId("activity")).toHaveCount(30);
  await expect(page.getByTestId("group-summary")).toHaveText("0/10 nhóm hoàn thành");
});

test("nhóm 1 hiện đúng phạm vi từ", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await expect(page.getByTestId("group-row").first()).toContainText("NHÓM 1 · từ 1–60");
});

test("vào thẳng nhóm 7 khi chưa học nhóm nào — không còn khoá", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");

  const nhom7 = page.getByTestId("group-row").filter({ hasText: "NHÓM 7" });
  await nhom7.getByTestId("activity").first().click();

  await page.waitForURL("**/vocab/learn/**");
  await expect(page.getByTestId("deck-position")).toBeVisible();
});

test("đi tới rồi lui giữa các thẻ", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await expect(page.getByTestId("deck-position")).toHaveText("Từ 1 / 30");
  await expect(page.getByTestId("prev-button")).toBeDisabled();

  const tu1 = await page.getByTestId("card-word").textContent();

  await page.getByTestId("next-button").click();
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 2 / 30");
  await expect(page.getByTestId("card-word")).not.toHaveText(tu1!);

  await page.getByTestId("prev-button").click();
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 1 / 30");
  await expect(page.getByTestId("card-word")).toHaveText(tu1!);
});

test("phím mũi tên cũng chuyển thẻ", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 2 / 30");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 1 / 30");
});

test("câu ví dụ đã điền lại, không còn dấu gạch trống", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await expect(page.getByTestId("card-example")).not.toContainText("___");
});

test("mục lục liệt kê 30 từ và nhảy thẳng tới từ được bấm", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await expect(page.getByTestId("index-item")).toHaveCount(30);

  const muc20 = page.getByTestId("index-item").nth(19);
  // Đọc riêng phần tử con mang tên từ (`index-word`) thay vì cắt chuỗi khỏi
  // textContent của cả nút: nút còn số thứ tự ở ĐẦU và — từ khi có ô ghi chú
  // — dấu ✎ có thể xuất hiện ở CUỐI khi từ #20 đã có ghi chú. Cắt chuỗi bằng
  // regex chỉ gọt được đầu, để sót đuôi, nên từng đỏ giả (lỗi chuỗi so sánh,
  // không phải lỗi điều hướng) mỗi khi một kịch bản khác lỡ để lại ghi chú ở
  // đúng từ #20. Đọc thẳng phần tử con thì không phụ thuộc gì vào phần còn
  // lại của nút, bất kể sau này có thêm trang trí nào khác.
  const chu20 = (await muc20.getByTestId("index-word").textContent())!.trim();

  await muc20.click();
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 20 / 30");
  await expect(page.getByTestId("card-word")).toHaveText(chu20);
});

test("mục lục đánh dấu từ đang xem", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await expect(page.getByTestId("index-item").first()).toHaveAttribute("aria-current", "true");
  await page.getByTestId("next-button").click();
  await expect(page.getByTestId("index-item").nth(1)).toHaveAttribute("aria-current", "true");
});

test("ghi chú nhiều dòng được lưu và còn sau khi tải lại", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  const ghiChu = "resume resume resume\n≠ resume (v) = tiếp tục";
  await page.getByTestId("note-box").fill(ghiChu);
  await expect(page.getByTestId("note-status")).toHaveText("đã lưu");

  await page.reload();
  await expect(page.getByTestId("note-box")).toHaveValue(ghiChu);
});

test("gõ xong bấm Từ sau ngay, không đợi đã lưu — chữ vẫn tới database", async ({ page, drainSaves }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  const ghiChu = "gõ xong bấm ngay, chưa kịp chờ lưu";
  await page.getByTestId("note-box").fill(ghiChu);

  // KHÔNG đợi note-status = "đã lưu" (khác hai kịch bản ghi chú kia): mục
  // đích ở đây là ép NoteBox của từ 1 bị THÁO — đổi từ là remount vì
  // `key={card.id}` — trong lúc hẹn giờ debounce 600ms còn đang chờ, để buộc
  // chạy đúng nhánh flush() lúc tháo component. Đây là nhánh brief gọi là
  // quyết định để không mất chữ ở biên "gõ xong bấm ngay", và không kịch bản
  // nào khác từng ép nó chạy thật. `deck.tsx` xác nhận bấm "Từ sau"/"Từ
  // trước" không tự gọi mạng, nên request POST duy nhất có thể xảy ra quanh
  // cú bấm này chính là flush() chạy nền.
  const luuNen = page.waitForResponse((r) => r.request().method() === "POST", { timeout: 5000 });
  await page.getByTestId("next-button").click();
  await luuNen;

  await page.getByTestId("prev-button").click();

  // Từ Task 11, mỗi lần đổi thẻ CŨNG bắn một request lưu con trỏ ở nền, cùng
  // lúc với request flush() ghi chú ở trên — hai request chạy song song nên
  // `luuNen` (chỉ đợi MỘT POST bất kỳ) có thể đã khớp với request nào tới
  // trước, không chắc là request ghi chú. Đợi TOÀN BỘ POST đang bay lắng
  // xuống trước khi tải lại để chắc chắn request ghi chú cũng đã tới nơi —
  // không thì `page.reload()` ngay dưới đây có thể huỷ nốt nó nếu nó về sau.
  await drainSaves();

  // Tải lại trang: state `notes` ở Deck bị xoá sạch, khởi tạo lại HOÀN TOÀN
  // từ dữ liệu server gửi xuống (loadCards đọc thẳng bảng word_notes). Ô còn
  // đúng chữ ở đây thì chữ đó chắc chắn đã nằm trong database — quay lại từ
  // cũ ở dòng trên chỉ đọc lại state phía trình duyệt, không chứng minh được
  // gì về việc lưu; phép kiểm có sức nặng nằm ở đây, SAU khi tải lại.
  await page.reload();
  await expect(page.getByTestId("note-box")).toHaveValue(ghiChu);
});

test("ghi chú theo từng từ, không dùng chung", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await page.getByTestId("note-box").fill("ghi chú của từ 1");
  await expect(page.getByTestId("note-status")).toHaveText("đã lưu");

  await page.getByTestId("next-button").click();
  await expect(page.getByTestId("note-box")).toHaveValue("");

  await page.getByTestId("prev-button").click();
  await expect(page.getByTestId("note-box")).toHaveValue("ghi chú của từ 1");
});

test("mục lục đánh dấu ✎ ngay khi gõ, và còn sau khi tải lại", async ({ page }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await expect(page.getByTestId("index-item").first()).not.toContainText("✎");
  await page.getByTestId("note-box").fill("có ghi chú");

  // Ngay lập tức, không đợi lưu xong: dấu ✎ đọc từ state sống ở Deck.
  await expect(page.getByTestId("index-item").first()).toContainText("✎");
  await expect(page.getByTestId("index-item").nth(1)).not.toContainText("✎");

  await expect(page.getByTestId("note-status")).toHaveText("đã lưu");
  await page.reload();
  await expect(page.getByTestId("index-item").first()).toContainText("✎");
});

test("rời buổi học rồi vào lại thì đúng chỗ đang đọc", async ({ page, drainSaves }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");

  await page.getByTestId("index-item").nth(11).click();
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 12 / 30");

  // Đợi các POST lưu con trỏ đang bay lắng xuống trước khi rời trang — cả
  // request của lúc VÀO trang (initialIndex) lẫn của cú bấm vừa rồi. Xem chú
  // thích ở định nghĩa `drainSaves` phía trên vì sao không dùng networkidle
  // và vì sao `page.goto()` ngay dưới đây cần đợi trước.
  await drainSaves();

  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 12 / 30");
});

test("trang từ vựng hiện buổi đang học dở", async ({ page, drainSaves }) => {
  await login(page);
  await page.goto("/vocab");
  await page.getByTestId("group-row").first().getByTestId("activity").first().click();
  await page.waitForURL("**/vocab/learn/**");
  await page.getByTestId("next-button").click();
  await expect(page.getByTestId("deck-position")).toHaveText("Từ 2 / 30");

  // Lý do đợi trước khi rời trang: xem chú thích ở định nghĩa `drainSaves`
  // phía trên.
  await drainSaves();

  await page.goto("/vocab");
  const o1 = page.getByTestId("group-row").first().getByTestId("activity").first();
  await expect(o1).toHaveAttribute("data-kind", "dang-hoc");
  await expect(o1).toContainText("từ 2/30");
});
