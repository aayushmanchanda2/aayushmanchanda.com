/**
 * rescrape-posts.mjs — give long saved posts their paragraphs back (VET-246).
 *
 * `parsePost` used to flatten a post to one line, then (until VET-284) each
 * paragraph to one line, and X returns its breaks only over the first 280
 * characters, so a long post past that lost them. This re-reads each post over 280 characters through Firecrawl and takes
 * the new text only when it is the same words: the breaks are the one thing it
 * is allowed to change. Anything else is logged and left alone.
 *
 * Needs `FIRECRAWL_API_KEY`, so it runs in CI (`rescrape-posts.yml`). Safe to
 * re-run. `node pipeline/rescrape-posts.mjs`
 */

import { fileURLToPath, pathToFileURL } from "node:url";

import { readEntries, writeEntries } from "./entries.mjs";
import { firecrawlFrom, parsePost } from "./firecrawl.mjs";
import { backfill, describe, oneLine } from "./util.mjs";

const LIBRARY_JSON = fileURLToPath(new URL("../src/data/library.json", import.meta.url));

/** Past this X has cut the text and its breaks with it. */
const LONG = 280;


/**
 * The scraped text when it is the saved words with more line breaks, else null.
 * @param {string} saved @param {string} scraped @returns {string | null}
 */
export function rebroken(saved, scraped) {
  if (oneLine(saved) !== oneLine(scraped)) return null;
  const breaks = (/** @type {string} */ text) => text.split("\n").length;
  return breaks(scraped) > breaks(saved) ? scraped : null;
}

async function main() {
  const firecrawl = firecrawlFrom(process.env);
  if (firecrawl === null) {
    console.error("rescrape: FIRECRAWL_API_KEY is not set");
    return 1;
  }

  const entries = /** @type {Record<string, any>[]} */ (await readEntries(LIBRARY_JSON));
  const long = entries.filter(
    (entry) => entry["kind"] === "post" && typeof entry["post"]?.text === "string" && entry["post"].text.length > LONG,
  );
  const tally = { fixed: 0, same: 0, differs: 0, failed: 0 };

  await backfill(
    long,
    async (entry) => {
      try {
        const scraped = parsePost(await firecrawl.scrapeMarkdown(entry.url), entry.url);
        const text = scraped === null ? null : rebroken(entry.post.text, scraped.text);
        if (text !== null) {
          entry.post.text = text;
          tally.fixed += 1;
          console.log(`fixed   ${entry.slug}`);
        } else if (scraped !== null && oneLine(scraped.text) === oneLine(entry.post.text)) {
          tally.same += 1;
        } else {
          tally.differs += 1;
          console.log(`differs ${entry.slug}: kept the saved text`);
        }
      } catch (error) {
        tally.failed += 1;
        console.log(`failed  ${entry.slug}: ${describe(error)}`);
      }
    },
    4,
  );

  if (tally.fixed > 0) await writeEntries(LIBRARY_JSON, entries);
  console.log(`rescrape: ${long.length} long posts, ${JSON.stringify(tally)}`);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
