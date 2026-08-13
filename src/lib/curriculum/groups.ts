/**
 * Nhóm học là PHÉP CHIA, không phải một bảng: nhóm `g` gồm buổi `2g−1` và `2g`.
 *
 * Cùng khuôn tất định với `itemAt`/`slotAt` của lát 1 — không lưu xuống
 * database nên không có gì để lệch pha với nội dung đã seed, và không có
 * migration nào phải chạy khi cách chia nhóm đổi.
 *
 * Thay cho `lib/assessment/slots.ts` (chuỗi 35 hoạt động khoá tuần tự) đã xoá
 * ở lát này: 10 nhóm đều mở, thứ tự chỉ còn là cách sắp xếp trên màn hình.
 */

export const TOTAL_LESSONS = 20;
export const LESSONS_PER_GROUP = 2;
export const WORDS_PER_LESSON = 30;
export const TOTAL_GROUPS = TOTAL_LESSONS / LESSONS_PER_GROUP; // 10

export function groupOf(lessonOrdinal: number): number {
  if (
    !Number.isInteger(lessonOrdinal) ||
    lessonOrdinal < 1 ||
    lessonOrdinal > TOTAL_LESSONS
  ) {
    throw new RangeError(`buổi ${lessonOrdinal} ngoài biên 1..${TOTAL_LESSONS}`);
  }
  return Math.ceil(lessonOrdinal / LESSONS_PER_GROUP);
}

export function lessonsOf(group: number): [number, number] {
  if (!Number.isInteger(group) || group < 1 || group > TOTAL_GROUPS) {
    throw new RangeError(`nhóm ${group} ngoài biên 1..${TOTAL_GROUPS}`);
  }
  const first = (group - 1) * LESSONS_PER_GROUP + 1;
  return [first, first + 1];
}

/**
 * `true` khi phạm vi (`assessments.scope`) trải HAI buổi trở lên — tức thuộc
 * một bài ÔN TẬP NHÓM (`type: "review"`), hoặc một bài BỔ TÚC/LÀM LẠI sinh ra
 * từ một bài ôn tập nhóm (`type: "remedial"`, hoặc `"review"` nếu là chính
 * `lamLaiBai` dựng lại lần thử chính) — cả hai giữ nguyên `scope` hai phần tử
 * của bài `review` cha, không thu hẹp về một buổi (xem `batDauBoTuc`/
 * `lamLaiBai` ở `ket-qua/actions.ts`). Bài buổi, và bổ túc/làm lại sinh ra từ
 * NÓ, luôn có đúng một phần tử.
 *
 * Đếm số phần tử của `scope` — KHÔNG đọc `assessments.type` — chính vì lý do
 * trên: `type` một mình không phân biệt được "một bài bổ túc của một buổi"
 * với "một bài bổ túc của một nhóm ôn tập", cả hai đều mang `type ===
 * "remedial"`. Một predicate DUY NHẤT ở đây thay cho việc mỗi nơi cần biết
 * (trang kết quả, `boBaiThi`, tiêu đề `ExamRunner`, …) tự viết `scope.length >
 * 1` — gộp lại một chỗ để sửa một lần, không để năm bản chép trôi dạt khỏi
 * nhau (vòng soát cuối lát 2c, mục 1).
 */
export function phamViThuocNhom(scope: readonly number[]): boolean {
  return scope.length > 1;
}

/**
 * Nhãn phạm vi từ của một nhóm, ví dụ "từ 1–60".
 *
 * Dấu giữa hai số là EN DASH — U+2013 (–), KHÔNG phải dấu gạch nối thường
 * (-, U+002D). Playwright so khớp nguyên văn chuỗi này; đổi sang gạch nối làm
 * kịch bản e2e trượt một cách âm thầm — không lỗi biên dịch, không lỗi kiểu,
 * chỉ so chuỗi sai. Cùng lý do đã ghi ở `assessmentLabel` của lát 1.
 */
export function wordRangeLabel(group: number): string {
  const [first, last] = lessonsOf(group);
  return `từ ${(first - 1) * WORDS_PER_LESSON + 1}–${last * WORDS_PER_LESSON}`;
}
