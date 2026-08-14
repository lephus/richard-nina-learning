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
