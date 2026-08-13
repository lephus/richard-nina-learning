"use client";

import { useRef, useState, useTransition } from "react";
import { boBaiThi, nopBai, traLoi } from "@/app/(app)/exam/[id]/actions";

interface CauHoi {
  position: number;
  prompt: string;
  options: string[];
  kind: string;
}

export function ExamRunner({
  assessmentId, cauHoi,
}: {
  assessmentId: number;
  cauHoi: CauHoi[];
}) {
  const [i, setI] = useState(0);
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

  const cau = cauHoi[i];
  // `noUncheckedIndexedAccess` khiến `cauHoi[i]` suy ra `CauHoi | undefined` dù
  // bất biến của component đảm bảo `i` luôn nằm trong biên (khởi tạo 0,
  // `setI(i + 1)` chỉ chạy khi `!cuoi` tức `i < cauHoi.length - 1`). Chặn ở
  // đây — cùng khuôn `card`/`if (!card) return null` của `Deck`
  // (components/vocab/deck.tsx) — để TS thu hẹp kiểu cho phần thân còn lại,
  // kể cả bên trong `chon` được định nghĩa sau dòng này.
  if (!cau) return null;
  const cuoi = i >= cauHoi.length - 1;

  // Nhận `pos` từ nơi gọi thay vì đọc `cau.position` ngay trong thân hàm: TS
  // không mang phần thu hẹp `if (!cau) return null` ở trên vào một hàm lồng
  // được ĐỊNH NGHĨA sau đó (dù chỉ ĐỌC cùng biến `const` không đổi) — đây
  // KHÔNG phải một cái bẫy hiếm gặp, cắt ngay tại điểm gọi là cách chắc chắn
  // sạch với TS mà không cần khẳng định non-null (`!`).
  function chon(pos: number, dapAn: string) {
    hangDoi.current = hangDoi.current
      .then(() => traLoi(assessmentId, pos, dapAn))
      .then((dung) => {
        viTriLoi.current.delete(pos);
        setKetQuaTruoc(dung);
        setLoiGui(viTriLoi.current.size > 0);
      })
      .catch(() => {
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
        <span data-testid="exam-tien-do" className="text-sm font-medium">
          Câu {i + 1}/{cauHoi.length}
        </span>
        {ketQuaTruoc !== null && (
          <span
            data-testid="exam-ket-qua-truoc"
            className={ketQuaTruoc ? "text-sm text-emerald-700" : "text-sm text-rose-700"}
          >
            {ketQuaTruoc ? "Câu trước: đúng" : "Câu trước: sai"}
          </span>
        )}
      </div>

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

      {loiGui && (
        <p data-testid="exam-loi-gui" role="alert" className="text-sm text-amber-700">
          Chưa gửi được câu trả lời. Kiểm tra mạng rồi chọn lại đáp án.
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
