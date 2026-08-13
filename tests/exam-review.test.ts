import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { buildVocabExam } from "@/lib/exam/build";
import { createVocabExam, recordAnswer, submitExam, timHoacDungBaiThi } from "@/lib/exam/run";
import { napPhamVi } from "@/lib/exam/load-scope";
import { lessonsOf } from "@/lib/curriculum/groups";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const hasEnv = Boolean(URL && SERVICE && ANON);

describe.skipIf(!hasEnv)("bài ôn tập nhóm (lát 2c)", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "x", {
    auth: { persistSession: false },
  });
  // Mỗi test tự tạo NGƯỜI DÙNG RIÊNG (không dùng chung một alice cho cả bộ) —
  // chỉ số một-phần `assessments_one_in_progress` chỉ cho MỘT bài in_progress
  // mỗi người, và các test dưới đây gọi `createVocabExam`/`timHoacDungBaiThi`
  // trực tiếp (không qua `boBaiDangLam`/`submitExam` dọn dẹp giữa chừng) — dùng
  // chung một người sẽ đâm 23505 ở test thứ hai.
  const nguoiDungDaTao: string[] = [];

  async function taoNguoiDung(nhan: string) {
    const email = `exam-review-${nhan}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password: "test-pass-1234", email_confirm: true,
    });
    if (error) throw error;
    const c = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password: "test-pass-1234" });
    nguoiDungDaTao.push(data.user.id);
    return { client: c, id: data.user.id };
  }

  afterAll(async () => {
    for (const id of nguoiDungDaTao) {
      await admin.from("assessments").delete().eq("user_id", id);
      await admin.from("word_mastery").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("bài ôn tập ghi scope là hai ordinal buổi, đúng thứ tự lessonsOf", async () => {
    const { client: alice, id: aliceId } = await taoNguoiDung("scope");
    const { words, blankAnswers } = await napPhamVi(admin, lessonsOf(1));
    const id = await createVocabExam(
      alice, aliceId, "review", [...lessonsOf(1)], words, blankAnswers, 1,
    );
    const { data } = await admin
      .from("assessments").select("type, scope").eq("id", id).single();
    expect(data?.type).toBe("review");
    // progress.ts so khớp bằng sameScope; sai thứ tự thì ô Ôn tập vĩnh viễn
    // hiện "chưa làm" mà không có lỗi nào bật ra.
    expect(data?.scope).toEqual([1, 2]);
  });

  it("bài ôn tập có đúng 60 câu, mỗi từ một câu", async () => {
    const { client: alice, id: aliceId } = await taoNguoiDung("count");
    const { words, blankAnswers } = await napPhamVi(admin, lessonsOf(1));
    const id = await createVocabExam(
      alice, aliceId, "review", [...lessonsOf(1)], words, blankAnswers, 2,
    );
    const { data } = await admin
      .from("assessment_items").select("ref_id").eq("assessment_id", id);
    expect(data).toHaveLength(60);
    expect(new Set((data ?? []).map((r) => r.ref_id)).size).toBe(60);
  });

  // Test này PIN đúng con bug mô tả trong bàn giao Task 2: `batDauBoTuc` (chưa
  // sửa) đọc `const lessonId = (cha.scope as number[])[0]` với chú thích
  // khẳng định "bài lesson/remedial luôn ghi đúng một phần tử" — khẳng định đó
  // SAI cho bài `review` (ghi HAI phần tử, `lessonsOf(group)`). Nộp một bài ôn
  // tập trượt đúng MỘT từ thuộc buổi THỨ HAI của nhóm, rồi dựng bổ túc — bổ
  // túc phải chứa đúng từ đó.
  //
  // `batDauBoTuc` tự nó không gọi được trực tiếp từ Vitest (nó gọi
  // `createClient()` → `cookies()` của Next, ném "called outside a request
  // scope" ngoài một request thật — đã đo bằng thực nghiệm, xem
  // task-2-report.md). Test này vì vậy tái dựng ĐÚNG chuỗi thao tác mà
  // `batDauBoTuc` thực hiện (RPC `wrong_items_for_assessment` rồi nạp phạm vi
  // bài cha qua `napPhamVi`) — cùng cách `tests/exam-security.test.ts` đã kiểm
  // `createVocabExam`/`recordAnswer`/`submitExam` mà không gọi qua
  // `actions.ts`.
  it("bổ túc dựng từ bài ôn tập trượt phải chứa từ SAI thuộc buổi THỨ HAI của nhóm", async () => {
    // 60 lượt recordAnswer là 60 round-trip mạng thật tới Supabase — đo thực
    // nghiệm: chạy TUẦN TỰ vượt quá timeout mặc định 5000ms của Vitest. Bắn
    // ĐỒNG THỜI (Promise.all bên dưới) cộng timeout riêng rộng hơn (20s) cho
    // test này.
    const { client: erin, id: erinId } = await taoNguoiDung("remedial");

    const { words, blankAnswers } = await napPhamVi(admin, lessonsOf(1));
    // Tái dựng lại ĐÚNG bộ câu hỏi mà createVocabExam/timHoacDungBaiThi dựng
    // bên trong (cùng words/blanks/seed) — buildVocabExam là hàm THUẦN nên gọi
    // lại ở đây cho ra đúng prompt/options/answer theo từng vị trí, không cần
    // đọc trộm cột đáp án đã bị revoke khỏi `authenticated`.
    const cauHoi = buildVocabExam(words, blankAnswers, 11);
    const id = await timHoacDungBaiThi(
      erin, erinId, "review", [...lessonsOf(1)], words, blankAnswers, 11,
    );

    // `napPhamVi` gộp buổi RỒI MỚI tới từ trong buổi (xem docstring) — 30 phần
    // tử SAU của `words` chính là buổi thứ hai của nhóm. Chọn một câu hỏi ứng
    // với một từ trong khoảng đó để cố ý trả lời SAI, còn lại trả lời ĐÚNG hết
    // — bài trượt vì đúng một câu, không phải vì không đủ điểm.
    const idBuoiHai = new Set(words.slice(30, 60).map((w) => w.id));
    const viTriSai = cauHoi.findIndex((q) => idBuoiHai.has(q.wordId));
    expect(viTriSai).toBeGreaterThanOrEqual(0);
    const tuSaiId = cauHoi[viTriSai]!.wordId;

    await Promise.all(
      cauHoi.map((cau, pos) => {
        const dapAnGui = pos === viTriSai
          ? cau.options.find((o) => o !== cau.answer)!
          : cau.answer;
        return recordAnswer(erin, erinId, id, pos, dapAnGui);
      }),
    );
    await submitExam(erin, id);

    const { data: sai, error: saiErr } = await erin
      .rpc("wrong_items_for_assessment", { p_assessment_id: id });
    if (saiErr) throw saiErr;
    const idSai = (sai as { ref_id: number }[]).map((r) => r.ref_id);
    // Đúng một từ sai — sanity trước khi khẳng định điều thật sự muốn kiểm.
    expect(idSai).toEqual([tuSaiId]);

    const { data: chaRow, error: chaErr } = await admin
      .from("assessments").select("scope").eq("id", id).single();
    if (chaErr) throw chaErr;
    // `scope` của bài ôn tập vừa dựng phải còn nguyên hai phần tử ở đây —
    // đúng những gì test đầu tiên của tệp này đã khẳng định.
    expect(chaRow?.scope).toEqual([1, 2]);

    // Đúng những gì `batDauBoTuc` (sau bản sửa) làm: nạp TOÀN BỘ `cha.scope`
    // qua `napPhamVi`, không chỉ phần tử đầu — nguồn nhiễu bổ túc vẫn phải
    // phủ toàn bộ phạm vi bài cha (giờ là 60 từ, không phải 30).
    const { words: toanBo, blankAnswers: bangDayDu } = await napPhamVi(
      admin, chaRow!.scope as number[],
    );
    const tuSai = toanBo.filter((w) => idSai.includes(w.id));
    expect(tuSai.map((w) => w.id)).toContain(tuSaiId);

    const remedialId = await timHoacDungBaiThi(
      erin, erinId, "remedial", chaRow!.scope as number[], tuSai, bangDayDu, 12, id, toanBo,
    );
    const { data: items } = await admin
      .from("assessment_items").select("ref_id").eq("assessment_id", remedialId);
    expect((items ?? []).map((r) => r.ref_id)).toContain(tuSaiId);
  }, 20000);
});
