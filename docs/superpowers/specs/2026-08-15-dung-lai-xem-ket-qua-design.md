# Thiết kế: Dừng lại xem kết quả sau mỗi câu

**Mục tiêu:** trả lời xong một câu thì dừng lại, cho người học biết đúng hay sai,
đáp án đúng là gì, và vì sao — rồi họ bấm Tiếp tục mới sang câu sau.

**Phạm vi:** **mọi loại bài thi** — `lesson`, `review`, `remedial`, `grammar`.

---

## 1. Đây là đảo lại một quyết định cũ, không phải sửa lỗi

Spec phase 2 mục 5.4 ghi: *"Bấm một đáp án → sang câu sau ngay lập tức"*. Dải
"câu trước: đúng/sai" ở đầu trang thi là hệ quả trực tiếp của lựa chọn đó —
phản hồi tới sau khi người học đã sang câu khác, nên chỉ kịp là một dòng chữ nhỏ.

Lát này đi hướng ngược lại: **ưu tiên học hơn ưu tiên nhịp**. Ghi lại ở đây để
người sau đọc mã không tưởng dải chữ cũ bị xoá nhầm.

## 2. Dữ liệu đã có sẵn tới đâu

Kiểm quyền cột trong `0004_rls.sql`:

| Cần hiện | Tình trạng |
|---|---|
| `vocab_words.word`, `meaning_vi`, `example_vi` | ✅ đã cấp cho `authenticated` |
| `vocab_words.blank_answer` | ❌ không cấp — nhưng RPC `answer_for_word` đã có |
| `grammar_questions.explanation` | ❌ không cấp, **và chưa có RPC nào** |

