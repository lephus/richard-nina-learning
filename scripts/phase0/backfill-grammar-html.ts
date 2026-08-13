import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import type { GrammarLesson } from "../../src/content/types.js";

// Backfill CHI cot content_html cho 20 dong grammar_lessons DA CO SAN trong
// DB — KHONG phai seed lai. 05-seed.ts xoa-roi-chen lai toan bo bang noi
// dung, va chinh chu thich trong file do da ghi ro vi sao lam vay bay gio la
// nguy hiem: word_mastery tro toi vocab_words bang khoa ngoai KHONG cascade,
// nen lenh xoa se that bai giua chung va de lai DB do dang. Database hien co
// word_mastery va assessments THAT tu cac lat truoc — khong duoc dung toi.
// Script nay chi UPDATE mot cot duy nhat cua mot bang duy nhat, khong xoa,
// khong chen.
//
// Khop theo slug, KHONG theo vi tri mang: gia dinh thu tu DB trung voi thu
// tu data/clean/grammar.json la dung chinh kieu lech am tham du an nay da
// tung bi (xem "Viec theo sau" o
// docs/superpowers/specs/2026-08-13-lat-2d-lo-trinh-ngu-phap-design.md).
//
// No ngay va khong cap nhat dong nao neu thieu du 20 slug trong DB, thay vi
// am tham cap nhat 19/20 roi bao thanh cong.

config({ path: ".env.local" });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Thieu SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY trong .env.local");
const db = createClient(url, key, { auth: { persistSession: false } });

const lessons = JSON.parse(readFileSync("data/clean/grammar.json", "utf8")) as GrammarLesson[];
if (lessons.length !== 20) {
  throw new Error(`data/clean/grammar.json co ${lessons.length} bai, ky vong 20`);
}

const { data: rows, error: selErr } = await db.from("grammar_lessons").select("id, slug");
if (selErr) throw selErr;
const idBySlug = new Map((rows ?? []).map((r) => [r.slug as string, r.id as number]));

const thieu = lessons.filter((l) => !idBySlug.has(l.slug));
if (thieu.length > 0) {
  throw new Error(
    `DUNG: khong tim thay slug trong grammar_lessons: ${thieu.map((l) => l.slug).join(", ")}. ` +
      `Chua cap nhat dong nao.`,
  );
}

for (const l of lessons) {
  const { data, error } = await db
    .from("grammar_lessons")
    .update({ content_html: l.contentHtml })
    .eq("slug", l.slug)
    .select("id");
  if (error) throw error;
  if ((data ?? []).length !== 1) {
    throw new Error(`Update slug "${l.slug}" dung ${data?.length ?? 0} dong, ky vong dung 1`);
  }
  console.log(`${l.ordinal}. ${l.slug}: da cap nhat content_html (${l.contentHtml.length} ky tu)`);
}
console.log(`Backfill xong: ${lessons.length}/${lessons.length} dong.`);
