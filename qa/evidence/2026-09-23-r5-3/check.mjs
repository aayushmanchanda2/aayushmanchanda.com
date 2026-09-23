// @ts-nocheck: a one-off evidence script, not site code.
// VET-267 scripted checks: library tags (AND, URL, persist, Clear), month
// headers, j/k over headers, and the ⌘K empty state. Run from the repo root:
//   node qa/evidence/2026-09-23-r5-3/check.mjs [base]
// Writes check.json next to itself; exit 1 on any failed check.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:4331";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "check.json");
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name} ${JSON.stringify(detail)}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pane = "nav[data-pane]";
// FILTER sets each row's `search`, which rewrites its href absolute.
const path = (href) => new URL(href, BASE).pathname;
const shownRows = () =>
  page.$$eval(`${pane} [data-rows] > li[data-kind]:not([hidden])`, (rows) => rows.map((r) => r.dataset.tags));
const heads = () =>
  page.$$eval(`${pane} [data-rows] > li[data-month]`, (rows) =>
    rows.map((r) => ({ text: r.textContent.replace(/\s+/g, " ").trim(), hidden: r.hidden })),
  );
const paneCount = () => page.textContent(`${pane} [data-filter-count]`);

/* --- tags ------------------------------------------------------------- */

await page.goto(`${BASE}/library`);
const first = await page.getAttribute(`${pane} [data-rows] > li[data-kind] > a`, "href");
await page.goto(`${BASE}${path(first)}`);
await page.click(`${pane} .ltags__sum`);
const box = (slug) => `${pane} label:has(input[data-tag-set][value="${slug}"])`; // the chip a reader presses
await page.click(box("agents"));
// The second tag: any other with a non-zero count under the first, fewer than all.
const second = await page.$$eval(`${pane} input[data-tag-set]`, (inputs) => {
  const all = document.querySelectorAll('nav[data-pane] [data-rows] > li[data-kind]:not([hidden])').length;
  const pick = inputs.find((i) => i.value !== "agents" && +i.parentNode.querySelector("[data-tag-count]").textContent > 0 && +i.parentNode.querySelector("[data-tag-count]").textContent < all);
  return pick?.value;
});
await page.click(`${pane} .ltags__more > summary`).catch(() => {});
await page.click(box(second));
const url = new URL(page.url());
const rows2 = await shownRows();
const both = rows2.every((t) => ` ${t} `.includes(" agents ") && ` ${t} `.includes(` ${second} `));
check("two tags filter with AND and update the URL", url.search === `?tags=agents,${second}` && rows2.length > 0 && both, {
  search: url.search,
  shown: rows2.length,
  count: await paneCount(),
});

const chips = await page.$$eval(`${pane} [data-tag-chips] button`, (b) => b.map((x) => x.getAttribute("aria-label")));
check("selected tags show as chips plus Clear", chips.length === 3 && chips[2] === "Clear tags", { chips });

const target = await page.$eval(`${pane} [data-rows] > li[data-kind]:not([hidden]) > a:not([aria-current])`, (a) => a.getAttribute("href")).catch(() => null);
if (target) await page.click(`${pane} a[href="${target}"]`); // the attribute as it is
else await page.click(`${pane} [data-rows] > li[data-kind]:not([hidden]) > a`);
await page.waitForLoadState("load");
const after = new URL(page.url());
const checked = await page.$$eval(`${pane} input[data-tag-set]:checked`, (i) => i.map((x) => x.value));
check("tags persist when clicking into an entry", after.search === `?tags=agents,${second}` && (await shownRows()).length === rows2.length && checked.length === 2, {
  url: after.pathname + after.search,
  checked,
  shown: (await shownRows()).length,
});

await page.click(`${pane} [data-tag-chips] button[aria-label="Clear tags"]`);
check("Clear resets", new URL(page.url()).search === "" && (await shownRows()).length === 139, {
  search: new URL(page.url()).search,
  shown: (await shownRows()).length,
  focused: await page.evaluate(() => document.activeElement?.className),
});

/* --- months ------------------------------------------------------------ */

const allHeads = await heads();
await page.click(`${pane} [data-kind-set="video"]`);
const videoHeads = await heads();
const videoRows = (await shownRows()).length;
const sum = videoHeads.filter((h) => !h.hidden).reduce((n, h) => n + Number(h.text.split("·")[1]), 0);
check("month headers show and recount with the filters", allHeads[0]?.text === "September 2026 · 91" && JSON.stringify(allHeads) !== JSON.stringify(videoHeads) && sum === videoRows, {
  all: allHeads,
  video: videoHeads,
  videoRows,
});
await page.click(`${pane} [data-kind-set=""]`);

/* --- j/k skip the headers ------------------------------------------------ */

