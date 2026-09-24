/**
 * /now (VET-57): the counts come from tools.json, the page carries an
 * "Updated" date, and every link on it points at a route that exists.
 *
 * `lib/now.ts` has no imports, so it loads here as it is. `lib/tools.ts` does
 * not (it imports JSON), so the counts are checked against the raw file,
 * counted a second way.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { NOW_UPDATED, nowDate, nowGroups, nowHrefs, toolCounts } from "./now.ts";

const read = (/** @type {string} */ rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const exists = (/** @type {string} */ rel) => existsSync(fileURLToPath(new URL(rel, import.meta.url)));
/** @type {{ verdict: string }[]} */
const tools = JSON.parse(read("../data/tools.json"));
/** @type {{ slug: string }[]} */
const library = JSON.parse(read("../data/library.json"));
const text = (/** @type {any[]} */ parts) => parts.map((part) => (typeof part === "string" ? part : part.text)).join("");

test("the tool counts are counted from tools.json", () => {
  const using = tools.filter((tool) => tool.verdict === "using").length;
  const watching = tools.filter((tool) => tool.verdict === "watching").length;
  assert.ok(using > 0 && watching > 0);
  assert.deepEqual(toolCounts(tools), { total: tools.length, using, watching });

  const lines = nowGroups(toolCounts(tools)).flatMap((group) => group.lines.map(text));
  assert.ok(
    lines.includes(`Agent tools, on my own companies first. /tools has ${tools.length} so far: ${using} in daily use, ${watching} saved to try.`),
  );
});

test("the page has an Updated date, and the page prints it", () => {
  assert.match(NOW_UPDATED, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!Number.isNaN(Date.parse(NOW_UPDATED)));
  assert.equal(nowDate("2026-09-24"), "September 24, 2026");
  assert.match(read("../pages/now.astro"), /Updated <time datetime=\{NOW_UPDATED\}>\{nowDate\(\)\}<\/time>/);
});

test("every link on /now resolves to a route or an entry", () => {
  const hrefs = nowHrefs(nowGroups(toolCounts(tools)));
  assert.equal(hrefs.at(-1), "/contact", "the closing ask links to /contact");
  for (const href of hrefs) {
    if (href.startsWith("https://")) continue;
    const entry = href.match(/^\/library\/([^/]+)$/);
    if (entry) assert.ok(library.some((row) => row.slug === entry[1]), `no library entry ${entry[1]}`);
    else assert.ok(exists(`../pages${href}.astro`), `no page for ${href}`);
  }
});
