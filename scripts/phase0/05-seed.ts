import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import type { GrammarLesson, GrammarQuestion, LessonPlan, VocabWord } from "../../src/content/types.js";

// Khoa nam trong .env.local (da gitignore), khong phai .env. `dotenv/config`
// chi doc .env nen truoc day script luon chet o dong kiem tra ben duoi.
config({ path: ".env.local" });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Thieu SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY trong .env.local");
const db = createClient(url, key, { auth: { persistSession: false } });

const read = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const vocab = read<VocabWord[]>("data/clean/vocab.json");
const grammar = read<GrammarLesson[]>("data/clean/grammar.json");
const questions = read<GrammarQuestion[]>("data/clean/questions.json");
const plan = read<LessonPlan[]>("data/clean/lesson-plan.json");

const die = (label: string, e: unknown) => { if (e) { console.error(label, e); process.exit(1); } };

// Chan xoa nham du lieu nguoi hoc. word_mastery tro toi vocab_words bang khoa ngoai
// khong cascade, nen xoa noi dung khi da co tien do se that bai giua chung va
// de lai database do dang. Kiem tra truoc, dung han neu co.
const { count: progressRows } = await db
  .from("word_mastery").select("*", { count: "exact", head: true });
if ((progressRows ?? 0) > 0 && !process.argv.includes("--force")) {
  console.error(`DUNG: da co ${progressRows} dong tien do hoc tap. Seed lai se xoa noi dung`);
  console.error(`ma tien do dang tro toi. Chay lai voi --force neu that su muon.`);
  process.exit(1);
}

// Xoa theo thu tu nguoc phu thuoc khoa ngoai.
// Moi bang mot cot loc rieng: lesson_words dung khoa chinh ghep, KHONG co cot "id".
const WIPE: Array<[string, string]> = [
  ["lesson_words", "lesson_id"],
  ["lessons", "id"],
  ["grammar_questions", "id"],
  ["grammar_lessons", "id"],
  ["vocab_words", "id"],
];
for (const [table, col] of WIPE) {
  die(`xoa ${table}`, (await db.from(table).delete().gte(col, 0)).error);
}

const vRows = vocab.map((w) => ({
  ordinal: w.ordinal, word: w.word, pos: w.pos, ipa: w.ipa,
  meaning_vi: w.meaningVi, definition_en: w.definitionEn, definition_vi: w.definitionVi,
  synonyms: w.synonyms, example_en: w.exampleEn, example_vi: w.exampleVi,
  blank_answer: w.blankAnswer,
}));
const { data: words, error: vErr } = await db.from("vocab_words").insert(vRows).select("id, ordinal");
die("seed vocab", vErr);
const wordIdByOrdinal = new Map(words!.map((w) => [w.ordinal as number, w.id as number]));

const gRows = grammar.map((l) => ({
  ordinal: l.ordinal, slug: l.slug, title: l.title,
  summary: l.summary, content_md: l.contentMd, source_file: l.sourceFile,
}));
const { data: gl, error: gErr } = await db.from("grammar_lessons").insert(gRows).select("id, slug");
die("seed grammar", gErr);
const lessonIdBySlug = new Map(gl!.map((l) => [l.slug as string, l.id as number]));

die("seed questions", (await db.from("grammar_questions").insert(
  questions.map((q) => ({
    lesson_id: lessonIdBySlug.get(q.lessonSlug), stem: q.stem,
    options: q.options, answer: q.answer, explanation: q.explanation,
  })),
)).error);

const { data: ls, error: lErr } = await db.from("lessons").insert(
  plan.map((p) => ({ ordinal: p.ordinal, grammar_lesson_id: lessonIdBySlug.get(p.grammarSlug) })),
).select("id, ordinal");
die("seed lessons", lErr);
const lessonIdByOrdinal = new Map(ls!.map((l) => [l.ordinal as number, l.id as number]));

die("seed lesson_words", (await db.from("lesson_words").insert(
  plan.flatMap((p) =>
    p.wordOrdinals.map((ord, i) => ({
      lesson_id: lessonIdByOrdinal.get(p.ordinal),
      word_id: wordIdByOrdinal.get(ord),
      position: i + 1,
    })),
  ),
)).error);

console.log(`Seed xong: ${vocab.length} tu, ${grammar.length} bai, ${questions.length} cau hoi, ${plan.length} buoi`);
