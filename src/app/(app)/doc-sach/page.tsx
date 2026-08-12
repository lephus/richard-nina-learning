import { redirect } from "next/navigation";

// `/doc-sach` tràn về trang đầu. Số trang luôn nằm trên URL để F5, dán link
// và nút back của trình duyệt đều về đúng chỗ.
export default function DocSachIndex() {
  redirect("/doc-sach/1");
}
