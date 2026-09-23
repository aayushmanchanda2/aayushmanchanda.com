// @ts-nocheck: a one-off evidence script, not site code.
// VET-227 one-off interaction checks for /tools. Run from the repo root:
//   node qa/evidence/2026-09-22-vet-227/interactions.mjs [base]
// Writes interactions.json next to itself; exit 1 on any failed check.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:4329";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "interactions.json");
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name} ${JSON.stringify(detail)}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const col = (attr) =>
  page.$$eval(`tbody[data-tool-rows] tr:not([hidden])`, (rows, a) => rows.map((r) => r.getAttribute(a)), attr);
const countText = () => page.textContent("[data-filter-count]");
const sortBy = (label) => page.click(`th[data-sort-key] button:text-is("${label}")`);
const ariaSort = (key) => page.getAttribute(`th[data-sort-key="${key}"]`, "aria-sort");

await page.goto(`${BASE}/tools`);
const firstRowY = await page.$eval("tbody tr", (r) => Math.round(r.getBoundingClientRect().top));
check("first row y < 300 at 1280", firstRowY < 300, { firstRowY });

// Sorting
const fileOrder = await col("data-index");
await sortBy("Date");
const desc = await col("data-sort-date");
check("date sort descending", JSON.stringify(desc) === JSON.stringify([...desc].sort().reverse()) && (await ariaSort("date")) === "descending", { first: desc[0], last: desc.at(-1), aria: await ariaSort("date") });
await sortBy("Date");
const asc = await col("data-sort-date");
check("date sort toggles to ascending", JSON.stringify(asc) === JSON.stringify([...asc].sort()) && (await ariaSort("date")) === "ascending", { first: asc[0], last: asc.at(-1) });
await sortBy("Date");
check("third press restores file order", JSON.stringify(await col("data-index")) === JSON.stringify(fileOrder) && (await ariaSort("date")) === null, {});
await sortBy("Name");
const names = await col("data-sort-name");
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
check("name sort A to Z", JSON.stringify(names) === JSON.stringify([...names].sort(collator.compare)), { first: names[0] });
await sortBy("Verdict");
const ranks = await col("data-sort-verdict");
check("verdict sort by rank", JSON.stringify(ranks) === JSON.stringify([...ranks].sort()), { first: ranks[0], last: ranks.at(-1) });
await sortBy("Category");
const cats = await col("data-sort-category");
check("category sort A to Z", JSON.stringify(cats) === JSON.stringify([...cats].sort(collator.compare)), { first: cats[0] });
const tiles = await page.$$eval("ul[data-tool-rows] li", (l) => l.map((t) => t.getAttribute("data-index")));
check("grid tiles follow the table order", JSON.stringify(tiles) === JSON.stringify(await col("data-index")), {});

// Filters: URL round-trip
await page.goto(`${BASE}/tools`);
await page.selectOption("#filter-verdict", "using");
check("verdict filter writes ?verdict=using", page.url().endsWith("/tools?verdict=using"), { url: page.url() });
const verdicts = await col("data-verdict");
check("only using rows shown, count matches", verdicts.every((v) => v === "using") && (await countText()) === `${verdicts.length} tools`, { n: verdicts.length, count: await countText() });
await page.selectOption("#filter-category", "agent-infra");
check("both filters in URL", page.url().endsWith("/tools?verdict=using&category=agent-infra"), { url: page.url(), rows: (await col("data-slug")).length, count: await countText() });
await page.goBack();
check("back restores verdict-only filter", page.url().endsWith("/tools?verdict=using") && (await page.inputValue("#filter-category")) === "" && (await col("data-verdict")).length === verdicts.length, { url: page.url() });
await page.goForward();
check("forward re-applies both", (await page.inputValue("#filter-category")) === "agent-infra", { count: await countText() });
await page.goBack();

// Row click on a non-link cell lands on the detail page; Back restores the filter.
const slugOf = await page.$eval("tbody tr:not([hidden]) .row__link", (a) => a.getAttribute("href"));
// force: the stretched link sits over the cell on purpose, so Playwright's
// "is something covering it" check trips; the mouse still presses the cell's centre.
const hit = await page.$eval("tbody tr:not([hidden]) .cell--desc", (td) => {
  const r = td.getBoundingClientRect();
  return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.className;
});
check("the stretched link is what sits over the description cell", String(hit).includes("row__link"), { hit });
await page.click("tbody tr:not([hidden]) .cell--desc", { force: true });
await page.waitForLoadState();
check("row click (description cell) navigates to /tools/<slug>", new URL(page.url()).pathname.replace(/\/$/, "") === slugOf, { url: page.url(), expected: slugOf });
await page.goBack();
await page.waitForLoadState();
check("back button restores filter", page.url().endsWith("/tools?verdict=using") && (await page.inputValue("#filter-verdict")) === "using" && (await col("data-verdict")).every((v) => v === "using"), { url: page.url(), count: await countText() });

// Deep link, bogus values, empty state
await page.goto(`${BASE}/tools?category=agent-infra&verdict=watching`);
check("deep link filters on load", (await page.inputValue("#filter-category")) === "agent-infra" && (await page.inputValue("#filter-verdict")) === "watching", { count: await countText() });
await page.goto(`${BASE}/tools?verdict=loved`);
check("unknown value reads as All", (await countText()) === "86 tools", { count: await countText() });
await page.goto(`${BASE}/tools?category=sandboxes&verdict=using`);
check("empty combination shows the empty state", (await countText()) === "0 tools" && (await page.isVisible("[data-filter-empty]")), { count: await countText() });

// Grid view: filters apply to tiles, tiles link to the detail page.
await page.goto(`${BASE}/tools?verdict=using`);
await page.click('[data-tools-view-set="grid"]');
const shownTiles = await page.$$eval("ul[data-tool-rows] li:not([hidden])", (l) => l.length);
check("grid: table hidden, filtered tiles shown", !(await page.isVisible("table")) && shownTiles === 7, { shownTiles });
const tileHref = await page.$eval("ul[data-tool-rows] li:not([hidden]) a", (a) => a.getAttribute("href"));
check("tile links to /tools/<slug>", /^\/tools\/[a-z0-9-]+$/.test(tileHref ?? ""), { tileHref });
await page.reload();
check("grid persists across reload", await page.isVisible("ul[data-tool-rows]"), {});

// Keyboard: the row link takes focus and has a visible ring.
await page.click('[data-tools-view-set="list"]');
// From the layout toggle, Tab crosses the four sort buttons and lands on the first row.
await page.focus('[data-tools-view-set="grid"]');
await page.keyboard.press("Tab", { delay: 10 });
const stops = [];
for (let i = 0; i < 5; i++) {
  stops.push(await page.evaluate(() => document.activeElement?.textContent?.trim()));
  if (i < 4) await page.keyboard.press("Tab");
}
const ring = await page.evaluate(() => {
  const a = document.activeElement;
  return a?.classList.contains("row__link") ? getComputedStyle(a, "::after").outlineStyle : null;
});
check("Tab reaches the row link and it rings the row", ring === "solid", { stops, ring });

// Keep pages
for (const path of ["/tools/verdict/using", "/tools/category/agent-infra"]) {
  const res = await page.goto(`${BASE}${path}`);
  check(`${path} 200 with table`, res?.status() === 200 && (await page.$$eval("tbody tr", (r) => r.length)) > 0, { status: res?.status() });
}

await browser.close();
writeFileSync(OUT, JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2));
process.exit(results.every((r) => r.ok) ? 0 : 1);
