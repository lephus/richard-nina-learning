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
 *
 * GIỚI HẠN đã biết, ghi rõ ra để không ai lỡ tin chốt chặn này bao quát hơn
 * thực tế: đây là một phép quét chuỗi, không phải trình phân tích cú pháp. Nó
 * chỉ khớp đúng chuỗi ký tự `auth.getUser()` — một lời gọi viết
 * `auth.getUser(token)`, tách ra nhiều dòng (`auth\n  .getUser()`), hay gọi
 * qua chỉ mục động (`auth["getUser"]`) đều lọt qua mà chốt chặn không hề biết.
 * Nó cũng không thể phát hiện một trang MỚI quên xác thực hoàn toàn — không
 * có `auth.getUser()` nào để bắt vì không có lời gọi xác thực nào cả; layout
 * dưới `src/app/(app)/` là tấm chắn cho trường hợp đó, không phải test này.
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
  const tepNguon = moiTepNguon("src");

  // Kiểm soát dương cho chính phép quét tệp: nếu `moiTepNguon` vì lý do nào đó
  // (chạy sai thư mục làm việc, lỗi quyền đọc, đường dẫn đổi tên...) trả về
  // mảng rỗng, assertion `toEqual([])` bên dưới xanh một cách VÔ NGHĨA — không
  // quét được tệp nào cũng "không tìm thấy" y hệt như quét sạch thật. Chốt một
  // số lượng hợp lý (repo hiện có 63 tệp .ts/.tsx dưới src/) để phân biệt
  // "sạch" với "không chạy".
  it("quét được một số lượng tệp hợp lý dưới src/", () => {
    expect(tepNguon.length).toBeGreaterThan(20);
  });

  it("không tệp nào dưới src/ gọi nó trong mã thật", () => {
    const pham = tepNguon
      .filter((f) => boChuThich(readFileSync(f, "utf8")).includes("auth.getUser()"))
      .map((f) => f.replace(/^src\//, ""));
    expect(pham).toEqual([]);
  });

  // Chốt chặn cho chính chốt chặn: nếu ai đó "đơn giản hoá" `boChuThich` đi,
  // test trên vẫn xanh trong khi đã mất tác dụng. Ba ca này giữ cho nó thật.
  it("bỏ qua chú thích nhưng vẫn bắt được mã thật", () => {
    expect(boChuThich("// dùng auth.getUser() ở đây").includes("auth.getUser()")).toBe(false);
    expect(boChuThich("/* auth.getUser() */").includes("auth.getUser()")).toBe(false);
    expect(boChuThich("const u = await supabase.auth.getUser();").includes("auth.getUser()")).toBe(true);
  });

  // Ca riêng cho vế `(^|[^:])` của regex — phần dễ bị "đơn giản hoá" nhất vì
  // nhìn ngoài không rõ nó để làm gì. Không có vế bảo vệ đó, `//` bên trong
  // một URL đứng TRƯỚC lời gọi thật trên CÙNG một dòng bị hiểu nhầm là điểm
  // bắt đầu chú thích, và toàn bộ phần còn lại của dòng — gồm cả lời gọi thật
  // — bị cắt mất theo. Đã xác nhận bằng tay: thay `(^|[^:])\/\/.*$` bằng
  // `\/\/.*$` (bỏ hẳn vế bảo vệ, đúng regex ngây thơ mà ai đó có thể "gọn hoá"
  // về) làm đúng ca này ĐỎ trong khi ba ca ở test trên vẫn xanh — tức bản đầu
  // của test này (không có ca này) cho phép lọt đúng kiểu đơn giản hoá mà nó
  // được viết ra để chặn.
  it("URL trong chuỗi cùng dòng không nuốt mất lời gọi thật đứng sau nó", () => {
    const dong =
      'const docsUrl = "https://supabase.com/docs/reference/javascript/auth-getuser"; ' +
      "const u = await supabase.auth.getUser();";
    expect(boChuThich(dong).includes("auth.getUser()")).toBe(true);
  });
});
