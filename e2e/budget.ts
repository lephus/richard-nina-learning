/**
 * Ngân sách thời gian cho một kịch bản, KHÁC NHAU giữa chạy local và chạy lên
 * bản đã deploy.
 *
 * Vì sao phải khác: các kịch bản nặng ở đây làm hàng chục lượt round-trip THẬT
 * (một buổi học là ~50 thao tác chấm, một bài ôn tập là 25 câu). Chạy local,
 * mỗi lượt là `localhost` → Supabase. Chạy với `PLAYWRIGHT_BASE_URL`, mỗi lượt
 * là trình duyệt → Vercel (edge + middleware `getUser()` + Server Action) →
 * Supabase, cộng thêm khả năng khởi động nguội của serverless function.
 *
 * Con số 90 giây được chọn cho môi trường local, và ở đó nó rộng rãi — kịch
 * bản nặng nhất chạy hết 57 giây. Nhưng trên production nó đã ở SÁT TRẦN suốt
 * ba lượt chạy liên tiếp: đúng 1.5 phút mỗi lần, tức vừa vặn qua. Một lượt
 * chậm hơn bình thường là tràn, và khi tràn thì thông báo lỗi ("Test timeout")
 * không nói gì về nguyên nhân — nó trông hệt như một lỗi chức năng, và đã một
 * lần bị chẩn đoán nhầm như vậy.
 *
 * Nhân đôi khi chạy từ xa là để cái trần đó thôi làm nhiễu tín hiệu. Nó KHÔNG
 * che giấu lỗi chậm: một trang thật sự hỏng vẫn đỏ, chỉ là đỏ vì đúng lý do.
 */
const REMOTE = Boolean(process.env.PLAYWRIGHT_BASE_URL);

export function budget(localMs: number): number {
  return REMOTE ? localMs * 2 : localMs;
}
