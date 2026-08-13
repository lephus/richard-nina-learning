import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildVocabExam, type ExamQuestion } from "@/lib/exam/build";
import {
  PASS_MARK, baiDangLamCua, boBaiDangLam, createVocabExam, recordAnswer, submitExam,
  timHoacDungBaiThi,
} from "@/lib/exam/run";
import type { VocabLite } from "@/lib/vocab/word";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const hasEnv = Boolean(URL && SERVICE && ANON);

describe.skipIf(!hasEnv)("an toàn bài thi", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "x", {
    auth: { persistSession: false },
  });
  let alice: SupabaseClient, bob: SupabaseClient;
  let aliceId = "", bobId = "", baiId = 0;
  // Tái dựng lại ĐÚNG bộ câu hỏi mà createVocabExam đã dựng bên trong (cùng
  // words/blanks/seed) — buildVocabExam là hàm THUẦN (Task 2) nên gọi lại ở
  // đây cho ra chính xác cùng prompt/options/answer theo từng position, không
  // cần đọc trộm cột đã bị revoke để biết đáp án thật của từng câu trong test.
  let cauHoi: ExamQuestion[] = [];
  // Hoist ra ngoài `beforeAll` (khác bản gốc chỉ khai báo cục bộ trong đó) để
  // test đua bên dưới (`timHoacDungBaiThi`) dùng lại được, khỏi đọc lại
  // `vocab_words` một lần nữa cho cùng 30 từ.
  let words: VocabLite[] = [];
  let blanks = new Map<number, string>();

  async function taoNguoiDung(nhan: string) {
    const email = `exam-${nhan}-${Date.now()}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password: "test-pass-1234", email_confirm: true,
    });
    if (error) throw error;
    const c = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password: "test-pass-1234" });
    return { client: c, id: data.user.id };
  }

  beforeAll(async () => {
    const a = await taoNguoiDung("alice");
    const b = await taoNguoiDung("bob");
    alice = a.client; aliceId = a.id; bob = b.client; bobId = b.id;

    // Dựng một bài thi thật cho Alice từ 30 từ đầu.
    const { data: rows } = await admin
      .from("vocab_words")
      .select("id, word, pos, ipa, meaning_vi, definition_en, synonyms, example_en, example_vi, blank_answer")
      .order("ordinal").limit(30);
    words = (rows ?? []).map((r) => ({
      id: r.id as number, word: r.word as string, pos: r.pos as string,
      ipa: r.ipa as string, meaningVi: r.meaning_vi as string,
      definitionEn: r.definition_en as string, synonyms: (r.synonyms ?? []) as string[],
      exampleEn: r.example_en as string, exampleVi: r.example_vi as string,
      // Rỗng, đúng như VocabLite thật ở phía client (xem tests/exam-build.test.ts):
      // blank_answer đã bị thu hồi khỏi `authenticated`, đáp án thật truyền riêng
      // qua `blanks` bên dưới.
      blankAnswer: "",
    }));
    blanks = new Map((rows ?? []).map((r) => [r.id as number, r.blank_answer as string]));
    cauHoi = buildVocabExam(words, blanks, 1);
    baiId = await createVocabExam(alice, aliceId, "lesson", [1], words, blanks, 1);
  });

  afterAll(async () => {
    for (const id of [aliceId, bobId]) {
      if (!id) continue;
      await admin.from("assessments").delete().eq("user_id", id);
      await admin.from("word_mastery").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("ngưỡng đạt là một hằng số 80% cho mọi loại bài", () => {
    expect(PASS_MARK).toBe(80);
  });

  it("payload không bao giờ chứa đáp án", async () => {
    const { data } = await admin
      .from("assessment_items").select("payload").eq("assessment_id", baiId);
    for (const row of data ?? []) {
      const p = row.payload as Record<string, unknown>;
      expect(Object.keys(p).sort()).toEqual(["kind", "options", "prompt"]);
    }
  });

  it("is_correct bị từ chối SELECT với authenticated, cột khác vẫn đọc được", async () => {
    const bi = await alice.from("assessment_items").select("is_correct").eq("assessment_id", baiId);
    expect(bi.error?.code).toBe("42501");
    const duoc = await alice.from("assessment_items").select("position").eq("assessment_id", baiId);
    expect(duoc.error).toBeNull();
  });

  it("wrong_items_for_assessment từ chối CẢ CHÍNH CHỦ khi bài còn in_progress", async () => {
    const { error } = await alice.rpc("wrong_items_for_assessment", { p_assessment_id: baiId });
    expect(error?.code).toBe("42501");
  });

  it("finalize từ chối người không phải chủ", async () => {
    const { error } = await bob.rpc("finalize_assessment_items", {
      p_assessment_id: baiId, p_pass_mark: PASS_MARK, p_now: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it("finalize chặn p_pass_mark NULL bằng lỗi 22004", async () => {
    const { error } = await alice.rpc("finalize_assessment_items", {
      p_assessment_id: baiId, p_pass_mark: null, p_now: new Date().toISOString(),
    });
    expect(error?.code).toBe("22004");
  });

  it("recordAnswer trả về đúng khi khớp đáp án thật, sai khi không khớp — VÀ ghiNhanLanNay=true (finding 3)", async () => {
    const cauDung = cauHoi[1]!;
    const ket1 = await recordAnswer(alice, aliceId, baiId, 1, cauDung.answer);
    expect(ket1.dung).toBe(true);
    expect(ket1.ghiNhanLanNay).toBe(true);

    const cauSai = cauHoi[2]!;
    const phuongAnSai = cauSai.options.find((o) => o !== cauSai.answer)!;
    const ket2 = await recordAnswer(alice, aliceId, baiId, 2, phuongAnSai);
    expect(ket2.dung).toBe(false);
    expect(ket2.ghiNhanLanNay).toBe(true);
  });

  // Finding 3, vòng soát cuối: lệnh gọi THUA cuộc đua ghi (vị trí đã có đáp
  // án từ trước) phải báo `ghiNhanLanNay=false` — ExamRunner dựa vào đúng cờ
  // này để KHÔNG hiện dải "câu trước: đúng/sai" cho một giá trị không mô tả
  // điều đã ghi trong database (xem chú thích tại `recordAnswer`).
  it("trả lời lại một vị trí ĐÃ có đáp án báo ghiNhanLanNay=false (finding 3)", async () => {
    const cau = cauHoi[5]!;
    const lanDau = await recordAnswer(alice, aliceId, baiId, 5, cau.answer);
    expect(lanDau.ghiNhanLanNay).toBe(true);

    const lanHai = await recordAnswer(alice, aliceId, baiId, 5, cau.answer);
    expect(lanHai.ghiNhanLanNay).toBe(false);
  });

  it("trả lời cùng một câu HAI LẦN TUẦN TỰ chỉ cộng mastery một lần", async () => {
    const cau = cauHoi[3]!;
    await recordAnswer(alice, aliceId, baiId, 3, cau.answer);
    await recordAnswer(alice, aliceId, baiId, 3, cau.answer);

    const { data } = await admin
      .from("word_mastery")
      .select("correct_count")
      .eq("user_id", aliceId).eq("word_id", cau.wordId).single();
    expect(data?.correct_count).toBe(1);
  });

  it("trả lời cùng một câu ĐỒNG THỜI (đua ghi) chỉ cộng mastery một lần", async () => {
    const cau = cauHoi[4]!;
    await Promise.all([
      recordAnswer(alice, aliceId, baiId, 4, cau.answer),
      recordAnswer(alice, aliceId, baiId, 4, cau.answer),
    ]);

    const { data } = await admin
      .from("word_mastery")
      .select("correct_count")
      .eq("user_id", aliceId).eq("word_id", cau.wordId).single();
    expect(data?.correct_count).toBe(1);
  });

  it("double-submit song song: đúng một lần thắng, điểm là số thật", async () => {
    await recordAnswer(alice, aliceId, baiId, 0, "sai-hoan-toan");
    const [a, b] = await Promise.allSettled([
      submitExam(alice, baiId), submitExam(alice, baiId),
    ]);
    const thang = [a, b].filter((r) => r.status === "fulfilled");
    expect(thang.length).toBeGreaterThanOrEqual(1);
    const { data } = await admin
      .from("assessments").select("status, score, passed").eq("id", baiId).single();
    expect(data?.status).toBe("submitted");
    expect(data?.score).not.toBeNull();
    expect(data?.passed).not.toBeNull();
  });

  // Yêu cầu C bàn giao (lát 2b, Task 6): đóng bẫy bỏ dở bài thi.
  // `assessments_one_in_progress` (0010_phase2_reset.sql:73) chỉ cho MỖI
  // NGƯỜI DÙNG một bài `in_progress`. `timHoacDungBaiThi` kiểm TRƯỚC khi
  // insert (đường thường — đã được `e2e/exam.spec.ts` khẳng định qua UI), và
  // BẮT LẠI 23505 nếu vẫn đua (đường TOCTOU hiếm, không dựng được ổn định
  // qua UI) — test này khẳng định đúng nhánh bắt đó bằng cách CỐ Ý đua hai
  // lệnh gọi thật đồng thời trên một người dùng MỚI, chưa có bài nào cả (khác
  // Alice/Bob ở trên, để không lẫn với `baiId` đã có sẵn từ `beforeAll`).
  it("dựng bài ĐUA nhau (TOCTOU) chỉ tạo một bài duy nhất, không rơi lỗi 23505 thô", async () => {
    const email = `exam-carol-${Date.now()}@test.local`;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password: "test-pass-1234", email_confirm: true,
    });
    if (createErr) throw createErr;
    const carolId = created.user.id;
    const carol = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await carol.auth.signInWithPassword({ email, password: "test-pass-1234" });

    try {
      const [idA, idB] = await Promise.all([
        timHoacDungBaiThi(carol, carolId, "lesson", [1], words, blanks, 2),
        timHoacDungBaiThi(carol, carolId, "lesson", [1], words, blanks, 2),
      ]);
      // Cả hai lệnh gọi phải trả về CÙNG một id: một thắng cuộc đua insert,
      // lệnh thua bắt được 23505 và tìm lại đúng bài đối thủ vừa thắng —
      // KHÔNG lệnh nào được phép ném lỗi thô ra ngoài (Promise.all ở đây,
      // không phải allSettled, tự làm việc đó: một lệnh reject là cả test lỗi).
      expect(idA).toBe(idB);

      const { data: rows } = await admin
        .from("assessments")
        .select("id")
        .eq("user_id", carolId)
        .eq("status", "in_progress");
      // Đúng MỘT dòng in_progress — không phải hai dòng mồ côi từ hai lệnh
      // insert cùng thắng (đúng ra không thể, chỉ số một-phần chặn), và cũng
      // không phải 0 dòng do một nhánh nào đó âm thầm xoá nhầm.
      expect(rows).toHaveLength(1);
    } finally {
      await admin.from("assessments").delete().eq("user_id", carolId);
      await admin.auth.admin.deleteUser(carolId);
    }
  });

  // Finding 1, vòng soát 1 — bằng chứng CHÍNH, TẤT ĐỊNH (không phụ thuộc ai
  // thắng cuộc đua schedule, xem test đua thật ngay dưới đây để biết vì sao
  // thứ tự dispatch KHÔNG kiểm soát được đáng tin cậy xuyên môi trường). Test
  // này KHÔNG đua — nộp bài XONG HẲN trước (await, xác nhận `submitted` thật
  // trong DB), rồi MỚI gọi `boBaiDangLam` trên đúng bài đó. Đây chính là vị
  // ngữ (predicate) mà finding 1 yêu cầu sửa: `.eq("status", "in_progress")`
  // ngay trong WHERE của DELETE — test này khẳng định trực tiếp, tất định,
  // không nhờ may rủi lịch trình: gọi trên một bài ĐÃ CHẮC CHẮN `submitted`
  // phải trả `null` (không khớp dòng nào) và KHÔNG được đụng tới dòng đó.
  it("boBaiDangLam từ chối xoá một bài ĐÃ submitted — CAS đúng vị trí (finding 1, tất định)", async () => {
    const email = `exam-erin-${Date.now()}@test.local`;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password: "test-pass-1234", email_confirm: true,
    });
    if (createErr) throw createErr;
    const erinId = created.user.id;
    const erin = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await erin.auth.signInWithPassword({ email, password: "test-pass-1234" });

    try {
      const baiXong = await createVocabExam(erin, erinId, "lesson", [1], words, blanks, 4);
      const ketQuaNop = await submitExam(erin, baiXong);
      expect(ketQuaNop.score).not.toBeNull();

      const scopeXoa = await boBaiDangLam(erin, erinId, baiXong);
      // Bài đã `submitted` từ trước — CAS trong DELETE phải khớp 0 dòng,
      // trả `null`, KHÔNG được xoá.
      expect(scopeXoa).toBeNull();

      const { data: sau } = await admin
        .from("assessments").select("status, score").eq("id", baiXong).maybeSingle();
      // Dòng vẫn CÒN NGUYÊN, vẫn đúng điểm đã chốt — bằng chứng trực tiếp
      // DELETE không hề đụng vào nó, không phải suy luận từ giá trị trả về.
      expect(sau?.status).toBe("submitted");
      expect(sau?.score).toBe(ketQuaNop.score);
    } finally {
      await admin.from("assessments").delete().eq("user_id", erinId);
      await admin.from("word_mastery").delete().eq("user_id", erinId);
      await admin.auth.admin.deleteUser(erinId);
    }
  });

  // Finding 1, vòng soát 1: bản đầu của `boBaiDangLam` đọc `status` bằng một
  // SELECT tách rời rồi DELETE không lọc theo status — một tab KHÁC nộp bài
  // GIỮA hai lệnh đó khiến DELETE vẫn xoá mất một bài ĐÃ CHẤM ĐIỂM thật. Sửa
  // bằng cách đưa `status = 'in_progress'` vào NGAY WHERE của lệnh xoá (CAS,
  // cùng khuôn `recordAnswer`/`finalize_assessment_items`).
  //
  // Test này ĐUA THẬT `submitExam` và `boBaiDangLam` trên CÙNG một bài qua
  // `Promise.allSettled` — không giả lập, không mock, không giả định ai
  // thắng. THỬ NGHIỆM THẬT (chạy lặp lại, xem lịch sử phiên làm việc): liệt
  // kê `submitExam` trước trong mảng khiến nó thắng ỔN ĐỊNH khi chạy MỘT
  // MÌNH file này, nhưng khi chạy trong `npm test` (toàn bộ 26 tệp, cùng
  // `fileParallelism: false` nhưng khác tải hệ thống) cuộc đua ĐẢO CHIỀU —
  // `submitExam` reject thật (RPC thấy dòng đã biến mất giữa chừng, tự ném
  // 42501 hoặc "khong co cau nao"). Tức thứ tự liệt kê KHÔNG kiểm soát được
  // ai thắng một cách đáng tin cậy xuyên môi trường — nên bài test PHẢI chấp
  // nhận CẢ HAI kết cục và khẳng định đúng bất biến cho từng kết cục, đọc từ
  // TRẠNG THÁI THẬT trong database (giống hệt cách test "double-submit song
  // song" ở trên đã làm), không đoán trước ai thắng.
  it("boBaiDangLam đua với submitExam: không bao giờ xoá mất một bài đã nộp thật sự (finding 1)", async () => {
    const email = `exam-dave-${Date.now()}@test.local`;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password: "test-pass-1234", email_confirm: true,
    });
    if (createErr) throw createErr;
    const daveId = created.user.id;
    const dave = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await dave.auth.signInWithPassword({ email, password: "test-pass-1234" });

    try {
      const baiDua = await createVocabExam(dave, daveId, "lesson", [1], words, blanks, 3);

      const [, ketQuaXoa] = await Promise.allSettled([
        submitExam(dave, baiDua),
        boBaiDangLam(dave, daveId, baiDua),
      ]);

      const { data: sau } = await admin
        .from("assessments").select("status, score").eq("id", baiDua).maybeSingle();

      if (sau !== null) {
        // Bài còn tồn tại sau cuộc đua — CHỈ hợp lệ nếu nó đã NỘP THẬT SỰ:
        // đúng kịch bản finding 1 mô tả (submit thắng), và `boBaiDangLam`
        // PHẢI đã thua CAS một cách TRUNG THỰC (trả `null`, không ném lỗi
        // thô, không xoá mất nó) — đúng hợp đồng nơi gọi (`boBaiThi`,
        // exam/[id]/actions.ts) đang dựa vào để quyết định redirect sang
        // trang kết quả thay vì để lỗi rơi xuống error.tsx. Đây là bất biến
        // CHÍNH mà finding 1 đòi phải giữ.
        expect(sau.status).toBe("submitted");
        expect(sau.score).not.toBeNull();
        expect(ketQuaXoa.status).toBe("fulfilled");
        expect(ketQuaXoa.status === "fulfilled" ? ketQuaXoa.value : "rejected").toBeNull();
      }
      // Nếu bài KHÔNG còn tồn tại (`sau === null`): xoá đã thắng trong khi
      // bài vẫn còn in_progress — hợp lệ, KHÔNG phải trường hợp finding 1 lo
      // ngại (chưa từng có gì "đã nộp" để mất; `submitExam` phản ánh đúng sự
      // thật đó bằng cách reject, như đã đo thật ở trên). Không cần khẳng
      // định gì thêm ở nhánh này — hành vi CHÍNH XÁC của `submitExam` khi bài
      // của nó biến mất giữa chừng không thuộc phạm vi finding 1.
    } finally {
      await admin.from("assessments").delete().eq("user_id", daveId);
      await admin.from("word_mastery").delete().eq("user_id", daveId);
      await admin.auth.admin.deleteUser(daveId);
    }
  });

  /* ───────────────── Vòng soát cuối — finding 1 (bù trừ + tự chữa lành) ─────────────────
   *
   * Yêu cầu bàn giao đòi CHÍNH XÁC một test: "force the item insert to fail
   * and assert no orphan `assessments` row survives" — đây là test đó. Ép
   * `assessment_items.insert` lỗi bằng một CLIENT GIẢ bọc quanh client thật
   * (cùng khuôn `tests/mastery-write.test.ts` đã dùng cho `applyWordMastery` —
   * xem chú thích ở đó: một lỗi ghi THẬT không ép xảy ra được một cách xác
   * định ở đây qua RLS/permission thông thường, vì mọi insert hợp lệ đều
   * thành công bình thường). `from("assessments")` đi NGUYÊN VẸN tới client
   * thật — insert THẬT xảy ra, dòng THẬT được tạo — chỉ riêng
   * `from("assessment_items").insert` bị ép lỗi, đúng đường `createVocabExam`
   * đi qua NGAY SAU KHI đã insert xong `assessments`.
   */
  it("chèn assessment_items lỗi thì xoá bù dòng assessments vừa tạo, không để mồ côi (finding 1)", async () => {
    const { client: frank, id: frankId } = await taoNguoiDung("frank");

    try {
      const clientGia = {
        from: (table: string) => {
          if (table === "assessment_items") {
            return { insert: async () => ({ error: { message: "lỗi giả lập chèn item", code: "XXXXX" } }) };
          }
          return frank.from(table);
        },
      } as unknown as SupabaseClient;

      await expect(
        createVocabExam(clientGia, frankId, "lesson", [1], words, blanks, 99),
      ).rejects.toBeTruthy();

      const { data: conLai } = await admin
        .from("assessments").select("id").eq("user_id", frankId);
      // KHÔNG còn dòng nào — chứng minh TRỰC TIẾP lệnh xoá bù đã chạy và xoá
      // đúng dòng `assessments` vừa insert, không phải suy luận từ việc
      // `createVocabExam` đã ném lỗi (ném lỗi không tự nó chứng minh đã dọn
      // sạch — chính finding 1 mô tả một dòng mồ côi VẪN sống sót SAU khi
      // lỗi được ném lên).
      expect(conLai).toEqual([]);
    } finally {
      await admin.from("assessments").delete().eq("user_id", frankId);
      await admin.auth.admin.deleteUser(frankId);
    }
  });

  // Finding 1, vòng soát cuối — lớp phòng thủ THỨ BA: một dòng `in_progress`
  // 0 câu hỏi có thể tồn tại từ TRƯỚC bản vá xoá bù ở trên (hoặc nếu chính
  // lượt xoá bù đó cũng lỗi nốt — nhánh `cleanupErr` trong `createVocabExam`).
  // `baiDangLamCua` phải coi dòng đó là "không tồn tại" cho MỌI nơi gọi, và
  // TỰ DỌN nó — không chỉ lờ đi (lờ đi để dòng nằm nguyên `in_progress` thì
  // lượt tạo bài KẾ TIẾP đâm thẳng vào chỉ số một-phần
  // `assessments_one_in_progress`, người học vẫn kẹt). Dựng dòng mồ côi
  // TRỰC TIẾP bằng admin (không qua `createVocabExam`) — mô phỏng đúng "một
  // dòng cũ sống sót từ trước bản vá", độc lập với test ép lỗi insert ở trên.
  it("baiDangLamCua coi một bài in_progress 0 câu hỏi là không tồn tại, và tự dọn nó (finding 1)", async () => {
    const { client: gina, id: ginaId } = await taoNguoiDung("gina");

    try {
      const { data: moCoi, error: insErr } = await admin
        .from("assessments")
        .insert({ user_id: ginaId, type: "lesson", scope: [1] })
        .select("id").single();
      if (insErr) throw insErr;

      const ket = await baiDangLamCua(gina, ginaId);
      expect(ket).toBeNull();

      const { data: conLai } = await admin
        .from("assessments").select("id").eq("id", moCoi.id as number);
      expect(conLai).toEqual([]);

      // Chỗ trống đã THẬT SỰ được giải phóng: tạo được một bài MỚI ngay sau
      // đó mà không đâm 23505 — nếu `baiDangLamCua` chỉ LỜ ĐI dòng mồ côi
      // thay vì xoá, insert dưới đây sẽ chết ngay ở chỉ số một-phần.
      const idMoi = await createVocabExam(gina, ginaId, "lesson", [1], words, blanks, 98);
      expect(idMoi).not.toBe(moCoi.id);
    } finally {
      await admin.from("assessments").delete().eq("user_id", ginaId);
      await admin.auth.admin.deleteUser(ginaId);
    }
  });

  // Mục "Also" bàn giao, vòng soát cuối: `recordAnswer` phải từ chối ghi khi
  // bài đã `submitted` — trước bản vá này hàm chỉ kiểm CAS `user_answer is
  // null` trên CHÍNH câu hỏi, và một câu CHƯA trả lời trong một bài ĐÃ NỘP
  // vẫn khớp đúng CAS đó (finalize chỉ set `is_correct=false` cho câu bỏ
  // trống, KHÔNG đụng `user_answer` — xem 0009_finalize_atomic.sql bước 4),
  // nên trước bản vá này lệnh ghi vẫn lọt qua.
  it("recordAnswer từ chối ghi khi bài đã submitted (Also — vòng soát cuối)", async () => {
    const { client: heidi, id: heidiId } = await taoNguoiDung("heidi");

    try {
      const baiXong = await createVocabExam(heidi, heidiId, "lesson", [1], words, blanks, 97);
      await submitExam(heidi, baiXong);

      await expect(
        recordAnswer(heidi, heidiId, baiXong, 10, cauHoi[10]!.answer),
      ).rejects.toBeTruthy();

      const { data: sau } = await admin
        .from("assessment_items")
        .select("user_answer").eq("assessment_id", baiXong).eq("position", 10).single();
      // Không ghi gì cả — bằng chứng TRỰC TIẾP đọc từ database, không suy
      // luận từ việc lệnh gọi đã ném lỗi.
      expect(sau?.user_answer).toBeNull();
    } finally {
      await admin.from("assessments").delete().eq("user_id", heidiId);
      await admin.from("word_mastery").delete().eq("user_id", heidiId);
      await admin.auth.admin.deleteUser(heidiId);
    }
  });
});
