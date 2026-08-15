import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildVocabExam } from "@/lib/exam/build";
import {
  buildGrammarExam, type GrammarQuestionLite,
} from "@/lib/exam/build-grammar";
import { createGrammarExam, createVocabExam, recordAnswer } from "@/lib/exam/run";
import type { VocabLite } from "@/lib/vocab/word";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const hasEnv = Boolean(URL && SERVICE && ANON);

/**
 * Tích hợp cho lát "dừng lại xem kết quả" (Task 2): `recordAnswer` giờ trả
 * thêm `dapAnDung`/`giaiThich`. Bốn khẳng định đúng như task-2-brief.md, cộng
 * một khẳng định giữ chốt chặn cũ (payload không bao giờ chứa đáp án) — dựng
 * cả bài vocab (câu "nghĩa" + "điền") LẪN bài ngữ pháp thật, vì ba nhánh chấm
 * điểm của `recordAnswer` đọc đáp án từ ba nguồn khác nhau (cột công khai,
 * RPC `answer_for_word`, RPC `dap_an_va_giai_thich`) — không nhánh nào kiểm
 * được nhánh khác.
 */
describe.skipIf(!hasEnv)("recordAnswer trả đáp án và giải thích", () => {
  const admin = createClient(URL ?? "http://localhost", SERVICE ?? "x", {
    auth: { persistSession: false },
  });

  // Cùng 30 từ đầu mà tests/exam-security.test.ts dùng — không quan trọng là
  // đúng 30 từ đó, chỉ cần đủ để buildVocabExam dựng được câu "nghĩa" lẫn câu
  // "điền" (15-15 cho 30 từ, xem build.ts).
  let words: VocabLite[] = [];
  let blanks = new Map<number, string>();

  // Bài "cấu trúc câu" (ordinal 1) — bài nhỏ nhất trong 20 bài ngữ pháp, chọn
  // để test chạy nhanh (xem cùng lựa chọn ở tests/exam-grammar.test.ts).
  let grammarLessonId = 0;
  let grammarQuestions: GrammarQuestionLite[] = [];

  const nguoiDungDaTao: string[] = [];

  async function taoNguoiDung(nhan: string) {
    const email = `phanhoi-${nhan}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password: "test-pass-1234", email_confirm: true,
    });
    if (error) throw error;
    nguoiDungDaTao.push(data.user.id);
    const c = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password: "test-pass-1234" });
    return { client: c, id: data.user.id };
  }

  beforeAll(async () => {
    const { data: rows } = await admin
      .from("vocab_words")
      .select("id, word, pos, ipa, meaning_vi, definition_en, synonyms, example_en, example_vi, blank_answer")
      .order("ordinal").limit(30);
    words = (rows ?? []).map((r) => ({
      id: r.id as number, word: r.word as string, pos: r.pos as string,
      ipa: r.ipa as string, meaningVi: r.meaning_vi as string,
      definitionEn: r.definition_en as string, synonyms: (r.synonyms ?? []) as string[],
      exampleEn: r.example_en as string, exampleVi: r.example_vi as string,
      // Rỗng, đúng như VocabLite thật ở phía client — xem chú thích tương tự ở
      // tests/exam-security.test.ts. Đáp án thật truyền riêng qua `blanks`.
      blankAnswer: "",
    }));
    blanks = new Map((rows ?? []).map((r) => [r.id as number, r.blank_answer as string]));

    const { data: lesson, error: lessonErr } = await admin
      .from("grammar_lessons").select("id").eq("ordinal", 1).single();
    if (lessonErr) throw lessonErr;
    grammarLessonId = lesson.id as number;
    const { data: qRows, error: qErr } = await admin
      .from("grammar_questions").select("id, stem, options, answer").eq("lesson_id", grammarLessonId);
    if (qErr) throw qErr;
    grammarQuestions = (qRows ?? []).map((r) => ({
      id: r.id as number, stem: r.stem as string,
      options: r.options as string[], answer: r.answer as string,
    }));
  });

  afterAll(async () => {
    for (const id of nguoiDungDaTao) {
      await admin.from("assessments").delete().eq("user_id", id);
      await admin.from("word_mastery").delete().eq("user_id", id);
      await admin.from("grammar_mastery").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  });

  // Chốt chặn cũ (tests/exam-security.test.ts đã canh, nhắc lại ở đây vì lát
  // này SỬA ngay ba nhánh ghi payload/chấm điểm — dễ vô tình làm lệch nếu
  // không có test tại chỗ): payload gửi xuống lúc tải trang không bao giờ
  // được có đáp án, kể cả sau khi recordAnswer giờ trả thêm dapAnDung/giaiThich.
  it("payload bài vừa dựng chỉ có đúng prompt/options/kind — không có đáp án", async () => {
    // Hai người dùng RIÊNG cho vocab/ngữ pháp — chỉ số một-phần
    // `assessments_one_in_progress` (0010_phase2_reset.sql:73) chỉ cho MỖI
    // NGƯỜI DÙNG một bài `in_progress` tại một thời điểm, nên cùng một người
    // không dựng được cả hai bài song song.
    const vocab = await taoNguoiDung("payload-vocab");
    const nguPhap = await taoNguoiDung("payload-grammar");
    const baiVocabId = await createVocabExam(
      vocab.client, vocab.id, "lesson", [1], words, blanks, 100,
    );
    const baiNguPhapId = await createGrammarExam(
      nguPhap.client, nguPhap.id, grammarLessonId, grammarQuestions, 100,
    );

    for (const baiId of [baiVocabId, baiNguPhapId]) {
      const { data } = await admin
        .from("assessment_items").select("payload").eq("assessment_id", baiId);
      for (const row of data ?? []) {
        const p = row.payload as Record<string, unknown>;
        expect(Object.keys(p).sort()).toEqual(["kind", "options", "prompt"]);
      }
    }
  });

  // SỬA VÒNG 1 (coordinator): spec thiết kế mục 8 nói `giaiThich` là `null`
  // cho câu từ vựng — MÂU THUẪN với mục 9 ("dùng nghĩa tiếng Việt và câu ví dụ
  // đã có"). Mục 9 mới đúng: `giaiThich` GHÉP từ `meaning_vi`/`example_vi`
  // (xem `ghepGiaiThichTuVung`, src/lib/exam/run.ts), không phải bỏ trống.
  // Test dưới đây đối chiếu ĐÚNG công thức ghép đó, đọc `meaning_vi`/
  // `example_vi` ĐỘC LẬP qua admin — không tin vào field cùng tên ở `words`
  // (vốn cũng do beforeAll tự đọc, cùng một nguồn).
  it("câu 'nghĩa → từ': dapAnDung đúng bằng vocab_words.word của ref_id, giaiThich ghép từ meaning_vi + example_vi", async () => {
    const { client, id } = await taoNguoiDung("nghia");
    const baiId = await createVocabExam(client, id, "lesson", [1], words, blanks, 101);
    const cauHoi = buildVocabExam(words, blanks, 101);
    const vTri = cauHoi.findIndex((c) => c.kind === "nghia");
    expect(vTri).toBeGreaterThanOrEqual(0);
    const cau = cauHoi[vTri]!;

    const ket = await recordAnswer(client, id, baiId, vTri, cau.answer);
    expect(ket.ghiNhanLanNay).toBe(true);
    expect(ket.dung).toBe(true);

    // Đối chiếu ĐỘC LẬP qua admin client, không tin vào `cau.answer` (vốn cũng
    // do buildVocabExam tự tính) — đọc thẳng từ database xem word thật của
    // ref_id có khớp không.
    const { data: tu } = await admin
      .from("vocab_words").select("word, meaning_vi, example_vi").eq("id", cau.wordId).single();
    expect(ket.dapAnDung).toBe(tu?.word);
    // Nội dung THẬT phải chứa cả nghĩa lẫn ví dụ tiếng Việt — không khẳng định
    // đúng nguyên văn định dạng ghép (đó là chi tiết trình bày, có thể đổi),
    // chỉ khẳng định dữ liệu nguồn có mặt trong chuỗi trả về.
    expect(ket.giaiThich).toContain(tu?.meaning_vi as string);
    expect(ket.giaiThich).toContain(tu?.example_vi as string);
  });

  it("câu 'điền': dapAnDung đúng bằng blank_answer của ref_id (đối chiếu qua admin), giaiThich ghép từ meaning_vi + example_vi", async () => {
    const { client, id } = await taoNguoiDung("dien");
    const baiId = await createVocabExam(client, id, "lesson", [1], words, blanks, 102);
    const cauHoi = buildVocabExam(words, blanks, 102);
    const vTri = cauHoi.findIndex((c) => c.kind === "dien");
    expect(vTri).toBeGreaterThanOrEqual(0);
    const cau = cauHoi[vTri]!;

    const ket = await recordAnswer(client, id, baiId, vTri, cau.answer);
    expect(ket.ghiNhanLanNay).toBe(true);
    expect(ket.dung).toBe(true);

    // `blank_answer` đã bị revoke khỏi `authenticated` (0004_rls.sql) — chỉ
    // admin (service role) đọc trực tiếp được, đúng như brief yêu cầu "lấy đối
    // chiếu qua admin client". `meaning_vi`/`example_vi` thì đọc được bằng cả
    // hai vai, đọc qua admin ở đây chỉ để giữ một nguồn đối chiếu duy nhất.
    const { data: tu } = await admin
      .from("vocab_words")
      .select("blank_answer, meaning_vi, example_vi")
      .eq("id", cau.wordId).single();
    expect(ket.dapAnDung).toBe(tu?.blank_answer);
    expect(ket.giaiThich).toContain(tu?.meaning_vi as string);
    expect(ket.giaiThich).toContain(tu?.example_vi as string);
  });

  it("câu ngữ pháp: dapAnDung nằm trong options của câu, giaiThich dài hơn 10 ký tự", async () => {
    const { client, id } = await taoNguoiDung("nguphap");
    const baiId = await createGrammarExam(client, id, grammarLessonId, grammarQuestions, 103);
    const cauHoi = buildGrammarExam(grammarQuestions, 103);
    const cau = cauHoi[0]!;

    const ket = await recordAnswer(client, id, baiId, 0, cau.answer);
    expect(ket.ghiNhanLanNay).toBe(true);
    expect(ket.dung).toBe(true);
    expect(cau.options).toContain(ket.dapAnDung);
    expect(typeof ket.giaiThich).toBe("string");
    expect(ket.giaiThich.length).toBeGreaterThan(10);
  });

  // Finding 3 (đã canh ở exam-security.test.ts) áp cho cả dapAnDung/giaiThich
  // mới thêm: một lượt gọi THUA cuộc đua ghi (CAS `user_answer is null` đã bị
  // khoá từ lượt đầu) vẫn phải trả đúng đáp án để hiện — chỉ riêng mastery là
  // không được cộng thêm lần hai. Dùng câu ngữ pháp vì đây là nhánh RPC vừa
  // đổi (`dap_an_va_giai_thich` thay `answer_for_question`) — nhánh có rủi ro
  // hồi quy cao nhất trong ba nhánh.
  it("trả lời lại cùng một vị trí vẫn trả dapAnDung đúng, ghiNhanLanNay=false, và grammar_mastery không tăng lần hai", async () => {
    const { client, id } = await taoNguoiDung("lai");
    const baiId = await createGrammarExam(client, id, grammarLessonId, grammarQuestions, 104);
    const cauHoi = buildGrammarExam(grammarQuestions, 104);
    const cau = cauHoi[0]!;

    const lanDau = await recordAnswer(client, id, baiId, 0, cau.answer);
    expect(lanDau.ghiNhanLanNay).toBe(true);

    const lanHai = await recordAnswer(client, id, baiId, 0, cau.answer);
    expect(lanHai.ghiNhanLanNay).toBe(false);
    // Đáp án hiện vẫn đúng dù CAS đã thua — client mở lại bài đang làm dở vẫn
    // phải thấy được đáp án của câu đã trả lời trước đó.
    expect(lanHai.dapAnDung).toBe(lanDau.dapAnDung);
    expect(cau.options).toContain(lanHai.dapAnDung);
    expect(lanHai.giaiThich).toBe(lanDau.giaiThich);

    const { data: gm } = await admin
      .from("grammar_mastery")
      .select("correct_count")
      .eq("user_id", id).eq("grammar_lesson_id", grammarLessonId).single();
    // Đúng MỘT lần thắng CAS trong hai lượt gọi tuần tự — không phải hai.
    expect(gm?.correct_count).toBe(1);
  });
});
