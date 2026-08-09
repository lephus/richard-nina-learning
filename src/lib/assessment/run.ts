import type { SupabaseClient } from "@supabase/supabase-js";
import { hashString } from "@content/shuffle-options";
import { buildAssessmentItems, buildRemedialItems, type AssessmentItemSpec } from "./build";
import type { AssessmentType } from "./next-step";
import {
  toVocabLite,
  type BuiltItem,
  type GrammarLite,
  type VocabLite,
} from "@/lib/lesson/build-item";
import { gradeItem } from "@/lib/lesson/grade";
import { applyMastery } from "@/lib/mastery/write";

/**
 * Vòng đời một bài đánh giá: bắt đầu → trả lời từng câu → nộp (hoặc bị đóng vì
 * quá hạn). Đây là nơi ĐỒNG HỒ Ở SERVER sống — mọi so sánh thời gian đọc
 * `now` truyền vào và `expires_at` trong database, không bao giờ hỏi trình
 * duyệt bây giờ là mấy giờ (spec mục 6.2).
 *
 * Tệp này KHÔNG có "use server", cùng lý do `lib/lesson/run-submit.ts` ở 1b:
 * trong tệp "use server" mọi export đều thành một HTTP endpoint công khai, nên
 * một hàm nhận `SupabaseClient` sẽ tạo ra endpoint có chữ ký không hợp lệ.
 * Server Action bọc mỏng nằm ở lát sau. Và vì hàm luôn NHẬN client của người
 * dùng chứ không tự dựng, `SUPABASE_SERVICE_ROLE_KEY` không có chỗ lọt vào.
 */

export const DURATION_MS: Record<AssessmentType, number> = {
  review: 15 * 60 * 1000,
  test: 60 * 60 * 1000,
  remedial: 15 * 60 * 1000,
};

/** Ngưỡng đạt, tính theo phần trăm. Xem spec mục 4. */
export const PASS_MARK: Record<AssessmentType, number> = {
  review: 80,
  test: 70,
  remedial: 80,
};

/**
 * Chỉ bài kiểm tra bị khoá cứng thời gian — spec mục 4. Ôn tập và bổ túc vẫn
 * có `expires_at` (cột `not null`, và màn hình dùng nó để hiện thời gian gợi
 * ý) nhưng qua mốc đó vẫn trả lời được: ép đồng hồ lên ôn tập là thêm áp lực
 * mà spec không đòi.
 */
const HARD_LOCKED: ReadonlySet<AssessmentType> = new Set<AssessmentType>(["test"]);

/**
 * Nguồn THẬT DUY NHẤT cho "loại bài nào bị khoá cứng thời gian" (review cuối
 * nhánh, finding 2): trước bản vá này, `assessment/[id]/page.tsx` tự tính lại
 * `type === "test"` thay vì hỏi `HARD_LOCKED` ở đây — hai định nghĩa của
 * CÙNG một tập, sống ở hai tệp khác nhau. Thêm một loại bài khoá cứng mới ở
 * server (sửa dòng `HARD_LOCKED` phía trên) mà quên đổi UI thì đồng hồ tắt
 * câm lặng trên màn hình dù server đã khoá thật — không lỗi, không cảnh báo,
 * chỉ là hành vi sai lặng lẽ. Export HÀM, không export thẳng `HARD_LOCKED`,
 * để nơi gọi không sửa được tập này từ bên ngoài.
 */
export function isHardLocked(type: AssessmentType): boolean {
  return HARD_LOCKED.has(type);
}

/** Nội dung một câu như đã đóng băng trong `assessment_items.payload`. */
interface ItemPayload {
  prompt: string;
  options: string[];
}

/**
 * Ném ra khi người học đã có một bài đang dở. Mang theo id để tầng gọi "đưa về
 * bài đang dở" được (spec mục 7) thay vì chỉ hiện một thông báo lỗi.
 */
export class AssessmentInProgressError extends Error {
  constructor(readonly assessmentId: number) {
    super(`đang dở bài ${assessmentId}, phải xong bài đó trước`);
    this.name = "AssessmentInProgressError";
  }
}

export interface FinalResult {
  score: number;
  passed: boolean;
}

/**
 * Mở một bài mới và ĐÓNG BĂNG đề của nó xuống `assessment_items` (spec mục
 * 6.1): có đồng hồ nên bộ câu phải cố định từ lúc bắt đầu, không được sinh lại
 * mỗi lần tải trang — nếu không người học chỉ cần F5 tới khi gặp đề dễ.
 */