// On /library the pane's j and k move the roving stop: walk across the
// September/August boundary and never land on a header.
await page.goto(`${BASE}/library`);
await page.focus(`${pane} [data-rows] > li[data-kind] > a`);
const walk = [];
for (let i = 0; i < 95; i++) {
  await page.keyboard.press("j");
  walk.push(await page.evaluate(() => document.activeElement?.parentElement?.hasAttribute("data-kind") ?? false));
}
const landed = await page.evaluate(() => document.activeElement?.textContent.trim().slice(0, 40));
// On an entry page j is "next entry": from the last September row it goes to
// the first August row, past the header.
const edge = await page.$$eval(`${pane} [data-rows] > li`, (items) => {
  const i = items.findIndex((li, n) => n > 0 && li.hasAttribute("data-month"));
  return { last: items[i - 1].firstElementChild.getAttribute("href"), next: items[i + 1].firstElementChild.getAttribute("href") };
});
edge.last = path(edge.last);
edge.next = path(edge.next);
await page.goto(`${BASE}${edge.last}`);
await page.focus(`${pane} a[aria-current="page"]`);
await page.keyboard.press("j");
await page.waitForURL((u) => u.pathname === edge.next, { timeout: 5000 }).catch(() => {});
check("j/k skip the headers", walk.every(Boolean) && new URL(page.url()).pathname === edge.next, {
  indexSteps: walk.length,
  allOnRows: walk.every(Boolean),
  landed,
  entryPage: { from: edge.last, to: new URL(page.url()).pathname, expected: edge.next },
});

/* --- ⌘K ------------------------------------------------------------------ */

await page.goto(`${BASE}/about`);
await page.keyboard.press("Meta+k");
await page.waitForSelector(".palette__group", { timeout: 5000 });
const groups = await page.$$eval("[data-palette-results] [role=group]", (g) =>
  g.map((x) => ({ label: document.getElementById(x.getAttribute("aria-labelledby"))?.textContent, rows: x.querySelectorAll("[role=option]").length })),
);
check("⌘K opens with all 5 groups before typing", groups.map((g) => g.label).join("|") === "Go to|Browse|Recent saves|Actions|Try searching", { groups });

const activeGroup = () =>
  page.evaluate(() => {
    const id = document.querySelector("[data-palette-input]").getAttribute("aria-activedescendant");
    const row = document.getElementById(id);
    return { title: row?.querySelector(".palette__row-title")?.textContent, group: row?.closest("[role=group]")?.dataset.group };
  });
const start = await activeGroup();
for (let i = 0; i < groups[0].rows; i++) await page.keyboard.press("ArrowDown");
const crossed = await activeGroup();
await page.keyboard.press("ArrowUp");
const back = await activeGroup();
check("arrows cross the groups", start.group === "Go to" && crossed.group === "Browse" && back.group === "Go to", { start, crossed, back });

const query = await page.getAttribute("[data-palette-query]", "data-palette-query");
await page.click("[data-palette-query]");
const filled = await page.inputValue("[data-palette-input]");
const typedRows = await page.$$eval("[data-palette-results] [role=option]", (r) => r.length);
const typedGroups = await page.$$eval("[data-palette-results] [role=group]", (r) => r.length);
check("a Try searching item fills the input", filled === query && typedRows > 0 && typedGroups === 0, { query, filled, typedRows });

const theme0 = await page.getAttribute("html", "data-theme");
await page.fill("[data-palette-input]", "");
await page.click('[data-palette-action="theme"]');
const theme1 = await page.getAttribute("html", "data-theme");
const themeTitle = await page.textContent('[data-palette-action="theme"] .palette__row-title');
check("the theme action switches the theme in place", theme0 !== theme1 && themeTitle === `Theme: ${theme1}`, { theme0, theme1, themeTitle });
await page.evaluate(() => localStorage.removeItem("theme"));

/* --- Browse deep links ---------------------------------------------------- */

const browse = await page.$$eval('[data-palette-results] [role=group][data-group="Browse"] a', (a) =>
  a.map((x) => ({ href: x.getAttribute("href"), title: x.querySelector(".palette__row-title").textContent, sub: x.querySelector(".palette__row-sub").textContent })),
);
const landings = [];
for (const link of browse) {
  const response = await page.goto(`${BASE}${link.href}`);
  const n = Number(link.sub.match(/(\d+)/)[1]);
  let shown;
  if (link.href.startsWith("/tools?verdict=")) {
    const verdict = link.href.split("=")[1];
    const rows = await page.$$eval("tr[data-tool]:not([hidden])", (r) => r.map((x) => x.dataset.verdict));
    shown = rows.length === n && rows.every((v) => v === verdict) && (await page.inputValue('[data-filter="verdict"]')) === verdict;
  } else if (link.href.startsWith("/library/kind/")) {
    const kind = link.href.split("/").pop();
    const rows = await page.$$eval(`${pane} [data-rows] > li[data-kind]:not([hidden])`, (r) => r.map((x) => x.dataset.kind));
    shown = rows.length === n && rows.every((k) => k === kind);
  } else {
    const h1 = (await page.textContent("h1")).trim().toLowerCase();
    shown = h1.includes(link.title.toLowerCase());
  }
  landings.push({ href: link.href, status: response.status(), shown });
}
check("each Browse deep link lands on the filtered view", landings.length > 0 && landings.every((l) => l.status === 200 && l.shown), { landings });

await browser.close();
writeFileSync(OUT, JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2) + "\n");
process.exit(results.every((r) => r.ok) ? 0 : 1);
