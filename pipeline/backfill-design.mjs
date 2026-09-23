/**
 * backfill-design.mjs — read `design` tokens for /sites entries saved before
 * the capture did it.
 *
 *     node pipeline/backfill-design.mjs
 *
 * One-off, run by hand. It opens each site with no `design` through the same
 * `loadPage` a capture uses (load, fonts, settle, bot-wall check, walk), reads
 * the tokens with `readDesign`, and writes them into `src/data/sites.json`
 * after `palette`, exactly where `buildSiteEntry` puts them. No screenshot is
 * retaken. A site that fails stays as it was and is named in the summary, so a
 * second run only retries the failures.
 */

import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { CONTEXT_OPTIONS, loadPage, withDeadline } from "./capture.mjs";
import { readDesign } from "./design.mjs";
import { readEntries, writeEntries } from "./entries.mjs";
import { backfill, describe } from "./util.mjs";

const SITES_JSON = fileURLToPath(new URL("../src/data/sites.json", import.meta.url));

/** Pages open at once. Three keeps a laptop responsive and the settle beats overlapping. */
const CONCURRENCY = 3;

/** Wall clock for one site, navigation, settle and walk included. */
const SITE_TIMEOUT_MS = 30_000;

const entries = /** @type {Record<string, unknown>[]} */ (await readEntries(SITES_JSON));
const todo = entries.filter((entry) => !("design" in entry));
const browser = await chromium.launch({ headless: true });
// The run's date, computed as `publish.mjs` computes `ctx.date`.
const today = new Date().toISOString().slice(0, 10);

/** @type {string[]} */
const failed = [];

/** @param {Record<string, unknown>} entry */
async function readOne(entry) {
  const slug = String(entry["slug"]);
  /** @type {import("playwright").BrowserContext | undefined} */
  let context;
  try {
    // Inside the try, so a context that fails to open fails this site only
    // and the run still reaches `writeEntries` with everything else it read.
    const ctx = (context = await browser.newContext(CONTEXT_OPTIONS));
    const design = await withDeadline(
      (async () => {
        const page = await ctx.newPage();
        page.setDefaultTimeout(SITE_TIMEOUT_MS);
        await loadPage(page, String(entry["url"]), slug);
        return await readDesign(page, today);
      })(),
      `design of ${slug}`,
      SITE_TIMEOUT_MS,
    );
    if (design === null) throw new Error("no tokens observed");

    // Rebuilt rather than assigned, so the key lands after `palette`.
    const at = entries.indexOf(entry);
    entries[at] = Object.fromEntries(
      Object.entries(entry).flatMap(([key, value]) =>
        key === "palette" ? [[key, value], ["design", design]] : [[key, value]],
      ),
    );
    console.log(`ok     ${slug}: ${design.colors.length} colours, ${design.type.length} type, ${design.spacing.length} spacing, ${design.radius.length} radius`);
  } catch (error) {
    failed.push(slug);
    console.log(`failed ${slug}: ${describe(error)}`);
  } finally {
    await context?.close().catch(() => {});
  }
}

try {
  await backfill(todo, readOne, CONCURRENCY);
} finally {
  await browser.close();
}

await writeEntries(SITES_JSON, entries);

const have = entries.filter((entry) => "design" in entry).length;
console.log(`\n${have} of ${entries.length} sites have design (${todo.length - failed.length} added this run).`);
if (failed.length > 0) console.log(`Without design: ${failed.join(", ")}`);