export async function startAssessment(
  supabase: SupabaseClient,
  userId: string,
  type: AssessmentType,
  scope: number[],
  parentId: number | null,
  now: Date,
): Promise<number> {
  // 1. Một người chỉ có MỘT bài `in_progress` tại một thời điểm — spec mục 7.
  //    Lần đọc này KHÔNG phải hàng rào thật, chỉ là lớp cho thông báo lỗi tử tế
  //    trong trường hợp thường gặp; hàng rào thật là chỉ số duy nhất một phần
  //    `assessments_one_in_progress` ở bước 2.
  const open = await openAssessmentId(supabase, userId);
  if (open !== null) throw new AssessmentInProgressError(open);

  // 2. `started_at` lấy từ chính `now` chứ không để `default now()` của cột:
  //    nó phải là cùng một mốc với `expires_at`, không thì hai giá trị lệch
  //    nhau đúng bằng độ trễ mạng và không cặp nào giải thích được cặp kia.
  const { data, error } = await supabase
    .from("assessments")
    .insert({
      user_id: userId,
      type,
      scope,
      status: "in_progress",
      started_at: now.toISOString(),
      expires_at: new Date(now.getTime() + DURATION_MS[type]).toISOString(),
      parent_id: parentId,
    })
    .select("id")
    .single();
  if (error) {
    // 23505 = unique_violation. Bước 1 đọc-rồi-chèn KHÔNG nguyên tử: hai yêu
    // cầu "bắt đầu" song song (bấm đúp, hai tab, một lần thử lại sau timeout)
    // đều thấy "chưa có bài nào dở" rồi đều chèn. Chỉ số duy nhất một phần
    // trong 0007 chặn dòng thứ hai ở tầng database; ở đây chỉ đổi lỗi thô đó
    // về ĐÚNG loại lỗi mà bước 1 đã ném, để tầng gọi chỉ phải xử lý một tình
    // huống chứ không phải hai lối vào của cùng một tình huống.
    //
    // Không tìm lại được dòng đang dở thì để lỗi gốc nổi lên — nói thật còn hơn
    // dựng ra một AssessmentInProgressError trỏ vào một id không có thật.
    if (error.code === "23505") {
      const raced = await openAssessmentId(supabase, userId);
      if (raced !== null) throw new AssessmentInProgressError(raced);
    }
    throw error;
  }
  const assessmentId = data.id as number;

  try {
    // 3. Sinh đề. Hạt giống băm từ `${userId}:${assessmentId}` — dùng chính id
    //    VỪA TẠO nên hai lần thử cùng phạm vi chắc chắn khác đề, đúng yêu cầu
    //    "làm lại thì đề mới" ở mục 5.2. Băm theo (userId, scope) thì lần làm
    //    lại sẽ ra y hệt đề đã trượt.
    const specs =
      type === "remedial"
        ? await remedialSpecs(supabase, parentId)
        : await freshSpecs(supabase, userId, type, scope, assessmentId);

    // 4. Chèn toàn bộ items MỘT lần.
    const { error: itemsErr } = await supabase.from("assessment_items").insert(
      specs.map((s) => ({
        assessment_id: assessmentId,
        position: s.position,
        item_type: s.itemType,
        ref_id: s.refId,
        payload: s.payload,
      })),
    );
    if (itemsErr) throw itemsErr;
  } catch (e) {
    // Dọn dòng `assessments` vừa chèn rồi mới ném tiếp. BẮT BUỘC, không phải
    // lịch sự: `buildAssessmentItems` CỐ Ý ném khi nguồn câu hỏi thiếu, và một
    // bài `in_progress` không có câu nào sẽ chặn vĩnh viễn mọi lần bắt đầu sau
    // đó (bước 1), trong khi `finalize` không chấm nổi 0 câu. Người học kẹt
    // cứng vì một lỗi lẽ ra chỉ là một lần thử hỏng.
    //
    // Lỗi của CHÍNH lượt dọn dẹp này PHẢI được đọc, không được nuốt (review
    // cuối nhánh, finding 1): nuốt nó là dựng lại đúng cái kẹt cứng đoạn này
    // tồn tại để ngăn — nếu delete thất bại (mất kết nối đúng lúc, RLS đổi
    // bất ngờ, v.v.), dòng rỗng vẫn còn nguyên trong database và bên gọi chỉ
    // thấy lỗi sinh đề gốc `e`, không hề biết dọn dẹp cũng đã hỏng. Trang
    // `assessment/[id]/page.tsx` vẫn có lối thoát thủ công cho trường hợp một
    // dòng rỗng sống sót (màn hình "bài này bị lỗi"), nhưng người vận hành
    // xứng đáng biết ngay tại đây thay vì phải tự suy luận từ một dòng kẹt
    // không rõ nguyên do.
    const { error: cleanupErr } = await supabase
      .from("assessments")
      .delete()
      .eq("id", assessmentId)
      .eq("user_id", userId);
    if (cleanupErr) {
      throw new Error(
        `sinh đề cho bài ${assessmentId} thất bại (${(e as Error).message}), và dọn dòng rỗng đó CŨNG thất bại (${cleanupErr.message}) — bài rỗng có thể vẫn còn trong database`,
      );
    }
    throw e;
  }

  return assessmentId;
}

