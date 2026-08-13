"use client";

import { useRef, useState, useTransition } from "react";
import { boBaiThi, nopBai, traLoi } from "@/app/(app)/exam/[id]/actions";
import { groupOf } from "@/lib/curriculum/groups";

interface CauHoi {
  position: number;
  prompt: string;
  options: string[];
  kind: string;
  /** Đã có `user_answer` ghi từ trước (mở lại một bài làm dở) — xem finding 3. */
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
 * hơn (hàng đợi `hangDoi` vẫn tuần tự y hệt, không đổi), chỉ vì có nhiều vòng
 * mạng hơn nên một sự cố hiếm có nhiều cơ hội xảy ra hơn.
 *
 * Thử lại AN TOÀN nhờ chính `recordAnswer` (lib/exam/run.ts) đã thiết kế sẵn
 * cho đúng tình huống này: CAS `user_answer is null` trong UPDATE khiến một
 * lượt gọi lại cho ĐÚNG vị trí đã ghi thành công ở lần trước chỉ trả về
 * `ghiNhanLanNay: false` (không cộng mastery lần hai, không ném lỗi) — comment
 * tại đó liệt kê thẳng "client tự gọi lại sau phản hồi chậm" là tình huống đã
 * lường trước. Thử lại ở đây chỉ tận dụng đúng sự an toàn có sẵn đó, không che
 * giấu gì: mạng hỏng THẬT (không chỉ thoáng qua) thì mọi lần thử đều trượt,
 * và hành vi chặn nộp + thông điệp cảnh báo cũ (`exam-loi-gui`) vẫn nguyên như
 * trước — "làm sản phẩm suy giảm trung thực" (yêu cầu bàn giao) nghĩa là CHỈ
 * chặn nộp khi sự cố thật sự dai dẳng, không phải ngay ở lần rớt gói tin đầu
 * tiên mà bất kỳ kết nối mạng thật nào — kể cả của một người học bình thường,
 * không liên quan gì tới tốc độ bấm — cũng có thể gặp.
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
  const [ketQuaTruoc, setKetQuaTruoc] = useState<boolean | null>(null);
  const [loiGui, setLoiGui] = useState(false);
  const [dangNop, batDauNop] = useTransition();
  // Transition RIÊNG cho "Bỏ bài": dùng chung với dangNop thì bấm bỏ bài giữa
  // lúc câu cuối đang nộp (dangNop=true) sẽ vô tình bị khoá theo, dù hai hành
  // động không loại trừ nhau về mặt dữ liệu (nộp xong hay bỏ giữa chừng đều
  // hợp lệ tuỳ người học bấm cái nào trước).
  const [dangBo, batDauBo] = useTransition();

  // Hàng đợi TUẦN TỰ: mỗi đáp án nối vào cuối lời hứa trước. Bấm nhanh hơn mạng
  // vẫn giữ đúng thứ tự ghi, và `hangDoi.current` chính là thứ phải cạn trước
  // khi nộp — không cần đếm số request đang bay.
  const hangDoi = useRef<Promise<void>>(Promise.resolve());

