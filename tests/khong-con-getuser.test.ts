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

/**
 * Bỏ chú thích khỏi mã trước khi quét.
 *
 * Bản đầu của test này quét thẳng nội dung tệp, nên nó khớp cả **chú thích** —
 * và hậu quả thấy ngay: `src/lib/supabase/danh-tinh.ts` buộc phải viết vòng vo
 * ("hàm `getUser()` của `auth`") thay vì gọi thẳng tên API mà nó tồn tại để
 * thay thế, chỉ để không tự tố mình. Một phép kiểm bắt nhầm văn xuôi không phải
 * an toàn thừa: nó dạy người ta né phép kiểm, và lần sau người né sẽ là người
 * đang thêm một chỗ gọi thật.
 *
 * Cắt chú thích trước rồi mới quét: tài liệu được tự do nhắc tên API cũ, còn
 * mã thì không được gọi nó.
 */
function boChuThich(nguon: string): string {
  return nguon
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("không còn gọi hàm lấy người dùng qua mạng trong src/", () => {
  // Ba vòng gọi mỗi lần điều hướng từng chiếm 64% thời gian tải trang. Chúng
  // quay lại rất dễ: cách tự nhiên nhất để thêm một trang mới là chép một trang
  // cũ. Test này là thứ duy nhất khiến việc đó ồn ào.
  //
  // Quét cả `src/middleware.ts` chứ không riêng thư mục route: middleware nằm
  // ngoài `app/` nhưng chính là vòng gọi đắt nhất trong ba vòng.
  it("không tệp nào dưới src/ gọi nó trong mã thật", () => {
    const pham = moiTepNguon("src")
      .filter((f) => boChuThich(readFileSync(f, "utf8")).includes("auth.getUser()"))
      .map((f) => f.replace(/^src\//, ""));
    expect(pham).toEqual([]);
  });

  // Chốt chặn cho chính chốt chặn: nếu ai đó "đơn giản hoá" `boChuThich` đi,
  // test trên vẫn xanh trong khi đã mất tác dụng. Hai ca này giữ cho nó thật.
  it("bỏ qua chú thích nhưng vẫn bắt được mã thật", () => {
    expect(boChuThich("// dùng auth.getUser() ở đây").includes("auth.getUser()")).toBe(false);
    expect(boChuThich("/* auth.getUser() */").includes("auth.getUser()")).toBe(false);
    expect(boChuThich("const u = await supabase.auth.getUser();").includes("auth.getUser()")).toBe(true);
  });
});
