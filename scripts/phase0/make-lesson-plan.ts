import { readFileSync, writeFileSync } from "node:fs";
import { buildLessonPlan } from "../../src/content/lesson-manifest.js";
import type { GrammarLesson, VocabWord } from "../../src/content/types.js";

const vocab = JSON.parse(readFileSync("data/clean/vocab.json", "utf8")) as VocabWord[];
const grammar = JSON.parse(readFileSync("data/clean/grammar.json", "utf8")) as GrammarLesson[];

const plan = buildLessonPlan(
  vocab.map((w) => w.ordinal),
  [...grammar].sort((a, b) => a.ordinal - b.ordinal).map((l) => l.slug),
);

writeFileSync("data/clean/lesson-plan.json", JSON.stringify(plan, null, 2));
console.log(`Da tao ${plan.length} buoi`);
