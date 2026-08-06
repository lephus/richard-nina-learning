import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { GrammarLesson, GrammarQuestion, LessonPlan, VocabWord } from "@content/types";

// Doi chieu database THAT voi file du lieu sach trong data/clean/. File sach
// khong dong nghia voi database sach — vu 606 dong vocab_words (605 that + 1
// dong rac "placeholder" ordinal=9999 do tests/rls.test.ts de lai) chung minh
// dieu do. Bo test nay can Supabase local dang chay; neu thieu bien moi
// truong thi bo qua TUONG MINH (khong that bai) de `npm test` van chay duoc
// tren may chua dung Supabase.
const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(URL && SERVICE);

const read = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

describe.skipIf(!hasEnv)("toàn vẹn database đối chiếu data/clean/", () => {
  // describe.skipIf chỉ bỏ qua các `it` bên trong — thân hàm describe() này
  // vẫn LUÔN được thực thi lúc thu thập test (kể cả khi thiếu env). Vì vậy
  // không được throw hay dùng URL!/SERVICE! ở đây; dùng giá trị dự phòng vô
  // hại — createClient() không gọi mạng lúc khởi tạo, và khi thiếu env thì
  // không `it` nào bên dưới thực sự chạy nên `admin` không bao giờ được dùng.
  const admin = createClient(URL ?? "http://127.0.0.1:1", SERVICE ?? "skipped", {
    auth: { persistSession: false },
  });

  const vocab = read<VocabWord[]>("data/clean/vocab.json");
  const grammar = read<GrammarLesson[]>("data/clean/grammar.json");
  const questions = read<GrammarQuestion[]>("data/clean/questions.json");
  const plan = read<LessonPlan[]>("data/clean/lesson-plan.json");
  const totalLessonWords = plan.reduce((sum, p) => sum + p.wordOrdinals.length, 0);
  const realWordCount = vocab.length;

  const countRows = async (table: string): Promise<number> => {
    const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
    if (error) throw error;
    return count ?? 0;
  };

  it(`vocab_words đúng bằng ${realWordCount} dòng (số mục trong vocab.json)`, async () => {
    expect(await countRows("vocab_words")).toBe(realWordCount);
  });

  it(`grammar_lessons đúng bằng ${grammar.length} dòng (số mục trong grammar.json)`, async () => {
    expect(await countRows("grammar_lessons")).toBe(grammar.length);
  });

  it(`grammar_questions đúng bằng ${questions.length} dòng (số mục trong questions.json)`, async () => {
    expect(await countRows("grammar_questions")).toBe(questions.length);
  });

  it(`lessons đúng bằng ${plan.length} dòng (số buổi trong lesson-plan.json)`, async () => {
    expect(await countRows("lessons")).toBe(plan.length);
  });

  it(`lesson_words đúng bằng ${totalLessonWords} dòng (tổng wordOrdinals trong lesson-plan.json)`, async () => {
    expect(await countRows("lesson_words")).toBe(totalLessonWords);
  });

  it(`không có vocab_words nào mang ordinal vượt quá ${realWordCount} (bắt kiểu rác ordinal 9999)`, async () => {
    const { data, error } = await admin
      .from("vocab_words").select("id, ordinal").gt("ordinal", realWordCount);
    if (error) throw error;
    expect(data).toEqual([]);
  });

  it("mỗi buổi đúng 30 từ", async () => {
    const { data, error } = await admin.from("lesson_words").select("lesson_id");
    if (error) throw error;
    const perLesson = new Map<number, number>();
    for (const row of data ?? []) {
      const id = row.lesson_id as number;
      perLesson.set(id, (perLesson.get(id) ?? 0) + 1);
    }
    expect(perLesson.size).toBe(plan.length);
    for (const n of perLesson.values()) expect(n).toBe(30);
  });

  it("không từ nào thuộc hai buổi", async () => {
    const { data, error } = await admin.from("lesson_words").select("word_id");
    if (error) throw error;
    const wordIds = (data ?? []).map((r) => r.word_id as number);
    expect(new Set(wordIds).size).toBe(wordIds.length);
  });

  it("không câu hỏi nào trỏ tới lesson_id không tồn tại", async () => {
    const { data: lessons, error: lErr } = await admin.from("grammar_lessons").select("id");
    if (lErr) throw lErr;
    const validIds = new Set((lessons ?? []).map((l) => l.id as number));

    const { data: qs, error: qErr } = await admin.from("grammar_questions").select("id, lesson_id");
    if (qErr) throw qErr;
    const orphans = (qs ?? []).filter((q) => !validIds.has(q.lesson_id as number));
    expect(orphans).toEqual([]);
  });
});
