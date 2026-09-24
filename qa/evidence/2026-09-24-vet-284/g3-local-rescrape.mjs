// The two long posts the CI rescrape could not reach (Firecrawl's 10/min limit),
// run locally from markdown saved off the same x-twitter post-processor
// (g3-markdown/<slug>.md). Same rule as rescrape-posts.mjs: taken only when
// it is the saved words with more line breaks (`rebroken`).
import { readFile } from "node:fs/promises";
import { readEntries, writeEntries } from "../../../pipeline/entries.mjs";
import { parsePost } from "../../../pipeline/firecrawl.mjs";
import { rebroken } from "../../../pipeline/rescrape-posts.mjs";
const file = "src/data/library.json";
const entries = await readEntries(file);
let fixed = 0;
for (const slug of ["eight-mistakes-people-make-coding-with-ai", "how-i-make-launch-videos-with-ai"]) {
  const entry = entries.find((e) => e.slug === slug);
  const scraped = parsePost(await readFile(`qa/evidence/2026-09-24-vet-284/g3-markdown/${slug}.md`, "utf8"), entry.url);
  const text = scraped && rebroken(entry.post.text, scraped.text);
  console.log(text ? "fixed  " : "kept   ", slug);
  if (text) { entry.post.text = text; fixed++; }
}
if (fixed) await writeEntries(file, entries);