  // Tập VỊ TRÍ chưa gửi được — một Ref chứ không phải state. Quyết định chặn
  // nộp ở dưới chạy TRONG closure bất đồng bộ của `batDauNop`; closure đó chụp
  // state tại đúng thời điểm BẤM, nên không bao giờ thấy được kết quả gửi của
  // CHÍNH cú bấm đang kích hoạt nó (câu cuối) — kết quả đó chỉ có SAU khi hàm
  // async đã bắt đầu chạy. Ref thì luôn đọc được giá trị MỚI NHẤT bất kể
  // closure nào tạo ra nó, cùng lý do `hangDoi` ở trên cũng phải là ref.
  // Dùng một TẬP theo vị trí thay vì một cờ boolean đơn: nếu chỉ có một cờ và
  // lần gửi THÀNH CÔNG nào cũng xoá nó, thì một câu giữa bài lỡ gửi hỏng sẽ bị
  // "rửa sạch" bởi một câu KHÁC gửi thành công sau đó — trong khi câu hỏng kia
  // vẫn còn `user_answer` NULL trong database. Theo dõi từng vị trí thì gửi lại
  // thành công CHO ĐÚNG vị trí vừa hỏng (chỉ khả thi với câu cuối — câu duy
  // nhất còn hiện lại được sau khi hỏng, vì giao diện không có nút lùi) mới
  // xoá được cảnh báo, còn câu hỏng ở giữa bài (không còn cách nào gửi lại) sẽ
  // chặn nộp vĩnh viễn cho tới hết phiên — đúng yêu cầu "còn câu chưa gửi được
  // thì chặn nộp".
  const viTriLoi = useRef<Set<number>>(new Set());

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
          Bỏ bài — huỷ bài đang làm dở, không lưu kết quả, quay lại buổi học
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
    hangDoi.current = hangDoi.current
      .then(() => traLoiCoThuLai(assessmentId, pos, dapAn))
      .then(({ ghiNhanLanNay, dung }) => {
        viTriLoi.current.delete(pos);
        // SỬA SAU VÒNG SOÁT CUỐI (finding 3): chỉ hiện dải đúng/sai khi CHÍNH
        // lượt bấm này vừa được chấm thật (`ghiNhanLanNay`). Vị trí đã có đáp
        // án ghi từ trước (mở lại một bài đang làm dở rồi lỡ bấm lại một câu
        // — hiếm vì `i` đã khởi động ở câu đầu tiên CHƯA trả lời, nhưng vẫn
        // có thể xảy ra ở đúng câu khởi động nếu một tab khác vừa trả lời nó
        // song song) sẽ trả `dung` không mô tả điều đã ghi trong database —
        // ẩn dải đi còn trung thực hơn hiện một giá trị có thể sai.
        setKetQuaTruoc(ghiNhanLanNay ? dung : null);
        setLoiGui(viTriLoi.current.size > 0);
      })
      .catch(() => {
        // Tới đây nghĩa là `traLoiCoThuLai` đã thử hết số lần cho phép và vẫn
        // trượt — coi là hỏng THẬT, chặn nộp bằng cảnh báo trung thực (xem
        // JSDoc của `traLoiCoThuLai`, và `exam-loi-gui` bên dưới).
        viTriLoi.current.add(pos);
        setLoiGui(true);
      });

    if (cuoi) {
      batDauNop(async () => {
        await hangDoi.current;
        // Còn vị trí nào chưa gửi được thì CHẶN nộp: nộp lúc này cho điểm thấp
        // giả, và người học không có cách nào biết vì sao. Đọc
        // `viTriLoi.current` (ref, luôn mới nhất) chứ không phải state
        // `loiGui` chụp lúc bấm — xem chú thích tại chỗ khai báo ref phía trên.
        if (viTriLoi.current.size > 0) return;
        await nopBai(assessmentId);
      });
      return;
    }
    setI(i + 1);
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

      {ketQuaTruoc !== null && (
        <span
          data-testid="exam-ket-qua-truoc"
          className={ketQuaTruoc ? "text-sm text-emerald-700" : "text-sm text-rose-700"}
        >
          {ketQuaTruoc ? "Câu trước: đúng" : "Câu trước: sai"}
        </span>
      )}

      <p data-testid="exam-de" className="text-lg">{cau.prompt}</p>

      <div className="flex flex-col gap-2">
        {cau.options.map((o) => (
          <button
            key={o}
            type="button"
            data-testid="exam-option"
            disabled={dangNop || dangBo}
            onClick={() => chon(cau.position, o)}
            className="rounded border border-slate-300 px-4 py-2 text-left hover:bg-slate-50 disabled:opacity-50"
          >
            {o}
          </button>
        ))}
      </div>

      {/* SỬA SAU VÒNG SOÁT CUỐI (finding 4): thông điệp cũ ("Kiểm tra mạng
          rồi chọn lại đáp án") không đúng sự thật cho phần lớn trường hợp —
          giao diện không có nút lùi, nên với một câu hỏng ở GIỮA bài không hề
          có đáp án nào để "chọn lại". Nói đúng thứ đang biết (còn bao nhiêu
          câu chưa gửi được) và thứ THẬT SỰ hành động được (tải lại trang giờ
          đã an toàn — finding 3 làm cho việc mở lại bài giữ đúng tiến độ và
          không lặp lại các câu đã ghi). */}
      {loiGui && (
        <p data-testid="exam-loi-gui" role="alert" className="text-sm text-amber-700">
          Còn {viTriLoi.current.size} câu chưa gửi được lên máy chủ, nên chưa
          nộp bài được. Tải lại trang này — bài sẽ giữ đúng những câu đã gửi
          thành công và cho làm tiếp từ câu đầu tiên chưa trả lời.
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
        Bỏ bài — huỷ bài đang làm dở, không lưu kết quả, quay lại buổi học
      </button>
    </main>
  );
}