/**
 * Chấm và lưu MỘT câu. Trả `{ ok: false }` khi lượt trả lời không được chấp
 * nhận (bài không tồn tại/không phải của mình, bài đã nộp, hoặc bài kiểm tra
 * đã hết giờ) — và khi đó KHÔNG ghi gì cả.
 */
export async function answerItem(
  supabase: SupabaseClient,
  userId: string,
  assessmentId: number,
  position: number,
  answer: string,
  now: Date,
): Promise<{ ok: boolean; correct?: boolean }> {
  // Hai lượt đọc độc lập nhau → chạy song song, đỡ một vòng mạng cho mỗi câu
  // trả lời (một bài kiểm tra là 60 câu). `.eq("user_id", userId)` là tường
  // minh chứ không thừa: RLS lọc đúng khi client là client của người dùng,
  // nhưng cả module này nhận client làm tham số — cùng lý do đã ghi ở
  // run-submit.ts. Bảng `assessment_items` được RLS lọc qua bài cha, nên một
  // bài của người khác trả về null ngay từ đây.
  const [assessRes, itemRes] = await Promise.all([
    supabase
      .from("assessments")
      .select("type, status, expires_at")
      .eq("id", assessmentId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("assessment_items")
      .select("id, item_type, ref_id, payload")
      .eq("assessment_id", assessmentId)
      .eq("position", position)
      .maybeSingle(),
  ]);
  if (assessRes.error) throw assessRes.error;
  if (itemRes.error) throw itemRes.error;

  const assessment = assessRes.data;
  if (assessment === null) return { ok: false };
  if (assessment.status !== "in_progress") return { ok: false };

  const type = assessment.type as AssessmentType;
  const expiresAt = Date.parse(assessment.expires_at as string);
  if (isHardLocked(type) && now.getTime() >= expiresAt) return { ok: false };

  const row = itemRes.data;
  if (row === null) return { ok: false };

  const itemId = row.id as number;
  const refId = row.ref_id as number;
  const payload = row.payload as ItemPayload;

  const { item, correctOption, grammarLessonId } =
    row.item_type === "vocab"
      ? await vocabSecret(supabase, refId, payload)
      : await grammarSecret(supabase, refId, payload);

  const result = gradeItem(item, answer, { correctOption });

  // Ghi có điều kiện `user_answer is null` — CAS thật ở tầng database, không
  // phải đọc-rồi-ghi ở tầng ứng dụng. Chỉ lượt ghi ĐẦU TIÊN của một câu mới
  // được cộng mastery; một cú bấm đúp hay một lần bấm lại đúng câu đó vẫn cập
  // nhật đáp án nhưng không cộng thêm lần nào. Không có chốt này, hai request
  // đồng thời đều đọc `word_mastery` rồi đều upsert giá trị TUYỆT ĐỐI, và một
  // câu trả lời bị đếm hai lần (hoặc mất một lần) — đúng loại lỗi mà CAS ở
  // run-submit.ts bước 4b đã dựng lên để chặn.
  const { data: claimed, error: claimErr } = await supabase
    .from("assessment_items")
    .update({ user_answer: answer, is_correct: result.correct })
    .eq("id", itemId)
    .is("user_answer", null)
    .select("id");
  if (claimErr) throw claimErr;

  if ((claimed?.length ?? 0) === 0) {
    // Câu này đã trả lời trước đó: cho đổi đáp án (người học được sửa trước
    // khi nộp) nhưng mastery giữ nguyên lần ghi đầu — nếu không, bấm đi bấm
    // lại một câu là bơm được `correct_count` lên tuỳ ý.
    const { error } = await supabase
      .from("assessment_items")
      .update({ user_answer: answer, is_correct: result.correct })
      .eq("id", itemId);
    if (error) throw error;
    return { ok: true, correct: result.correct };
  }

  await applyMastery(supabase, userId, item, result.correct, grammarLessonId);
  return { ok: true, correct: result.correct };
}

/** Người học bấm nộp. */
export async function submitAssessment(
  supabase: SupabaseClient,
  userId: string,
  assessmentId: number,
  now: Date,
): Promise<FinalResult> {
  return finalize(supabase, userId, assessmentId, now);
}

/**
 * `nextStep` phát hiện một bài `in_progress` đã quá `expires_at` và đóng nó
 * lại. Khác `submitAssessment` Ở CHỖ TIỀN ĐIỀU KIỆN: hàm này chỉ hợp lệ trên
 * một bài THẬT SỰ đã hết hạn — `submitAssessment` không có ràng buộc đó, vì
 * nộp sớm (trước hạn) luôn hợp lệ. Luật CHẤM thì giống hệt nhau nên cả hai
 * cùng gọi một `finalize` — không có bản chấm thứ hai để trôi lệch.
 *
 * Tiền điều kiện "đã hết hạn" được KIỂM TRA THẬT ở đây, không chỉ nằm trong
 * tên hàm (review cuối nhánh, finding 5): trước bản vá này, hàm chỉ gọi
 * thẳng `finalize` mà không đọc `expires_at`, nên `closeExpiredAction`
 * (`dashboard/actions.ts`) — một Server Action nhận `assessmentId` làm THAM
 * SỐ từ một form phía CLIENT kiểm soát — có thể bị gọi thủ công (DevTools,
 * request thủ công) trên MỘT bài đang làm bất kỳ của chính người gọi, đóng
 * nó sớm dù chưa hết giờ. Không phải lỗ hổng lộ dữ liệu người khác (RLS +
 * `.eq("user_id", ...)` trong `finalize` vẫn giới hạn trong đúng dòng của
 * người gọi), nhưng là một đường "nộp sớm giả danh hết hạn" không nên tồn
 * tại — tên hàm và comment ở nơi gọi đều khẳng định một tiền điều kiện mà
 * code không hề ép buộc. Kiểm tra NGAY TẠI ĐÂY, nơi MỌI đường gọi
 * `closeExpired` (kể cả nhánh "close-expired" của `startAssessmentAction`,
 * vốn đã tự đảm bảo điều này qua `nextStep`) đều đi qua, thay vì rải điều
 * kiện ở từng nơi gọi và tin rằng nơi gọi luôn nhớ kiểm tra trước.
 */
export async function closeExpired(
  supabase: SupabaseClient,
  userId: string,
  assessmentId: number,
  now: Date,
): Promise<FinalResult> {
  const { data: assessment, error } = await supabase
    .from("assessments")
    .select("status, expires_at")
    .eq("id", assessmentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (assessment === null) {
    throw new Error(`không tìm thấy bài ${assessmentId} của người học này`);
  }
  // Bài đã đóng rồi (nộp thật hoặc một lượt closeExpired trước đó) thì để lọt
  // xuống `finalize` như bình thường — nó tự đọc lại kết quả đã lưu, idempotent,
  // không phải nhánh cần chặn. Chỉ chặn đúng trường hợp CÒN `in_progress` mà
  // CHƯA hết hạn.
  if (
    assessment.status === "in_progress" &&
    Date.parse(assessment.expires_at as string) > now.getTime()
  ) {
    throw new Error(`bài ${assessmentId} chưa hết hạn — không thể đóng sớm bằng đường này`);
  }
  return finalize(supabase, userId, assessmentId, now);
}

/* ─────────────────────────── phần nội bộ ─────────────────────────── */

async function finalize(
  supabase: SupabaseClient,
  userId: string,
  assessmentId: number,
  now: Date,
): Promise<FinalResult> {
  const { data: assessment, error } = await supabase
    .from("assessments")
    .select("type, status, score, passed")
    .eq("id", assessmentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (assessment === null) {
    throw new Error(`không tìm thấy bài ${assessmentId} của người học này`);
  }

  // Bấm nộp hai lần: không làm gì, trả lại kết quả đã có — spec mục 7.
  //
  // ĐIỀU KIỆN THÊM `assessment.score !== null` (không chỉ `status ===
  // "submitted"`) là bản vá cho một trạng thái TREO mà bản tách RPC/UPDATE ở
  // dưới tạo ra: `finalize_assessment_items` đóng bài (status → 'submitted')
  // và UPDATE ghi score/passed/submitted_at giờ là HAI lượt round-trip riêng,
  // không còn một UPDATE nguyên tử như trước. Nếu request đứt giữa hai lượt
  // đó (function timeout, mất kết nối, deploy rơi đúng lúc) — RPC đã commit
  // (bài đóng, đã backfill), nhưng UPDATE điểm chưa chạy — dòng đó mắc kẹt ở
  // `status = 'submitted'`, `score/passed/submitted_at = NULL` VĨNH VIỄN nếu
  // early-return chỉ xét `status`: mọi lần gọi lại sau đó đều thấy "đã nộp"
  // rồi trả `storedResult({score: null, ...})` → `{score: 0, passed: false}`
  // mà KHÔNG BAO GIỜ sửa lại dòng — nextStep đọc `passed !== true` thành
  // trượt, đẩy người học vào một bài bổ túc họ không đáng phải làm.
  //
  // Thêm `score !== null` biến điều kiện "coi là đã xong" thành "đã xong VÀ
  // đã thật sự có kết quả lưu lại" — một dòng bị treo (status='submitted',
  // score=null) KHÔNG thoả điều kiện này, nên rơi tiếp xuống dưới và CHẠY
  // LẠI cả khối RPC + UPDATE. RPC an toàn khi gọi lại: CAS `status =
  // 'in_progress'` khớp 0 dòng (đã đóng từ lần trước, không làm gì thêm),
  // backfill cũng khớp 0 dòng (đã backfill xong), đếm lại cho ra ĐÚNG cùng
  // {total, correct} — idempotent. UPDATE điểm bên dưới dùng CAS `score is
  // null`, khớp đúng dòng treo này và ghi điểm thật vào — bài TỰ SỬA ở lần
  // gọi `finalize` kế tiếp (nộp lại, hoặc `nextStep` đóng bài quá hạn), thay
  // vì cần một thao tác dọn dẹp thủ công riêng.
  //
  // Một lần nộp THẬT SỰ xong luôn để lại `score` khác NULL (khối UPDATE dưới
  // đây luôn ghi một số, kể cả 0), nên nộp hai lần thật (không phải một lần
  // bị đứt) vẫn tắt sớm đúng như trước — không có gì bị nới lỏng.
  if (assessment.status === "submitted" && assessment.score !== null) {
    return storedResult(assessment);
  }

  // ĐIỀN `is_correct = false` CHO MỌI CÂU CHƯA LÀM, ĐẾM, VÀ ĐÓNG BÀI (chuyển
  // status khỏi 'in_progress') — CẢ BA trong MỘT lệnh gọi RPC `security
  // definer` `finalize_assessment_items` (0008_assessment_items_grants.sql):
  //
  //   1. Không còn đọc/ghi is_correct thẳng bằng client thường được nữa: cột
  //      đó đã bị thu hồi SELECT khỏi `authenticated` (đóng kênh dò đáp án
  //      qua PostgREST — xem comment đầu file migration), và một WHERE
  //      is_correct IS NULL hay SELECT is_correct đều cần quyền đọc cột đó.
  //   2. ĐÓNG BÀI ngay trong hàm SQL (không phải ở lượt UPDATE riêng bên
  //      dưới như trước) là bản vá cho một lỗ hổng thứ hai: nếu hàm chỉ
  //      backfill+đếm mà không đóng bài, nó trở thành một oracle chấm điểm —
  //      gọi lại sau MỖI câu trả lời (answerItem vẫn nhận câu trả lời vì bài
  //      còn 'in_progress') sẽ lộ dần correct/total, dò được cả bài kiểm tra
  //      60 câu mà không cần biết đáp án thật. Hàm CAS ngay trong WHERE
  //      (`status = 'in_progress'`) khi đóng, nên lần gọi ĐẦU TIÊN (hợp lệ
  //      hay không) đã là lần CUỐI answerItem còn nhận câu trả lời tiếp theo
  //      — gọi hàm này giữa bài chỉ tương đương bấm "Nộp bài" sớm.
  //
  // Luật "câu chưa làm tính sai" (spec mục 6.2) phải đúng TRONG DỮ LIỆU, không
  // chỉ đúng trong phép chia ở dưới. `answerItem` chỉ ghi `is_correct` cho câu
  // được trả lời, nên câu bỏ trống nằm lại ở NULL trước khi hàm này chạy — và
  // bài bổ túc được dựng từ `is_correct = false` của lần thử cha (mục 5.3).
  // Nếu để NULL:
  //
  //   trả lời đúng 19/25, bỏ trống 6  →  76% < 80%, trượt
  //   → bổ túc lấy các câu `is_correct = false`  →  KHÔNG có dòng nào
  //   → bài bổ túc 0 câu, chấm 0/0, không bao giờ đạt
  //   → nextStep thấy bổ túc chưa đạt → bắt làm bổ túc lại → mãi mãi.
  //
  // Không phải trường hợp hiếm: hết giờ bài kiểm tra 60 phút thì phần lớn câu
  // còn lại chính là câu bỏ trống. Điền ở đây làm tan cả lớp lỗi đó, thay vì
  // vá riêng chỗ dựng bài bổ túc.
  //
  // `user_answer` CỐ Ý giữ nguyên NULL (hàm SQL không đụng tới cột này): nó là
  // thứ duy nhất còn phân biệt "bỏ trống" với "trả lời sai" khi xem lại bài.
  //
  // Điểm ĐẾM TỪ `is_correct` của chính các câu, không từ một bộ đếm riêng —
  // một nguồn sự thật, không có gì để trôi lệch (spec mục 6.3). Hàm SQL trả
  // TỔNG/ĐÚNG đã đếm sẵn, không trả từng dòng `is_correct` — giữ đúng tinh
  // thần "đáp án từng câu không rời khỏi server" ngay cả ở kênh tổng hợp này.
  //
  // Cách tính SCORE (phần trăm) và so với PASS_MARK[type] VẪN ở TypeScript —
  // hàm SQL không biết ngưỡng đạt theo từng loại bài, chỉ lo lưu trữ + tổng
  // hợp + đóng trạng thái. Đây là "một nguồn chấm điểm duy nhất" mà cả
  // `submitAssessment` lẫn `closeExpired` cùng đi qua hàm `finalize` này —
  // không có bản chấm thứ hai nào khác xuất hiện.
  const { data, error: aggErr } = await supabase
    .rpc("finalize_assessment_items", { p_assessment_id: assessmentId })
    .single();
  if (aggErr) throw aggErr;
  const agg = data as { total: number; correct: number };

  const total = agg.total;
  if (total === 0) {
    // Không im lặng chấm 0: một bài 0 câu không bao giờ đạt được, nên chấm nó
    // là dựng lại đúng cái vòng lặp vô tận ở trên. `startAssessment` đã chặn
    // không cho bài rỗng ra đời; tới đây được thì có gì đó hỏng thật.
    //
    // Ném ở ĐÂY xảy ra SAU KHI RPC đã đóng bài (status → 'submitted') —
    // cùng hình dạng treo đã mô tả ở điều kiện early-return phía trên,
    // nhưng không cách nào "sửa" được (không có gì để tính điểm). Vì
    // `score` không bao giờ được ghi ở nhánh này, điều kiện `score !==
    // null` phía trên KHÔNG coi dòng này là "đã xong" — mọi lần gọi lại
    // đều rơi xuống đây và ném lại đúng lỗi này, không bao giờ tự nhận
    // vào một kết quả sai. Kêu to mãi mãi còn hơn một lần im lặng sai.
    throw new Error(`bài ${assessmentId} không có câu nào — không chấm được`);
  }
  const correct = agg.correct;
  const score = Math.round((correct / total) * 100);
  const type = assessment.type as AssessmentType;
  const passed = score >= PASS_MARK[type];

  // Ghi score/passed/submitted_at bằng một UPDATE RIÊNG, không còn gộp
  // `status: "submitted"` vào đây nữa — RPC ở trên đã tự đóng bài rồi. Chốt
  // "chưa ghi điểm" chuyển từ `.neq("status","submitted")` (cũ) sang
  // `.is("score", null)`: tại điểm này status LUÔN LÀ 'submitted' (RPC vừa
  // đóng, dù chính request này hay một request song song thắng cuộc CAS bên
  // trong hàm SQL), nên không còn dùng status để phân biệt "ai thắng cuộc
  // ghi điểm" được nữa — `score is null` giữ đúng vai trò đó: chỉ lượt ghi
  // ĐẦU TIÊN khớp, lượt thứ hai (bấm đúp, hai tab, hoặc một cuộc gọi RPC lặp
  // lại) khớp 0 dòng và đọc lại kết quả đã lưu, đúng tính chất "chỉ một
  // người thắng" mà CAS cũ đã đảm nhiệm.
  const { data: closed, error: closeErr } = await supabase
    .from("assessments")
    .update({ score, passed, submitted_at: now.toISOString() })
    .eq("id", assessmentId)
    .eq("user_id", userId)
    .is("score", null)
    .select("score, passed");
  if (closeErr) throw closeErr;

  if ((closed?.length ?? 0) === 0) {
    const { data: fresh, error: freshErr } = await supabase
      .from("assessments")
      .select("score, passed")
      .eq("id", assessmentId)
      .eq("user_id", userId)
      .single();
    if (freshErr) throw freshErr;
    return storedResult(fresh);
  }

  return { score, passed };
}

/** Kết quả đã ghi trong database. `?? ` chỉ để chiều kiểu — cột luôn có giá trị khi đã nộp. */
function storedResult(row: { score: unknown; passed: unknown }): FinalResult {
  return {
    score: (row.score as number | null) ?? 0,
    passed: (row.passed as boolean | null) ?? false,
  };
}

async function openAssessmentId(
  supabase: SupabaseClient,
  userId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("assessments")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .order("id")
    .limit(1);
  if (error) throw error;
  const row = data?.[0];
  return row ? (row.id as number) : null;
}

/** Đề bài ôn tập / kiểm tra: từ vựng và câu ngữ pháp của các buổi trong phạm vi. */
async function freshSpecs(
  supabase: SupabaseClient,
  userId: string,
  type: "review" | "test",
  scope: number[],
  assessmentId: number,
): Promise<AssessmentItemSpec[]> {
  const { data: lessonRows, error: lessonErr } = await supabase
    .from("lessons")
    .select("id, ordinal, grammar_lesson_id")
    .in("ordinal", scope);
  if (lessonErr) throw lessonErr;

  const lessons = lessonRows ?? [];
  if (lessons.length !== scope.length) {
    throw new Error(
      `phạm vi [${scope.join(",")}]: tìm thấy ${lessons.length}/${scope.length} buổi`,
    );
  }
  const lessonIds = lessons.map((l) => l.id as number);
  const grammarLessonIds = lessons.map((l) => l.grammar_lesson_id as number);

  const [lwRes, gqRes] = await Promise.all([
    supabase
      .from("lesson_words")
      .select(
        "lesson_id, position, vocab_words(id, word, pos, ipa, meaning_vi, definition_en, synonyms, example_en, example_vi)",
      )
      .in("lesson_id", lessonIds)
      // Thứ tự PHẢI tường minh: `seededShuffle` xáo trộn mảng ĐẦU VÀO, nên thứ
      // tự Postgres trả về (không đảm bảo) sẽ lọt vào cả kết quả xáo trộn.
      .order("lesson_id")
      .order("position"),
    supabase
      .from("grammar_questions")
      .select("id, stem, options")
      .in("lesson_id", grammarLessonIds)
      .order("id"),
  ]);
  if (lwRes.error) throw lwRes.error;
  if (gqRes.error) throw gqRes.error;

  // postgrest-js suy luận MỌI quan hệ nhúng là mảng khi không có generic
  // Database, dù khoá ngoại `lesson_words.word_id → vocab_words(id)` là 1-1 —
  // cùng vấn đề và cùng cách xử lý như lib/lesson/session.ts.
  const lessonWordRows = (lwRes.data ?? []) as unknown as { vocab_words: unknown }[];
  const words: VocabLite[] = lessonWordRows.map((r) => toVocabLite(r.vocab_words));

  const grammar: GrammarLite[] = (gqRes.data ?? []).map((q) => ({
    id: q.id as number,
    stem: q.stem as string,
    options: q.options as string[],
  }));

  return buildAssessmentItems(
    type,
    words,
    grammar,
    hashString(`${userId}:${assessmentId}`),
  );
}

/**
 * Đề bài bổ túc: đúng những câu đã sai của lần thử cha, không gì khác (mục
 * 5.3). Lọc `is_correct = false` qua RPC `security definer`
 * `wrong_items_for_assessment` (0008_assessment_items_grants.sql) thay vì
 * `.eq("is_correct", false)` thẳng trên client thường: cột đó đã bị thu hồi
 * SELECT khỏi `authenticated`, và một WHERE trên cột cần quyền đọc chính cột
 * đó. Kết quả trả về KHÔNG có `is_correct` — chỉ đủ để dựng lại đề, không lộ
 * thêm gì so với trước. Hàm chỉ trả lời khi bài cha KHÔNG còn `in_progress`
 * (guard trong 0008) — gọi giữa chừng một bài đang làm bị từ chối, đóng nốt
 * kênh oracle mà `finalize_assessment_items` đã đóng ở phía kia.
 */
async function remedialSpecs(
  supabase: SupabaseClient,
  parentId: number | null,
): Promise<AssessmentItemSpec[]> {
  if (parentId === null) {
    throw new Error("bài bổ túc phải có parentId trỏ tới lần thử đã trượt");
  }

  // `.order("position")`: hàm SQL đã `order by` nội bộ, nhưng đó không phải
  // hợp đồng — PostgREST bọc lời gọi RPC trong một `SELECT … FROM func(…)`,
  // và thứ tự của SELECT bọc ngoài đó không có gì đảm bảo giữ nguyên thứ tự
  // hàng mà truy vấn bên trong hàm trả về. `buildRemedialItems` đánh lại chỉ
  // số THEO THỨ TỰ MẢNG, nên một lần đảo thứ tự âm thầm sẽ đổi câu hỏi đã
  // đóng băng nào rơi vào vị trí nào — tường minh hoá ở đây, giống hệt cách
  // freshSpecs đã làm với `.order("lesson_id").order("position")`.
  const { data, error } = await supabase
    .rpc("wrong_items_for_assessment", { p_assessment_id: parentId })
    .order("position");
  if (error) throw error;

  // Không có generic Database trên client nên `.rpc()` không suy luận được
  // hình dạng hàng trả về — ép qua `unknown` rồi tới kiểu hàng mong đợi, cùng
  // cách freshSpecs xử lý kết quả `.select()` nhúng quan hệ ở trên.
  const rows = (data ?? []) as unknown as {
    position: number;
    item_type: string;
    ref_id: number;
    payload: unknown;
  }[];
  const wrong: AssessmentItemSpec[] = rows.map((r) => ({
    position: r.position,
    itemType: r.item_type as "vocab" | "grammar",
    refId: r.ref_id,
    payload: r.payload as ItemPayload,
  }));

  if (wrong.length === 0) {
    // Sau khi `finalize` điền `is_correct = false` cho câu bỏ trống, một lần
    // thử ĐÃ TRƯỢT luôn có ít nhất một câu sai (trượt ⟺ không đúng hết). Rỗng
    // ở đây nghĩa là bài cha chưa được chấm — dừng lại còn hơn tạo ra một bài
    // bổ túc 0 câu mà người học không bao giờ thoát ra được.
    throw new Error(`lần thử ${parentId} không có câu sai nào — không dựng được bài bổ túc`);
  }
  return buildRemedialItems(wrong);
}

interface Graded {
  item: BuiltItem;
  correctOption: string;
  /** Khoá của `grammar_mastery`; 0 với câu từ vựng (nhánh đó không dùng tới). */
  grammarLessonId: number;
}

/**
 * Câu từ vựng của bài đánh giá là câu CHỌN NGHĨA — `buildAssessmentItems` dựng
 * 4 phương án từ `meaning_vi`, nên đáp án đúng CHÍNH LÀ `meaning_vi`, đọc
 * thẳng như `secretFor` đã làm với item `meaning` ở 1b.
 *
 * KHÔNG dùng RPC `answer_for_word` ở đây: nó trả `blank_answer` — từ bị khoét
 * khỏi câu ví dụ, phục vụ câu ĐIỀN TỪ — và chuỗi đó không nằm trong 4 phương
 * án của câu chọn nghĩa. Chấm bằng nó thì mọi câu từ vựng đều sai, tức 80% số
 * câu của mọi đề, và không ai qua nổi ngưỡng 70/80%.
 *
 * Không có gì rò rỉ: `meaning_vi` được cấp cho `authenticated`
 * (0004_rls.sql:41-44) và bản thân đáp án đúng đã nằm sẵn trong 4 phương án
 * gửi xuống trình duyệt. Hai cột thật sự bí mật — `vocab_words.blank_answer`
 * và `grammar_questions.answer` — vẫn chỉ đọc được qua RPC.
 */
async function vocabSecret(
  supabase: SupabaseClient,
  refId: number,
  payload: ItemPayload,
): Promise<Graded> {
  const { data, error } = await supabase
    .from("vocab_words")
    .select("word, meaning_vi")
    .eq("id", refId)
    .single();
  if (error) throw error;

  return {
    item: {
      kind: "meaning",
      wordId: refId,
      word: data.word as string,
      options: payload.options,
    },
    correctOption: data.meaning_vi as string,
    grammarLessonId: 0,
  };
}

/**
 * Đáp án câu ngữ pháp CHỈ lấy được qua RPC `security definer`
 * `answer_for_question`: cột `grammar_questions.answer` đã bị thu hồi khỏi
 * `authenticated` (0004_rls.sql:46-48), và service role không được lên Vercel.
 *
 * `lesson_id` đọc kèm vì `grammar_mastery` khoá theo `(user_id,
 * grammar_lesson_id)` chứ không theo id câu hỏi — hai lượt đọc độc lập nên
 * chạy song song.
 */
async function grammarSecret(
  supabase: SupabaseClient,
  refId: number,
  payload: ItemPayload,
): Promise<Graded> {
  const [ansRes, qRes] = await Promise.all([
    supabase.rpc("answer_for_question", { p_question_id: refId }),
    supabase.from("grammar_questions").select("lesson_id").eq("id", refId).single(),
  ]);
  if (ansRes.error) throw ansRes.error;
  if (qRes.error) throw qRes.error;

  return {
    item: {
      kind: "grammar",
      questionId: refId,
      stem: payload.prompt,
      options: payload.options,
    },
    correctOption: ansRes.data as string,
    grammarLessonId: qRes.data.lesson_id as number,
  };
}
