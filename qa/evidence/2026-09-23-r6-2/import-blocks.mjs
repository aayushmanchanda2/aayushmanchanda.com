// One-shot: write block, also_saved and title from the approved drafts into library.json (VET-273).
import { readFileSync } from "node:fs";
import { readEntries, writeEntries } from "../../../pipeline/entries.mjs";
import { block } from "../../../src/lib/reader.mjs";

const SRC = "/Users/aayushmanchanda/Downloads/Aayush/AayushOS/feature-research/aayushmanchanda-com/briOS-wave/library-blocks.json";
const FILE = "src/data/library.json";
const drafts = new Map(JSON.parse(readFileSync(SRC, "utf8")).map((d) => [d.slug, d]));
const entries = await readEntries(FILE);
let seen = 0;
const next = entries.map((entry) => {
  const d = drafts.get(entry.slug);
  if (!d) return entry;
  seen++;
  const out = { ...entry, title: d.title };
  delete out.block;
  delete out.also_saved;
  if (d.block) out.block = block(d.block); // drops prompt.context; validates
  if (d.also_saved) out.also_saved = true;
  return out;
});
if (seen !== drafts.size) throw new Error(`matched ${seen} of ${drafts.size}`);
await writeEntries(FILE, next);
console.log(`wrote ${seen} entries`);
