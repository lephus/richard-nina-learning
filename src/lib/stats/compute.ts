/**
 * Hàm thuần tính số liệu cho trang `/stats` — không I/O, không React, không
 * database. Trang chỉ hiển thị những gì các hàm dưới đây trả ra, nên một lỗi
 * ở đây là một con số sai hiển thị cho người học mà không có gì đối chiếu.
 *
 * Cùng khuôn với `src/lib/assessment/next-step.ts`: `now` luôn là tham số,
 * không bao giờ đọc đồng hồ hệ thống bên trong logic, để test kiểm được mọi
 * nhánh thời gian mà không phải chờ, và để mọi so sánh dùng chung một nguồn.
 */

export const WEEKLY_TARGET = 2;
export const TOP_WRONG_LIMIT = 10;

export interface MasteryLite {
  wordId: number;
  correctCount: number;
  wrongCount: number;
  mastered: boolean;
}

export interface WordLite {
  id: number;
  word: string;
  meaningVi: string;
}

export interface AssessmentLite {
  id: number;
  type: "lesson" | "review" | "remedial" | "grammar";
  scope: number[];
  score: number;
  passed: boolean;
  submittedAt: string; // ISO 8601
}

export interface VocabProgress {
  mastered: number;
  seen: number;
  total: number;
}

export interface Rhythm {
  streakWeeks: number;
  thisWeekSessions: number;
  target: number;
}

export interface ScorePoint {
  id: number;
  label: string;
  score: number;
  passed: boolean;
}

export interface WrongWord {
  wordId: number;
  word: string;
  meaningVi: string;
  wrongCount: number;
}

// Việt Nam ở UTC+07:00 cố định và không áp dụng giờ mùa hè kể từ 1975, nên
// cộng thẳng 7 tiếng vào mốc UTC rồi đọc các trường getUTC*() là đúng — không
// cần Intl.DateTimeFormat hay thư viện múi giờ nào. "Cộng cứng 7 tiếng" trông
// như một chỗ cẩu thả nếu không ghi rõ lý do này: nó an toàn CHỈ VÌ Việt Nam
// không có múi giờ thứ hai và không có giờ mùa hè để lệch mất bù trừ.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Khoá tuần theo giờ Việt Nam, tuần bắt đầu thứ Hai. Trả về mốc mili-giây của
 * 00:00 thứ Hai (đã dời sang hệ VN) để so sánh và trừ nhau được.
 *
 * Nếu gộp theo UTC thay vì giờ VN, một buổi học tối Chủ nhật (giờ VN) — vốn
 * dĩ đã sang 00:xx thứ Hai UTC — sẽ bị đẩy sang tuần sau, làm đứt chuỗi của
 * người học một cách âm thầm và sai.
 */
function vnWeekStart(iso: string | Date): number {
  const t = (typeof iso === "string" ? new Date(iso) : iso).getTime() + VN_OFFSET_MS;
  const d = new Date(t);
  // getUTCDay(): 0 = Chủ nhật. Đưa về 0 = thứ Hai.
  const dayFromMonday = (d.getUTCDay() + 6) % 7;
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return midnight - dayFromMonday * 24 * 60 * 60 * 1000;
}

/**
 * Tiến độ từ vựng: đã thuộc / đã gặp / tổng số từ trong kho.
 *
 * Đếm trực tiếp cột `mastered` (đã được `masteryDelta` ở src/lib/mastery/apply.ts
 * duy trì sẵn), KHÔNG suy lại từ correctCount - wrongCount ở đây — ngưỡng
 * MASTERY_THRESHOLD chỉ có một định nghĩa; suy lại là tạo bản sao thứ hai sẽ
 * lệch khỏi bản gốc ngày nào đó ngưỡng đổi.
 */
export function vocabProgress(rows: readonly MasteryLite[], total: number): VocabProgress {
  return {
    mastered: rows.filter((r) => r.mastered).length,
    seen: rows.length,
    total,
  };
}