537 câu ngữ pháp **đã có sẵn** `explanation` bằng tiếng Việt trong database
(ví dụ: *"Trạng từ 'deeply' bổ nghĩa cho phân từ 'impressed' nên cần dùng trạng
từ, không dùng tính từ 'deep'."*). Không phải soạn mới.

Điểm dễ nhầm: Server Action **không** đặc quyền hơn client — nó dùng chính
`SupabaseClient` của người dùng, cũng là vai `authenticated`, nên nó vấp đúng
hàng rào cột đó. Muốn đọc `explanation` phải qua một hàm `security definer`.

## 3. Một migration, và nó không thêm vòng gọi nào

Thêm RPC `security definer` trả **cả đáp án lẫn giải thích** cho một câu ngữ
pháp. Nó **thay** lời gọi `answer_for_question` mà `recordAnswer` đang dùng để
chấm, chứ không cộng thêm — số vòng gọi cho câu ngữ pháp **không đổi**.

Phía từ vựng không cần migration:

| Dạng câu | Trước | Sau |
|---|---|---|
| nghĩa → từ | 1 select (`word`) | 1 select (`word, meaning_vi, example_vi`) — **cùng một vòng** |
| ví dụ khuyết → từ | 1 RPC `answer_for_word` | 1 RPC + 1 select — **thêm một vòng** |
| ngữ pháp | 1 RPC | 1 RPC (mới, trả hai trường) — **không đổi** |

Chỉ dạng "điền" tốn thêm một lượt, và nó chạy trong lúc người học đang đọc màn
hình kết quả — không phải lúc họ chờ để bấm tiếp.

Lát trước vừa bỏ ba vòng gọi xác thực mỗi lần điều hướng; ghi rõ chi phí ở đây
để không âm thầm tiêu lại phần vừa tiết kiệm.

## 4. Đáp án chỉ rời server sau khi câu trả lời đã bị khoá

`recordAnswer` trả thêm `dapAnDung` và `giaiThich`, **sau** khi CAS
`user_answer IS NULL` đã ghi xong. Lúc client biết đáp án thì nó không còn đổi
được câu trả lời của mình nữa, nên không mở đường gian lận.

Chốt chặn cũ giữ nguyên: `assessment_items.payload` gửi xuống lúc tải trang vẫn
chỉ có `prompt`, `options`, `kind` — **không bao giờ** có đáp án. Đây là khẳng
định đã có test canh; nó phải còn nguyên sau lát này.

Trường hợp CAS thua — câu đã trả lời từ trước, ví dụ mở lại một bài đang dở —
vẫn trả đáp án về để hiện, vì câu trả lời đã ghi rồi nên vô hại. Nhưng **không**
cộng mastery lần hai, đúng như luật hiện hành.

## 5. Bốn trạng thái của một câu

| Trạng thái | Màn hình |
|---|---|
| Chưa trả lời | bốn phương án bấm được |
| Đang gửi | phương án khoá lại, báo đang gửi |
| Đã có kết quả | phương án đóng băng — thấy rõ mình chọn gì và đâu là đáp án đúng — cộng khối đúng/sai, đáp án, giải thích, và nút **Tiếp tục** (câu cuối: **Nộp bài**) |
| Gửi hỏng | báo lỗi ngay tại câu đó, phương án mở lại để chọn lại |

Dải "câu trước: đúng/sai" ở đầu trang bị bỏ: phản hồi giờ nằm ngay tại câu vừa
làm, nên nó thành thừa và gây nhiễu.

## 6. Một mớ phức tạp tự biến mất

`ExamRunner` hiện giữ một `Set` các vị trí gửi hỏng (`viTriLoi`) và chặn nộp bài
ở cuối nếu tập đó chưa rỗng. Toàn bộ cơ chế ấy sinh ra **chỉ vì** giao diện chạy
nhanh hơn mạng — người học đã ở câu 12 trong khi câu 7 còn chưa gửi xong.

Vòng soát cuối lát 2b đã chỉ ra hệ quả tệ nhất: một câu hỏng ở giữa bài chặn nộp
cả bài, mà thông báo lại bảo "kiểm tra mạng rồi chọn lại đáp án" — trong khi
không có đường nào quay lại câu đó để chọn lại.

Khi giao diện đứng chờ kết quả, lỗi hiện ra **tại đúng câu vừa hỏng**, và bốn
phương án vẫn đang trên màn hình để bấm lại. Không còn câu nào "hỏng ở phía sau"
để phải nhớ, nên `viTriLoi` và việc chặn-nộp-ở-cuối không còn lý do tồn tại.

Đây là lý do lát này **giảm** độ phức tạp chứ không tăng.

## 7. Cái phải trả trong bộ test

- `e2e/exam.spec.ts` có kịch bản tên **"bấm một đáp án là sang câu sau ngay"** —
  nó khẳng định đúng hành vi đang bị bỏ. **Viết lại, không xoá**: nó trở thành
  "bấm một đáp án thì dừng lại cho xem kết quả".
- Mọi kịch bản chạy hết một bài giờ tốn **hai cú bấm mỗi câu**. Bài ngữ pháp dài
  nhất có 100 câu. **Nới timeout, không cắt số câu** — số câu là thứ các kịch bản
  đó đang canh.

## 8. Kiểm thử

**Tích hợp**
- `recordAnswer` trả đúng `dapAnDung` cho cả ba dạng câu (nghĩa, điền, ngữ pháp).
- `giaiThich` có nội dung thật cho **cả ba** dạng câu — SỬA VÒNG 1 (đối chiếu
  Task 2, sau khi task-2-report.md nộp lần đầu): bản gốc của dòng này ghi
  "`giaiThich` có nội dung thật cho câu ngữ pháp, và `null` cho câu từ vựng",
  MÂU THUẪN trực tiếp với mục 9 ngay dưới đây ("Dùng nghĩa tiếng Việt và câu
  ví dụ đã có" cho câu từ vựng — tức VẪN có nội dung, chỉ là GHÉP từ dữ liệu
  sẵn có thay vì soạn mới, không phải bỏ trống). Mục 9 mới là quyết định thật
  (người dùng chọn phương án "đầy đủ", mà hiện nghĩa/ví dụ cho câu từ vựng là
  phần lớn lý do phương án đó đáng làm) — câu ở đây đã sai và được sửa lại cho
  khớp. Xem cách ghép cụ thể (từ `meaning_vi` + `example_vi`, không phải văn
  bản soạn riêng) tại `ghepGiaiThichTuVung` trong `src/lib/exam/run.ts`.
- **`payload` vẫn không chứa đáp án** — khẳng định cũ, phải còn nguyên.
- Trả lời lại một câu đã trả lời: vẫn trả đáp án về, **không** cộng mastery lần hai.

**E2E**
- Trả lời đúng → thấy báo đúng, thấy nút Tiếp tục, và **chưa** sang câu mới.
- Trả lời sai → thấy đáp án đúng.
- Mọi loại câu (ngữ pháp lẫn từ vựng) → thấy giải thích — xem sửa vòng 1 ở mục
  "Tích hợp" ngay trên.
- Bấm Tiếp tục → sang câu sau.
- Câu cuối → nộp được bài, tới trang kết quả.

## 9. Cố ý không làm

- **Phím tắt** (Enter để tiếp tục). Chưa có ai hỏi; thêm phím tắt là thêm một
  đường tương tác nữa phải test.
- **Xem lại các câu đã làm.** Giao diện vẫn không có nút lùi; lát này không đổi
  điều đó.
- **Giải thích cho câu từ vựng viết riêng.** Dùng nghĩa tiếng Việt và câu ví dụ
  đã có; không soạn thêm nội dung mới.
