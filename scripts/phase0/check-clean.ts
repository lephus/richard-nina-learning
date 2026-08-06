import { readFileSync } from "node:fs";
import { validateVocab } from "../../src/content/vocab-schema.js";

const items = JSON.parse(readFileSync("data/clean/vocab.json", "utf8")) as unknown[];
const { valid, invalid } = validateVocab(items);

console.log(`Hop le: ${valid.length} / ${items.length}`);
for (const e of invalid) console.error(`  #${e.ordinal}: ${e.problems.join("; ")}`);

const ords = valid.map((v) => v.ordinal);
const dup = ords.filter((o, i) => ords.indexOf(o) !== i);
if (dup.length) console.error(`Trung so thu tu: ${dup.join(", ")}`);

process.exit(invalid.length || dup.length ? 1 : 0);