/**
 * Nhịp học trong tuần: số buổi tuần này, và chuỗi tuần liên tiếp có học.
 *
 * Định nghĩa chuỗi: số tuần liên tiếp có ít nhất một sự kiện học, đếm ngược
 * từ tuần hiện tại. Nếu tuần hiện tại CHƯA có sự kiện nào thì đếm ngược từ
 * tuần trước — nếu không, chuỗi của mọi người tụt về 0 vào đúng sáng thứ Hai
 * hàng tuần (trước khi kịp học buổi nào), một hành vi vừa sai vừa làm nản.
 * Cả tuần này lẫn tuần trước đều rỗng thì chuỗi là 0.
 */
export function rhythm(eventTimes: readonly string[], now: Date): Rhythm {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const current = vnWeekStart(now);
  const weeks = new Set<number>();
  for (const t of eventTimes) weeks.add(vnWeekStart(t));

  const thisWeekSessions = eventTimes.filter((t) => vnWeekStart(t) === current).length;

  // Neo chuỗi ở tuần này nếu tuần này đã học, ngược lại ở tuần trước.
  let anchor = weeks.has(current) ? current : current - WEEK_MS;
  let streakWeeks = 0;
  while (weeks.has(anchor)) {
    streakWeeks++;
    anchor -= WEEK_MS;
  }

  return { streakWeeks, thisWeekSessions, target: WEEKLY_TARGET };
}

const KIND_LABEL: Record<AssessmentLite["type"], string> = {
  lesson: "Buổi",
  review: "Ôn tập buổi",
  remedial: "Bổ túc buổi",
  grammar: "Ngữ pháp",
};

/**
 * Nhãn một bài đã nộp, ví dụ "Ôn tập buổi 1–2".
 *
 * Dấu gạch giữa hai số là EN DASH — U+2013 (–), KHÔNG phải dấu gạch nối
 * thường (-, U+002D). Playwright so khớp nguyên văn chuỗi này.
 *
 * `lessons[0]` và `lessons[length-1]` chứ không phải chỉ số cố định: bài bổ
 * túc thường chỉ có một phần tử trong `scope`, còn bài ngữ pháp có mảng rỗng.
 */
function label(type: AssessmentLite["type"], scope: readonly number[]): string {
  if (type === "grammar" || scope.length === 0) return KIND_LABEL[type];
  const range = scope.length > 1 ? `${scope[0]}–${scope[scope.length - 1]}` : `${scope[0]}`;
  return `${KIND_LABEL[type]} ${range}`;
}

/**
 * Chuỗi điểm số theo thời gian, đã sắp xếp — mảng vào có thể ở bất kỳ thứ tự
 * nào (Postgres không đảm bảo thứ tự trả về nếu không ORDER BY), nên hàm tự
 * sắp lại theo submittedAt; bằng nhau thì theo id để thứ tự TẤT ĐỊNH.
 */
export function scoreSeries(rows: readonly AssessmentLite[]): ScorePoint[] {
  return [...rows]
    .sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt) || a.id - b.id)
    .map((r) => ({
      id: r.id,
      label: label(r.type, r.scope),
      score: r.score,
      passed: r.passed,
    }));
}

/**
 * Top các từ hay sai nhất, để người học biết nên ôn từ nào trước.
 *
 * Bỏ qua từ không có mặt trong `words` (dữ liệu vocab đổi mà mastery chưa kịp
 * dọn, hoặc từ đã bị xoá khỏi kho) thay vì render một dòng rỗng/undefined.
 */
export function topWrongWords(
  mastery: readonly MasteryLite[],
  words: readonly WordLite[],
  limit: number = TOP_WRONG_LIMIT,
): WrongWord[] {
  const byId = new Map(words.map((w) => [w.id, w]));
  return mastery
    .filter((m) => m.wrongCount > 0)
    // Sai nhiều trước; bằng nhau thì theo wordId để thứ tự TẤT ĐỊNH — không có
    // tie-break thì hai lần tải trang cho ra hai thứ tự khác nhau.
    .sort((a, b) => b.wrongCount - a.wrongCount || a.wordId - b.wordId)
    .slice(0, limit)
    .flatMap((m) => {
      const w = byId.get(m.wordId);
      return w ? [{ wordId: m.wordId, word: w.word, meaningVi: w.meaningVi, wrongCount: m.wrongCount }] : [];
    });
}
