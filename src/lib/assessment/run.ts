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
 * có `expires_at` (cột `not null`) — `nextStep` dùng nó để tự đóng một bài bỏ
 * ngang (mục 6.2) — nhưng KHÔNG có đồng hồ đếm ngược nào hiện trên màn hình
 * cho hai loại này (review cuối nhánh, finding 3, vòng 2: sửa lại đúng bản đã
 * triển khai — `<Countdown>` chỉ render khi `hardLocked`, xem
 * `assessment-runner.tsx`), và qua mốc `expires_at` vẫn trả lời được: ép
 * đồng hồ (hay UI đếm ngược) lên ôn tập là thêm áp lực mà spec không đòi.
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
 * Xoá một bài `in_progress` KHÔNG có câu nào — trạng thái kẹt cứng duy nhất
 * của cả lát này không có lối thoát nào khác (review cuối nhánh, finding 1):
 * `startAssessment` ở trên chèn dòng `assessments` rồi mới chèn
 * `assessment_items`, tự dọn dòng đầu nếu chèn dòng sau lỗi — nhưng nếu tiến
 * trình chết GIỮA hai lượt ghi đó (function timeout, instance bị thu hồi),
 * cleanup không bao giờ chạy tới. Dòng rỗng sống sót đó chặn vĩnh viễn: màn
 * hình làm bài trắng trơn (`!current` ở `assessment-runner.tsx`), `finalize`
 * ném vì 0 câu không chấm được, và `startAssessment` từ chối tạo bài mới vì
 * đã có một bài `in_progress`. Không có gì để chấm hay đóng ở đây — xoá thẳng
 * dòng rồi để người học bắt đầu lại là lối thoát duy nhất.
 *
 * ĐÂY LÀ HÀNG RÀO THẬT, KHÔNG PHẢI `assessment/[id]/page.tsx` (review cuối
 * nhánh, VÒNG 2, finding 1): bản trước chỉ scope xoá theo `id` + `user_id`,
 * dựa vào việc trang chỉ HIỆN nút xoá khi `status === "in_progress" &&
 * items.length === 0` — nhưng đó là một NHÁNH RENDER, không phải một hàng
 * rào. `deleteEmptyAssessmentAction` (Server Action bọc hàm này) là một
 * endpoint công khai: `assessmentId` tới từ chính request, không từ trang, và
 * id của bài lỗi đã nằm sẵn trong HTML của màn hình lỗi ngay khi ai đó tải
 * nó. Thiếu hàng rào ở ĐÂY thì gọi lại action với id của MỘT BÀI KHÁC — ví dụ
 * một bài kiểm tra 60 phút đang làm dở, đang trượt ở phút 45 — sẽ xoá SẠCH nó
 * (on delete cascade qua `assessment_id` xoá luôn 60 câu đã đóng băng cùng
 * đáp án), giải phóng chỉ số `assessments_one_in_progress`, và người học có
 * ngay một bài kiểm tra MỚI với đề khác ở `nextStep` — lặp lại vô hạn không
 * tốn gì. Nhắm vào một bài ĐÃ NỘP VÀ TRƯỢT thì xoá cả bằng chứng trượt lẫn
 * bài bổ túc con của nó (cascade qua `parent_id`) — bỏ qua hẳn vòng bổ túc,
 * trong khi `word_mastery` vẫn giữ nguyên các lượt trả lời sai đã đếm. Đây
 * ĐÚNG lỗi finding 5 (một hàm công bố một tiền điều kiện mà code không ép
 * buộc), chỉ khác finding 5 ở chỗ hậu quả không phục hồi được — `finalize`
 * idempotent, còn `delete` thì không.
 *
 * Hai lớp chặn, cả hai đều BẮT BUỘC — thiếu một lớp là còn hở:
 *   1. Đếm `assessment_items` TRƯỚC — chỉ đúng bài rỗng THẬT mới được đi
 *      tiếp. `.eq("assessment_id", ...)` qua RLS: nếu `assessmentId` là bài
 *      của người khác, đếm ra 0 (RLS lọc, không phải "bài này rỗng thật") —
 *      vô hại, vì lượt xoá bên dưới còn lọc `user_id` một lần nữa.
 *   2. `.eq("status", "in_progress")` trong chính câu DELETE — không dựa vào
 *      lượt đếm ở bước 1 làm hàng rào DUY NHẤT (đua giữa đếm và xoá, dù không
 *      thực tế xảy ra ở luồng hiện tại, vẫn không có lý do để hở thêm một
 *      đường).
 * Và KHÔNG coi 0 dòng bị xoá là thành công thầm lặng: đếm dòng thật sự bị xoá
 * qua `.select("id")`, không đủ đúng MỘT dòng thì NÉM — im lặng redirect trên
 * một lượt xoá 0 dòng là chính kiểu lỗi vừa mô tả ở trên, chỉ đổi hình dạng.
 */
