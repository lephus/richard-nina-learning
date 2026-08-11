import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  vocabProgress,
  rhythm,
  scoreSeries,
  topWrongWords,
  type MasteryLite,
  type WordLite,
  type AssessmentLite,
} from "@/lib/stats/compute";
import { VocabProgress } from "@/components/stats/vocab-progress";
import { RhythmCard } from "@/components/stats/rhythm-card";
import { ScoreChart } from "@/components/stats/score-chart";
import { WrongWords } from "@/components/stats/wrong-words";

// Không có kiểu Database chung trên client (xem dashboard/page.tsx) nên
// postgrest-js trả `any` cho `.data` — khai kiểu tay ở đây để ép mọi phép map
// bên dưới đi qua đúng tên cột snake_case thật sự nằm trong database.
interface MasteryDbRow {
  word_id: number;
  correct_count: number;
  wrong_count: number;
  mastered: boolean;
}

interface AssessmentDbRow {
  id: number;
  type: "lesson" | "review" | "remedial" | "grammar";
  scope: number[];
  score: number | null;
  passed: boolean | null;
  submitted_at: string | null;
}

interface SubmittedAtDbRow {
  submitted_at: string | null;
}

interface WordDbRow {
  id: number;
  word: string;
  meaning_vi: string;
}

export default async function StatsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // AppLayout đã chặn ở tầng trên, nhưng vẫn tường minh ở đây — cùng cách
  // dashboard/page.tsx đang làm — và cần user.id ngay dưới để lọc tường minh
  // từng bảng riêng-tư-theo-người-dùng.
  if (!user) redirect("/login");

  // Bốn truy vấn không phụ thuộc nhau chạy song song trước. Truy vấn thứ năm
  // (vocab_words theo id) phụ thuộc kết quả word_mastery nên phải đợi ở dưới.
  const [masteryRes, assessmentsRes, submittedRes, totalRes] = await Promise.all([
    supabase
      .from("word_mastery")
      .select("word_id, correct_count, wrong_count, mastered")
      .eq("user_id", user.id),
    // Chỉ bài ĐÃ NỘP: bài đang làm dở không có điểm để vẽ lên biểu đồ.
    supabase
      .from("assessments")
      .select("id, type, scope, score, passed, submitted_at")
      .eq("user_id", user.id)
      .eq("status", "submitted"),
    // user_lesson_progress đã bị xoá ở migration 0010 (lát 2a) — mốc "một
    // buổi học" cho rhythm() không còn đo bằng buổi lesson được đánh dấu
    // completed nữa, mà đo bằng chính bài đánh giá đã nộp. Đây là truy vấn
    // RIÊNG cho mốc thời gian (chỉ lấy submitted_at) — xem chú thích tại
    // eventTimes bên dưới về việc vì sao KHÔNG gộp thêm completeAssessments.
    supabase
      .from("assessments")
      .select("submitted_at")
      .eq("user_id", user.id)
      .eq("status", "submitted"),
    // count-only, head: true — không kéo dòng nào về, chỉ đếm. Không viết
    // cứng 605 để con số này không trôi khi kho từ đổi.
    //
    // `select("id", ...)` chứ KHÔNG PHẢI `select("*", ...)`: migration 0004
    // đã revoke hết quyền cột của `vocab_words` khỏi `authenticated` rồi chỉ
    // grant lại một danh sách cột cụ thể — `blank_answer` (đáp án điền từ)
    // CHỦ Ý không nằm trong đó. `select("*")` đụng đúng cột bị chặn nên bị
    // Postgres từ chối, và vì đây là request `head: true` (không có response
    // body theo giao thức HTTP HEAD) nên supabase-js không đọc được nội dung
    // lỗi từ server, trả về `{ message: "" }` — lỗi thật nhưng trông như
    // không có gì, verify bằng browser mới bắt được. Chọn `id` vì nó luôn
    // nằm trong danh sách cột được cấp quyền.
    supabase.from("vocab_words").select("id", { count: "exact", head: true }),
  ]);

  if (masteryRes.error) throw masteryRes.error;
  if (assessmentsRes.error) throw assessmentsRes.error;
  if (submittedRes.error) throw submittedRes.error;
  if (totalRes.error) throw totalRes.error;

  const masteryRows = (masteryRes.data ?? []) as MasteryDbRow[];

  // `?? 0` ở đây là chỗ DUY NHẤT trên trang biến một lần hỏng thành một con số
  // sai đầy tự tin thay vì ném lỗi: `count` là null mà `error` cũng null (proxy
  // cắt mất `Content-Range`, supabase-js đổi cách phân tích) sẽ cho ra
  // "0 / 0" với thanh tiến độ rỗng — người học đọc thành "mọi thứ tôi thuộc đã
  // biến mất", và không có gì trên trang cải chính. Bốn truy vấn kia đều ném;
  // cái này phải ném theo.
  if (totalRes.count === null) {
    throw new Error("không đếm được tổng số từ trong kho");
  }
  const total = totalRes.count;

  const mastery: MasteryLite[] = masteryRows.map((r) => ({
    wordId: r.word_id,
    correctCount: r.correct_count,
    wrongCount: r.wrong_count,
    mastered: r.mastered,
  }));

  // Một dòng "submitted" vẫn có thể mang score/passed/submitted_at NULL nếu
  // tiến trình chết giữa lúc RPC đóng bài và UPDATE ghi điểm ngay sau đó (xem
  // src/lib/assessment/run.ts, đoạn quanh dòng 446). Một bài dở dang như vậy
  // không có gì để vẽ lên biểu đồ hay gộp vào nhịp học, nên lọc bỏ ở đây thay
  // vì để `submittedAt: null` lọt vào compute.ts và biến thành NaN im lặng.
  const completeAssessments = ((assessmentsRes.data ?? []) as AssessmentDbRow[]).filter(
    (r): r is AssessmentDbRow & { score: number; passed: boolean; submitted_at: string } =>
      r.score !== null && r.passed !== null && r.submitted_at !== null,
  );

  const assessments: AssessmentLite[] = completeAssessments.map((r) => ({
    id: r.id,
    type: r.type,
    scope: r.scope,
    score: r.score,
    passed: r.passed,
    submittedAt: r.submitted_at,
  }));

  // Sự kiện học = bài đánh giá đã nộp — trước lát 2a còn là hợp thêm với buổi
  // lesson hoàn thành (user_lesson_progress.completed_at), nhưng bảng đó đã
  // bị xoá nên giờ chỉ còn một nguồn. Đọc từ submittedRes (truy vấn riêng ở
  // trên), KHÔNG gộp thêm completeAssessments: hai truy vấn cùng lọc
  // (user_id, status = 'submitted') trên CÙNG bảng assessments nên trả về
  // đúng CÙNG một tập dòng — gộp cả hai sẽ đếm đôi mỗi bài đã nộp trong
  // rhythm() (thisWeekSessions/streakWeeks sẽ nhân đôi một cách âm thầm). Bỏ
  // giá trị null: một dòng "submitted" tồn dư có thể còn submitted_at NULL
  // (xem chú thích completeAssessments ngay dưới).
  const eventTimes = ((submittedRes.data ?? []) as SubmittedAtDbRow[])
    .map((r) => r.submitted_at)
    .filter((t): t is string => t !== null);

  const wrongIds = mastery.filter((m) => m.wrongCount > 0).map((m) => m.wordId);
  // Chỉ đọc đúng những từ có thể lên top 10 sai nhiều nhất — không kéo cả
  // 605 dòng vocab_words về chỉ để hiển thị mười dòng. Tự chặn mảng rỗng
  // trước khi gọi thay vì tin `.in([])` trả về đúng những gì mình mong đợi —
  // tránh một lượt gọi mạng thừa khi tài khoản chưa sai từ nào.
  const wordsRes =
    wrongIds.length > 0
      ? await supabase.from("vocab_words").select("id, word, meaning_vi").in("id", wrongIds)
      : { data: [] as WordDbRow[], error: null };
  if (wordsRes.error) throw wordsRes.error;

  const words: WordLite[] = ((wordsRes.data ?? []) as WordDbRow[]).map((w) => ({
    id: w.id,
    word: w.word,
    meaningVi: w.meaning_vi,
  }));

  const now = new Date();

  const progress = vocabProgress(mastery, total);
  const rhythmStats = rhythm(eventTimes, now);
  const series = scoreSeries(assessments);
  const wrongWords = topWrongWords(mastery, words);

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Thống kê học tập</h1>
      <VocabProgress progress={progress} />
      <RhythmCard rhythm={rhythmStats} />
      <ScoreChart series={series} />
      <WrongWords words={wrongWords} />

      {/* Khối thứ năm của mục 6.6, và là thứ DUY NHẤT trên trang này dẫn ra
          ngoài ứng dụng. Thống kê nói người học đang ở đâu; luyện đề thật là
          việc kế tiếp họ cần làm. `rel="noopener noreferrer"` vì mở tab mới:
          không có nó, trang đích đọc được `window.opener` của ta. */}
      <section className="rounded border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Luyện đề thật</h2>
        <p className="mt-1 text-sm text-slate-600">
          Khi đã vững từ vựng và ngữ pháp, hãy làm đề TOEIC thật để quen áp lực thời gian.
        </p>
        <a
          href="https://study4.com/tests/toeic/"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="practice-link"
          className="mt-3 inline-block underline"
        >
          Làm đề TOEIC thật trên study4.com
        </a>
      </section>
    </main>
  );
}
