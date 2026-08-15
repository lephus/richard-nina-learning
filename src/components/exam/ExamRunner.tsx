"use client";

import { useState, useTransition } from "react";
import { boBaiThi, nopBai, traLoi } from "@/app/(app)/exam/[id]/actions";
import { groupOf } from "@/lib/curriculum/groups";

interface CauHoi {
  position: number;
  prompt: string;
  options: string[];
  kind: string;
  /**
   * Đã có `user_answer` ghi từ trước (mở lại một bài làm dở) — dùng bởi
   * `chiSoDauTienChuaTraLoi` bên dưới để tìm câu khởi động đúng. Không còn
   * việc nào khác đọc cờ này trong component: bản trước lát "dừng lại xem kết
   * quả" (finding 3 cũ) còn dùng nó để quyết định có hiện dải "câu trước:
   * đúng/sai" hay không — dải đó đã bị bỏ, xem chú thích tại `chon` phía dưới.
   */
  daTraLoi: boolean;
}

/**
 * Vị trí đầu tiên CHƯA trả lời — điểm khởi động của một phiên `ExamRunner`.
 * Tất cả đã trả lời (không nên xảy ra bình thường: câu cuối luôn kích hoạt
 * nộp bài ngay khi trả lời xong — nhưng có thể còn sót nếu `nopBai` chết giữa
 * chừng sau khi hàng đợi đã gửi hết) thì dừng ở câu CUỐI thay vì chỉ số vượt
 * biên, để người học ít nhất còn thấy được một câu và nút "Bỏ bài".
 */
function chiSoDauTienChuaTraLoi(cauHoi: readonly CauHoi[]): number {
  const idx = cauHoi.findIndex((c) => !c.daTraLoi);
  return idx === -1 ? Math.max(cauHoi.length - 1, 0) : idx;
}

/**
 * Tên nhóm suy từ một ordinal buổi bất kỳ trong nhóm đó, "?" nếu không suy
 * được — SỬA Ở VÒNG SOÁT CUỐI (mục 3 minor): trước bản vá này chỉ nhánh
 * `review` của `tieuDe` gọi thẳng `groupOf(buoi)`, hàm ném `RangeError` khi
 * `buoi` ngoài biên 1..20 (`scope[0]` hỏng — dữ liệu sai, không nên xảy ra,
 * nhưng KHÔNG PHẢI KHÔNG THỂ). Ném giữa THÂN RENDER của một client component
 * giết cả trang, trong khi hai nhánh còn lại (`lesson`/`remedial` một buổi)
 * chỉ lặng lẽ hiện "?" cho đúng tình huống tương tự (`buoi ?? "?"`, không ném
 * gì) — không cân xứng: cùng một loại hỏng dữ liệu, hai hậu quả khác hẳn nhau
 * tuỳ rơi vào nhánh nào. Bọc `groupOf` ở một chỗ DUY NHẤT để cả ba nhánh
 * xuống cấp giống hệt nhau khi `buoi` hỏng.
 */
function tenNhomAnToan(buoi: number | null): string {
  if (buoi === null) return "?";
  try {
    return String(groupOf(buoi));
  } catch {
    return "?";
  }
}

/**
 * Nhãn nút "Bỏ bài" — SỬA Ở VÒNG SOÁT CUỐI lát 2d (mục 1): bản trước hard-code
 * đúng MỘT câu "…quay lại buổi học" cho MỌI loại bài, kể cả `grammar` và
 * `review`/`remedial` phạm vi nhóm — cả ba loại đó đều KHÔNG đưa người học về
 * một "buổi học" (xem `boBaiThi`, `src/app/(app)/exam/[id]/actions.ts`: bài
 * `grammar` → `/grammar`, bài phạm vi nhóm → `/vocab`), nên nhãn cũ hứa sai
 * điểm đến. Ba nhánh dưới đây khớp ĐÚNG ba đích mà `boBaiThi` thật sự đưa tới,
 * cùng khuôn với `tieuDe` ngay trên — một hàm DUY NHẤT thay vì để nhãn trôi
 * dạt khỏi hành vi thật ở hai nơi bấm nút (`cauHoi.length === 0` và nhánh
 * chính) dùng chung.
 */