export async function deleteEmptyAssessment(
  supabase: SupabaseClient,
  userId: string,
  assessmentId: number,
): Promise<void> {
  const { count, error: countErr } = await supabase
    .from("assessment_items")
    .select("id", { count: "exact", head: true })
    .eq("assessment_id", assessmentId);
  if (countErr) throw countErr;
  if ((count ?? 0) > 0) {
    throw new Error(`bài ${assessmentId} còn câu hỏi — không phải bài lỗi, không xoá`);
  }

  const { data: deleted, error } = await supabase
    .from("assessments")
    .delete()
    .eq("id", assessmentId)
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .select("id");
  if (error) throw error;

  if ((deleted?.length ?? 0) !== 1) {
    throw new Error(
      `không xoá được bài ${assessmentId} — không khớp điều kiện bài lỗi rỗng (không tồn tại, không phải của người này, đã đóng, hoặc có câu hỏi)`,
    );
  }
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

/**
 * Chấm và đóng MỘT bài — nguồn chấm duy nhất mà cả `submitAssessment` lẫn
 * `closeExpired` cùng đi qua (không có bản chấm thứ hai ở đâu khác).
 *
 * TOÀN BỘ việc chấm + đóng bài xảy ra trong ĐÚNG MỘT lượt gọi RPC tới hàm
 * `security definer` `finalize_assessment_items` (0009_finalize_atomic.sql):
 * điền `is_correct = false` cho câu bỏ trống, đếm tổng/đúng, tính
 * score/passed, VÀ đổi `status` → `'submitted'` — tất cả trong ĐÚNG MỘT câu
 * UPDATE bên trong hàm SQL đó.
 *
 * Trước bản vá này, việc đóng bài và việc ghi điểm là HAI vòng round-trip
 * tách rời: RPC đóng bài (`status` → `'submitted'`) rồi một UPDATE riêng ghi
 * `score`/`passed`/`submitted_at`. Nếu request đứt GIỮA hai lượt đó — function
 * timeout, mất kết nối, một lần deploy rơi đúng lúc — dòng đó mắc kẹt ở
 * `status = 'submitted'`, `score = NULL` VĨNH VIỄN: `nextStep` đọc
 * `passed !== true` thành trượt và đẩy người học vào một bài bổ túc họ không
 * hề trượt. Gộp về ĐÚNG MỘT hàm SQL xoá hẳn cửa sổ đó — không còn hai lượt
 * ghi tách đôi để rách ở giữa, nên không còn trạng thái treo nào để sinh ra.
 *
 * `type` vẫn phải đọc RIÊNG trước khi gọi RPC: `PASS_MARK` theo từng loại bài
 * (review/test/remedial) chỉ định nghĩa ở TypeScript — một nơi duy nhất. Hàm
 * SQL không biết ngưỡng của từng loại bài, nó chỉ so sánh `score` đã tính với
 * ngưỡng được truyền vào qua `p_pass_mark`.
 *
 * Bài 0 câu: hàm SQL ném lỗi và KHÔNG đóng bài — dòng nằm lại `'in_progress'`
 * cho một lần gọi sau còn cứu được. Khác bản cũ, vốn đóng bài TRƯỚC rồi mới
 * ném ở tầng TypeScript, tạo ra một dòng `'submitted'` vĩnh viễn không bao
 * giờ chấm lại được (không còn gì để tính điểm).
 *
 * Hai `finalize` chạy đồng thời trên cùng một bài: bên thua CAS (bên trong
 * hàm SQL, tranh nhau đúng dòng `UPDATE ... WHERE status = 'in_progress'`)
 * đọc lại giá trị bên thắng đã ghi và trả về, KHÔNG ném lỗi — cả hai lượt gọi
 * `finalize` này đều nhận về cùng một `FinalResult`.
 */
async function finalize(
  supabase: SupabaseClient,
  userId: string,
  assessmentId: number,
  now: Date,
): Promise<FinalResult> {
  // Chỉ cần đọc `type` — để tra `PASS_MARK[type]` truyền vào RPC. Không còn
  // đọc `status/score/passed` ở đây: điều kiện "đã nộp thật sự thì không ghi
  // gì nữa" giờ nằm hẳn TRONG hàm SQL (bước 2 của 0009_finalize_atomic.sql),
  // vì đó là nơi duy nhất còn thấy được trạng thái KHÔNG bị đọc-rồi-ghi tách
  // rời khỏi hành động ghi thật.
  const { data: assessment, error } = await supabase
    .from("assessments")
    .select("type")
    .eq("id", assessmentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (assessment === null) {
    throw new Error(`không tìm thấy bài ${assessmentId} của người học này`);
  }
  const type = assessment.type as AssessmentType;

  const { data, error: rpcErr } = await supabase
    .rpc("finalize_assessment_items", {
      p_assessment_id: assessmentId,
      p_pass_mark: PASS_MARK[type],
      p_now: now.toISOString(),
    })
    .single();
  if (rpcErr) throw rpcErr;

  const result = data as { total: number; correct: number; score: number; passed: boolean };
  return { score: result.score, passed: result.passed };
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
