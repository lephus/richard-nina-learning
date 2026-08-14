import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Next 15+ mặc định `dynamic: 0` cho trang động, nên bấm "quay lại" cũng
    // tải lại từ server — với app này là một vòng gọi Supabase nữa cho một
    // trang người học vừa xem xong. 30 giây đủ để việc đi tới đi lui giữa
    // /vocab và một buổi học là tức thì, mà vẫn ngắn hơn nhiều so với thời
    // gian một bài thi làm thay đổi trạng thái hiển thị trên đó.
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