function nhanBoBai(
  loaiBai: "lesson" | "remedial" | "review" | "grammar",
  phamViNhieuBuoi: boolean,
): string {
  if (loaiBai === "grammar") {
    return "Bỏ bài — huỷ bài đang làm dở, không lưu kết quả, quay lại Ngữ pháp";
  }
  if (loaiBai === "review" || phamViNhieuBuoi) {
    return "Bỏ bài — huỷ bài đang làm dở, không lưu kết quả, quay lại Từ vựng";
  }
  return "Bỏ bài — huỷ bài đang làm dở, không lưu kết quả, quay lại buổi học";
}

/** Số lần thử TỐI ĐA cho một lượt gọi `traLoi` — 1 lần gốc + 2 lần thử lại. */
const SO_LAN_THU_TOI_DA = 3;

/** Chờ `ms` mili giây — khoảng nghỉ giữa hai lần thử lại của `traLoiCoThuLai`. */
function cho(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Gọi `traLoi`, thử lại tối đa `SO_LAN_THU_TOI_DA` lần nếu trượt.
 *
 * Điều tra lỗi "còn N câu chưa gửi được" ở bài ôn tập 60 câu (bắt lỗi thật
 * bằng debug tạm rồi soát log server — xem task-3-report.md) tìm ra lỗi THẬT
 * là một lần rớt mạng THOÁNG QUA ở tầng `fetch` (`TypeError: Failed to
 * fetch`) — KHÔNG phải lỗi nghiệp vụ: server chưa từng thấy request đó (log
 * server sạch, không một dòng nào của `traLoi` xuất hiện quanh thời điểm
 * trượt). Chạy sạch cùng một đoạn code nhiều lần: có lần 0/60 câu trượt, có
 * lần 1/60 trượt ở một vị trí ngẫu nhiên khác nhau mỗi lần — không lặp lại ở
 * cùng vị trí hay cùng một ngưỡng số lượng cố định, đúng hình dạng nhiễu mạng
 * thoáng qua chứ không phải một giới hạn cố định (không có lỗi 429/401 nào,
 * không có thông điệp nghiệp vụ nào từ `recordAnswer`). Bài ôn tập 60 câu gấp
 * đôi số vòng mạng tuần tự so với bài buổi 30 câu — không phải vì bấm nhanh
 * hơn, chỉ vì có nhiều vòng mạng hơn nên một sự cố hiếm có nhiều cơ hội xảy ra
 * hơn. (Điều tra này chạy trên giao diện CŨ, dùng một hàng đợi `hangDoi` để ép
 * thứ tự ghi — hàng đợi đó đã bị gỡ ở lát "dừng lại xem kết quả" vì giao diện
 * giờ đứng chờ từng câu nên tự nhiên tuần tự, xem chú thích tại khai báo
 * `trangThai` trong `ExamRunner`; kết luận điều tra — lỗi là nhiễu mạng thoáng
 * qua — vẫn đúng, không phụ thuộc vào hàng đợi đó.)
 *
 * Thử lại AN TOÀN nhờ chính `recordAnswer` (lib/exam/run.ts) đã thiết kế sẵn
 * cho đúng tình huống này: CAS `user_answer is null` trong UPDATE khiến một
 * lượt gọi lại cho ĐÚNG vị trí đã ghi thành công ở lần trước chỉ trả về
 * `ghiNhanLanNay: false` (không cộng mastery lần hai, không ném lỗi) — comment
 * tại đó liệt kê thẳng "client tự gọi lại sau phản hồi chậm" là tình huống đã
 * lường trước. Thử lại ở đây chỉ tận dụng đúng sự an toàn có sẵn đó, không che
 * giấu gì: mạng hỏng THẬT (không chỉ thoáng qua) thì mọi lần thử đều trượt.
 *
 * SỬA Ở LÁT "dừng lại xem kết quả": bản trước, hết số lần thử vẫn trượt sẽ đưa
 * vị trí vào một tập `viTriLoi` và CHẶN NỘP BÀI ở cuối — cơ chế đó tồn tại chỉ
 * vì giao diện cũ chạy TRƯỚC mạng (sang câu kế ngay khi bấm, không đợi phản
 * hồi), nên một câu hỏng ở giữa bài không còn cách nào quay lại để sửa, và
 * phải chặn nộp ở cuối để không lộ điểm giả. Giao diện lát này ĐỨNG CHỜ kết
 * quả của từng câu trước khi cho sang câu kế (xem `ExamRunner` bên dưới), nên
 * khi hết số lần thử vẫn trượt, lỗi hiện NGAY TẠI câu vừa hỏng — trạng thái
 * "gửi hỏng" — với bốn phương án vẫn còn nguyên trên màn hình để bấm lại,
 * không cần một cơ chế nhớ-vị-trí-hỏng nào nữa. Xem thêm chú thích tại khai
 * báo `trangThai`/hàm `chon` bên dưới.
 */
async function traLoiCoThuLai(assessmentId: number, pos: number, dapAn: string) {
  for (let lan = 1; lan <= SO_LAN_THU_TOI_DA; lan++) {
    try {
      return await traLoi(assessmentId, pos, dapAn);
    } catch (err) {
      if (lan === SO_LAN_THU_TOI_DA) throw err;
      await cho(300 * lan);
    }
  }
  // Không bao giờ tới đây — vòng lặp trên luôn return hoặc throw ở lần cuối.
  // Chỉ để TypeScript thấy hàm có giá trị trả về trên MỌI nhánh.
  throw new Error("traLoiCoThuLai: không thể tới đây");
}

/**
 * Trạng thái của CÂU ĐANG XEM — bốn hình dạng theo thiết kế lát này (mục 5,
 * `docs/superpowers/specs/2026-08-15-dung-lai-xem-ket-qua-design.md`):
 *
 * - `chua-tra-loi`: bốn phương án bấm được.
 * - `dang-gui`: đã bấm một phương án, đang chờ `traLoiCoThuLai` — phương án
 *   khoá lại (không phải vì đã CÓ kết quả, chỉ vì đang CHỜ nó).
 * - `da-co-ket-qua`: server đã trả `dapAnDung`/`giaiThich` — phương án đóng
 *   băng, hiện khối phản hồi và nút Tiếp tục/Nộp bài.
 * - `gui-hong`: hết số lần thử lại (`traLoiCoThuLai`) mà vẫn trượt — phương
 *   án MỞ LẠI để bấm lại, không phải một trạng thái đọc-only như hai cái trên.
 *
 * Một `union` theo `loai` thay vì nhiều cờ `boolean` rời rạc (kiểu
 * `ketQuaTruoc`/`loiGui` của bản trước lát này) để KHÔNG THỂ dựng được một tổ
 * hợp vô nghĩa (ví dụ vừa "đang gửi" vừa "gửi hỏng" cùng lúc) — TypeScript tự
 * thu hẹp kiểu theo `loai` nên phần render bên dưới đọc đúng trường mà không
 * cần đoán hay ép kiểu.
 */
type TrangThaiCau =
  | { loai: "chua-tra-loi" }
  | { loai: "dang-gui"; dapAnDaChon: string }
  | {
      loai: "da-co-ket-qua";
      dapAnDaChon: string;
      dung: boolean;
      dapAnDung: string;
      giaiThich: string;
    }
  | { loai: "gui-hong"; dapAnDaChon: string };

export function ExamRunner({
  assessmentId, cauHoi, loaiBai, buoi, phamViNhieuBuoi, canhBaoLechBuoi,
}: {
  assessmentId: number;
  cauHoi: CauHoi[];
  /**
   * Loại bài — hiện trên đầu trang (finding 5), người học biết đang thi gì.
   * SỬA Ở LÁT 2c (yêu cầu F): thêm "review" — trước bản vá chỉ có "lesson" |
   * "remedial", nên một bài ôn tập nhóm (`batDauOnTap`) rơi vào nhánh mặc
   * định của `tieuDe` bên dưới và hiện "Bài buổi ?", không nói được đang thi
   * gì giữa 60 câu.
   * THÊM Ở LÁT 2d: "grammar" — bài ngữ pháp (`batDauBaiNguPhap`) đi qua ĐÚNG
   * trang `/exam/[id]` này, không phải một trang riêng. Không thêm nhánh cho
   * nó thì TypeScript vẫn "sạch" ở phía gọi (page.tsx ép kiểu `as` từ
   * `string`, không nổ), nhưng runtime rơi vào nhánh mặc định bên dưới và
   * hiện nhãn "Bài buổi ?" cho MỌI bài ngữ pháp — sai hoàn toàn, không phải
   * một trường hợp biên hiếm.
   */
  loaiBai: "lesson" | "remedial" | "review" | "grammar";
  /** Buổi (ordinal — xem chú thích ở page.tsx về sự trùng hợp id/ordinal). `null` nếu scope rỗng.
      Với một bài mang phạm vi NHIỀU buổi (`phamViNhieuBuoi === true`), đây là ordinal buổi ĐẦU
      của nhóm (`scope[0]`) — dùng để suy ngược ra số nhóm qua `groupOf`, không phải một buổi để
      hiện riêng. Với `loaiBai === "grammar"`, đây là `grammar_lessons.ordinal` (1..20, một hệ số
      HOÀN TOÀN KHÁC ordinal buổi từ vựng) — page.tsx tra qua quan hệ nhúng `grammar_lessons(ordinal)`
      vì `scope` luôn rỗng cho loại bài này. */
  buoi: number | null;
  /**
   * THÊM Ở VÒNG SOÁT CUỐI (mục 1): `true` khi `scope` gốc của bài này có HAI
   * phần tử — bài `review` chính nó, HOẶC một bài `remedial`/"làm lại" sinh
   * ra từ một bài `review` (giữ nguyên `scope` của cha, xem `batDauBoTuc`).
   * Trước bản vá này, `tieuDe` bên dưới chỉ rẽ theo `loaiBai`, nên một bài
   * bổ túc sinh từ một bài ôn tập nhóm bị gắn nhãn "Bài bổ túc buổi X" dù nó
   * phủ 60 từ của HAI buổi — sai giống hệt lỗi đã sửa ở `boBaiThi`/trang kết
   * quả, chỉ khác chỗ lộ ra. Tính sẵn ở `page.tsx` (nơi có `scope` đầy đủ)
   * bằng đúng predicate dùng chung (`phamViThuocNhom`) — component này không
   * tự có `scope` để tự suy ra.
   */
  phamViNhieuBuoi: boolean;
  /** `true` khi bài đang mở KHÔNG phải bài người học vừa bấm (finding 5). */
  canhBaoLechBuoi: boolean;
}) {
  const [i, setI] = useState(() => chiSoDauTienChuaTraLoi(cauHoi));
  const [trangThai, setTrangThai] = useState<TrangThaiCau>({ loai: "chua-tra-loi" });
  const [dangNop, batDauNop] = useTransition();
  // Transition RIÊNG cho "Bỏ bài": dùng chung với dangNop thì bấm bỏ bài giữa
  // lúc câu cuối đang nộp (dangNop=true) sẽ vô tình bị khoá theo, dù hai hành
  // động không loại trừ nhau về mặt dữ liệu (nộp xong hay bỏ giữa chừng đều
  // hợp lệ tuỳ người học bấm cái nào trước).
  const [dangBo, batDauBo] = useTransition();

  // KHÔNG còn hàng đợi tuần tự (`hangDoi`, một `Promise` nối trong ref) và
  // KHÔNG còn tập vị trí gửi hỏng (`viTriLoi`) — cả hai bị GỠ Ở LÁT NÀY, có
  // chủ đích, không phải bỏ sót:
  //
  // - `hangDoi` tồn tại vì giao diện CŨ sang câu kế NGAY khi bấm, không đợi
  //   mạng — nên có thể có NHIỀU lệnh `traLoi` đang bay cùng lúc (câu 7 chưa
  //   xong thì người học đã ở câu 12), và hàng đợi giữ đúng THỨ TỰ ghi. Giao
  //   diện lát này ĐỨNG CHỜ (`trangThai.loai === "dang-gui"` khoá phương án
  //   lại) trước khi cho sang câu kế — tại một thời điểm bất kỳ chỉ có ĐÚNG
  //   MỘT lệnh `traLoi` đang bay, do chính cấu trúc component đảm bảo, không
  //   cần một hàng đợi để ép thứ tự nữa.
  // - `viTriLoi` tồn tại để CHẶN NỘP ở cuối bài khi còn câu chưa gửi được —
  //   hệ quả trực tiếp của việc giao diện cũ có thể đã "đi qua" một câu hỏng
  //   mà không còn cách nào quay lại sửa. Giao diện lát này không bao giờ đi
  //   qua một câu hỏng: gặp lỗi thì dừng NGAY tại câu đó (`trangThai.loai ===
  //   "gui-hong"`), phương án vẫn mở để bấm lại, nút Tiếp tục/Nộp bài còn
  //   chưa từng xuất hiện cho câu này — không có "câu chưa gửi được" nào lọt
  //   được tới lúc nộp bài để phải nhớ hay chặn.
  //
  // Xem thêm mục 6 của spec thiết kế lát này ("Một mớ phức tạp tự biến mất").

  // SỬA Ở LÁT 2c (yêu cầu F): nhánh "review" đặt tên nhóm thay vì buổi — một
  // bài ôn tập nhóm không thuộc buổi nào, hiện "Bài buổi ?" (nhánh mặc định
  // cũ) không nói được người học đang thi cái gì giữa 60 câu (đúng điểm mà
  // tiêu đề trang thi được thêm ở lát 2b nhắm tới). `buoi` của một bài mang
  // phạm vi nhiều buổi luôn là ordinal buổi ĐẦU của nhóm (`scope[0]` — HAI
  // phần tử `scope` luôn theo đúng thứ tự `lessonsOf`), nên `groupOf` suy
  // ngược ra đúng số nhóm — chính là nghịch đảo của `lessonsOf` mà bàn giao
  // gợi ý dùng.
  //
  // MỞ RỘNG Ở VÒNG SOÁT CUỐI (mục 1): nhánh "remedial" giờ tách theo
  // `phamViNhieuBuoi` — một bài bổ túc sinh từ bài `review` (phạm vi nhiều
  // buổi) được gắn nhãn "Bài bổ túc nhóm N", không còn dùng chung nhãn "Bài
  // bổ túc buổi N" của bổ túc một-buổi (đọc `groupOf(buoi)` sẽ SAI ĐÍCH nếu
  // hiểu buoi như một buổi đơn — nó vẫn đúng số vì `groupOf` chỉ cần MỘT
  // ordinal bất kỳ trong nhóm, nhưng nhãn "buổi N" tự nó đã sai bản chất).
  // THÊM Ở LÁT 2d: nhánh "grammar" đứng TRƯỚC "remedial"/"review" — bài ngữ
  // pháp không có bổ túc (mục 3.3 thiết kế phase 2: "loại này không có"), nên
  // không cần lo tổ hợp `phamViNhieuBuoi` ở đây (luôn `false` cho grammar, xem
  // page.tsx). `buoi` là `grammar_lessons.ordinal`, không phải một buổi từ
  // vựng — nhãn "Bài buổi N" của nhánh mặc định sẽ SAI DOMAIN nếu để lọt vào
  // đó (đọc như "buổi học từ vựng thứ N", trong khi N ở đây là số bài NGỮ
  // PHÁP), nên tách riêng thay vì gộp vào nhánh cuối.
  const tieuDe =
    loaiBai === "grammar" ? `Bài ngữ pháp ${buoi ?? "?"}`
    : loaiBai === "remedial"
      ? (phamViNhieuBuoi ? `Bài bổ túc nhóm ${tenNhomAnToan(buoi)}` : `Bài bổ túc buổi ${buoi ?? "?"}`)
    : loaiBai === "review" ? `Bài ôn tập nhóm ${tenNhomAnToan(buoi)}`
    : `Bài buổi ${buoi ?? "?"}`;

  // SỬA SAU VÒNG SOÁT CUỐI (finding 1, lớp phòng thủ thứ hai): một bài
  // `in_progress` có thể sống sót với 0 câu hỏi — trước bản vá `createVocabExam`
  // có xoá bù (src/lib/exam/run.ts) khi insert `assessment_items` thất bại
  // giữa chừng, hoặc chính lượt xoá bù đó cũng lỗi nốt. `cauHoi[i]` khi đó
  // LUÔN `undefined`. Cho một lối thoát THẬT ở đây thay vì `return null` (im
  // lặng render trang trắng) — TRƯỚC bản vá này nút "Bỏ bài" nằm SAU chỗ
  // return sớm nên không bao giờ tới lượt hiện ra, khoá cứng người học ra
  // khỏi mọi bài thi vì chỉ số một-phần `assessments_one_in_progress`.
  if (cauHoi.length === 0) {
    return (
      <main className="flex flex-col gap-4">
        <h1 data-testid="exam-heading" className="text-lg font-semibold">{tieuDe}</h1>
        <p data-testid="exam-rong" role="alert" className="text-sm text-rose-700">
          Bài thi này không còn câu hỏi nào — có gì đó đã hỏng lúc dựng đề.
          Bấm &quot;Bỏ bài&quot; bên dưới để quay lại buổi học và làm bài mới.
        </p>
        <button
          type="button"
          data-testid="exam-bo-bai"
          disabled={dangBo}
          onClick={() => batDauBo(() => boBaiThi(assessmentId))}
          className="self-start text-sm text-rose-700 underline disabled:opacity-50"
        >
          {nhanBoBai(loaiBai, phamViNhieuBuoi)}
        </button>
      </main>
    );
  }

  const cau = cauHoi[i];
  // `noUncheckedIndexedAccess` khiến `cauHoi[i]` suy ra `CauHoi | undefined` dù
  // bất biến của component đảm bảo `i` luôn nằm trong biên (khởi tạo bằng
  // `chiSoDauTienChuaTraLoi`, luôn kẹp trong [0, cauHoi.length-1] vì `cauHoi`
  // không rỗng ở nhánh này; `setI(i + 1)` chỉ chạy khi `!cuoi` tức
  // `i < cauHoi.length - 1`). Chặn ở đây — cùng khuôn `card`/`if (!card)
  // return null` của `Deck` (components/vocab/deck.tsx) — để TS thu hẹp kiểu
  // cho phần thân còn lại, kể cả bên trong `chon` được định nghĩa sau dòng này.
  if (!cau) return null;
  const cuoi = i >= cauHoi.length - 1;

  // Nhận `pos` từ nơi gọi thay vì đọc `cau.position` ngay trong thân hàm: TS
  // không mang phần thu hẹp `if (!cau) return null` ở trên vào một hàm lồng
  // được ĐỊNH NGHĨA sau đó (dù chỉ ĐỌC cùng biến `const` không đổi) — đây
  // KHÔNG phải một cái bẫy hiếm gặp, cắt ngay tại điểm gọi là cách chắc chắn
  // sạch với TS mà không cần khẳng định non-null (`!`).
  function chon(pos: number, dapAn: string) {
    // Chặn tường minh ở tầng logic, không chỉ dựa vào `disabled` trên DOM:
    // phương án đã "đang gửi" hay "đã có kết quả" thì một cú bấm lọt qua
    // (ví dụ bấm ép, bỏ qua kiểm tra actionability — Playwright `force: true`
    // dùng đúng cách này để kiểm định điều KHÔNG được xảy ra ở e2e) sẽ không
    // làm gì, không gửi thêm lệnh `traLoi` nào cho vị trí đã khoá.
    if (trangThai.loai === "dang-gui" || trangThai.loai === "da-co-ket-qua") return;

    setTrangThai({ loai: "dang-gui", dapAnDaChon: dapAn });
    traLoiCoThuLai(assessmentId, pos, dapAn)
      .then((ket) => {
        // KHÔNG còn nhánh theo `ghiNhanLanNay` — khác bản trước lát này (xem
        // finding 3 cũ, JSDoc `KetQuaTraLoi` tại `lib/exam/run.ts`), nơi dải
        // "câu trước" có thể sai vì nó hiện ở ĐẦU TRANG trong lúc đã sang câu
        // KHÁC với câu vừa tạo ra nó. Phản hồi ở đây luôn thuộc ĐÚNG câu vừa
        // bấm — kể cả khi `ghiNhanLanNay` là `false` (câu đã có đáp án ghi từ
        // trước, ví dụ mở lại một bài đang làm dở), `dapAnDung`/`giaiThich`
        // vẫn đúng và `dung` vẫn mô tả đúng đáp án VỪA GỬI, không có gì cần
        // che — mục 4 spec thiết kế: "câu trả lời đã ghi rồi nên vô hại".
        setTrangThai({
          loai: "da-co-ket-qua",
          dapAnDaChon: dapAn,
          dung: ket.dung,
          dapAnDung: ket.dapAnDung,
          giaiThich: ket.giaiThich,
        });
      })
      .catch(() => {
        // Hết số lần thử của `traLoiCoThuLai` mà vẫn trượt — dừng NGAY tại
        // câu này, không phải chặn nộp ở cuối bài (xem JSDoc `traLoiCoThuLai`
        // và chú thích tại chỗ gỡ `viTriLoi` phía trên).
        setTrangThai({ loai: "gui-hong", dapAnDaChon: dapAn });
      });
  }

  /**
   * Bấm "Tiếp tục"/"Nộp bài" — nút này CHỈ hiện khi `trangThai.loai ===
   * "da-co-ket-qua"` (xem render bên dưới), nên không cần tự kiểm lại trạng
   * thái ở đây. Tách khỏi `chon`: gửi đáp án (một lệnh mạng, xảy ra ngay khi
   * bấm phương án) và chuyển sang câu kế/nộp bài (chỉ sau khi người học đọc
   * xong phản hồi rồi TỰ bấm) giờ là hai hành động của hai cú bấm khác nhau —
   * bản trước lát này gộp cả hai vào cùng một lần bấm phương án.
   */
  function tiepTuc() {
    if (cuoi) {
      batDauNop(async () => {
        await nopBai(assessmentId);
      });
      return;
    }
    setI(i + 1);
    setTrangThai({ loai: "chua-tra-loi" });
  }

  /**
   * Lớp CSS của một phương án theo `trangThai` — tách khỏi JSX vì có BỐN tổ
   * hợp (đáp án đúng, đã chọn nhưng sai, đã chọn khi đang chờ, chưa chọn) mà
   * viết trực tiếp trong `className` inline sẽ thành một biểu thức ba lần
   * lồng nhau khó đọc. "đã có kết quả" tô XANH cho đáp án đúng bất kể có được
   * chọn hay không (người học luôn thấy đáp án thật), tô ĐỎ CHỈ cho phương án
   * đã chọn nếu nó KHÔNG PHẢI đáp án đúng — khi phương án đã chọn chính là
   * đáp án đúng thì chỉ có một tô màu (xanh), không chồng thêm viền đỏ.
   */
  function lopPhuongAn(o: string): string {
    const nen = "rounded border px-4 py-2 text-left transition-colors";
    if (trangThai.loai === "da-co-ket-qua") {
      if (trangThai.dapAnDung === o) return `${nen} border-emerald-500 bg-emerald-50 text-emerald-900`;
      if (trangThai.dapAnDaChon === o) return `${nen} border-rose-500 bg-rose-50 text-rose-900`;
      return `${nen} border-slate-200 text-slate-400`;
    }
    if (trangThai.loai === "dang-gui" && trangThai.dapAnDaChon === o) {
      return `${nen} border-slate-400 bg-slate-100 opacity-70`;
    }
    return `${nen} border-slate-300 hover:bg-slate-50 disabled:opacity-50`;
  }

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 data-testid="exam-heading" className="text-lg font-semibold">{tieuDe}</h1>
        <span data-testid="exam-tien-do" className="text-sm font-medium">
          Câu {i + 1}/{cauHoi.length}
        </span>
      </div>

      {/* Finding 5 (vòng soát cuối): bài `in_progress` tìm thấy KHÁC với thứ
          người học vừa bấm (buổi khác, hoặc bổ túc thay vì bài buổi) — trước
          bản vá này im lặng đưa thẳng vào 30 câu vô danh. */}
      {canhBaoLechBuoi && (
        <p data-testid="exam-lech-buoi" role="alert" className="text-sm text-amber-700">
          Đây KHÔNG phải bài bạn vừa chọn — bạn đang có một bài làm dở khác
          ({tieuDe}) nên được đưa vào đây để làm tiếp. Bấm &quot;Bỏ bài&quot;
          bên dưới nếu muốn huỷ bài này rồi bắt đầu đúng bài vừa chọn.
        </p>
      )}

      {/* Dải "câu trước: đúng/sai" của bản trước lát này BỊ BỎ (mục 5 spec
          thiết kế) — nó hiện ở đầu trang trong lúc đã sang câu KHÁC với câu
          vừa tạo ra nó, nên chỉ kịp là một dòng chữ nhỏ dễ bỏ lỡ. Phản hồi lát
          này nằm NGAY TẠI câu vừa làm (`exam-phan-hoi` bên dưới, trong lúc vẫn
          đứng ở câu đó), nên dải riêng ở đầu trang thành thừa. */}

      <p data-testid="exam-de" className="text-lg">{cau.prompt}</p>

      <div className="flex flex-col gap-2">
        {cau.options.map((o) => (
          <button
            key={o}
            type="button"
            data-testid="exam-option"
            disabled={trangThai.loai === "dang-gui" || trangThai.loai === "da-co-ket-qua" || dangNop || dangBo}
            onClick={() => chon(cau.position, o)}
            className={lopPhuongAn(o)}
          >
            {o}
          </button>
        ))}
      </div>

      {trangThai.loai === "da-co-ket-qua" && (
        <div
          data-testid="exam-phan-hoi"
          className="flex flex-col gap-2 rounded border border-slate-200 p-4"
        >
          <p
            className={
              trangThai.dung ? "text-sm font-medium text-emerald-700" : "text-sm font-medium text-rose-700"
            }
          >
            {trangThai.dung ? "Chính xác." : "Chưa đúng."}
          </p>
          <p data-testid="exam-dap-an-dung" className="text-sm">
            Đáp án đúng: <span className="font-medium">{trangThai.dapAnDung}</span>
          </p>
          {/* `giaiThich` không nullable cho cả bốn loại bài (Task 2 —
              `KetQuaTraLoi.giaiThich`, `lib/exam/run.ts`) nên hiện thẳng,
              không cần kiểm rỗng. Hiện NGUYÊN VĂN, không cắt nhỏ: với câu từ
              vựng chuỗi này đã được ghép sẵn ở server (`ghepGiaiThichTuVung`)
              từ nghĩa tiếng Việt + câu ví dụ, phía giao diện không cần biết
              đang hiện câu ngữ pháp hay từ vựng để render đúng. */}
          <p data-testid="exam-giai-thich" className="text-sm text-slate-700">
            {trangThai.giaiThich}
          </p>
          <button
            type="button"
            data-testid="exam-tiep-tuc"
            disabled={dangNop || dangBo}
            onClick={tiepTuc}
            className="self-start rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {cuoi ? "Nộp bài" : "Tiếp tục"}
          </button>
        </div>
      )}

      {/* SỬA Ở LÁT "dừng lại xem kết quả": thông điệp CŨ ("Còn N câu chưa gửi
          được... tải lại trang") mô tả một cơ chế đã bị GỠ (`viTriLoi`, chặn
          nộp ở cuối bài — xem chú thích tại chỗ khai báo `trangThai` và tại
          `traLoiCoThuLai`). Giao diện lát này dừng NGAY tại câu vừa hỏng nên
          hành động đúng không còn là "tải lại trang" mà là "bấm lại một
          phương án đang mở sẵn ngay bên trên". */}
      {trangThai.loai === "gui-hong" && (
        <p data-testid="exam-loi-gui" role="alert" className="text-sm text-amber-700">
          Gửi câu trả lời không thành công — có thể là một lần rớt mạng thoáng
          qua. Câu này CHƯA được ghi nhận, nên bấm lại một phương án bên trên
          để thử lại — chọn phương án nào cũng được, kể cả khác với lần trước.
        </p>
      )}

      {/* Lối thoát cho người học không muốn làm tiếp bài này: bấm LÀM BÀI ở
          buổi học sẽ đưa thẳng vào lại bài dang dở (yêu cầu C bàn giao), nên
          phải có một cách BỎ HẲN ngay tại đây — nếu không, người từng bỏ dở
          một bài không còn muốn làm sẽ mắc kẹt vĩnh viễn ở chính bài đó. */}
      <button
        type="button"
        data-testid="exam-bo-bai"
        disabled={dangNop || dangBo}
        onClick={() => batDauBo(() => boBaiThi(assessmentId))}
        className="self-start text-sm text-rose-700 underline disabled:opacity-50"
      >
        {nhanBoBai(loaiBai, phamViNhieuBuoi)}
      </button>
    </main>
  );
}
