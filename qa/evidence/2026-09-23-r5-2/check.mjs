// R5-2 scripted checks: panel on /tools and /sites, keys, history, filter gap.
// Run from the repo root: node qa/evidence/2026-09-23-r5-2/check.mjs http://localhost:4331
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4331";
const results = [];
const record = (name, pass, detail) => results.push({ name, pass: Boolean(pass), ...detail });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const state = () =>
  page.evaluate(() => ({
    path: location.pathname,
    search: location.search,
    open: document.querySelector("[data-detail-panel]")?.hasAttribute("data-open") ?? false,
    slug: document.querySelector("[data-detail-panel] [data-detail]")?.getAttribute("data-slug") ?? null,
    historyLength: history.length,
  }));
const settle = () => page.waitForTimeout(350);
const waitSlug = (slug) =>
  page.waitForFunction((s) => document.querySelector("[data-detail-panel] [data-detail]")?.getAttribute("data-slug") === s, slug);

/** The slug ± one step from `slug`, among the visible triggers, computed independently of the panel. */
const expected = (slug, dir) =>
  page.evaluate(
    ([s, d]) => {
      const all = [...document.querySelectorAll("a[data-panel-open]")];
      const shown = (a) => a.checkVisibility();
      const holds = (a) => (a.dataset.slugs ?? a.pathname.split("/").pop()).split(" ").includes(s);
      // The view on screen: the list whose items include a visible trigger.
      const view = all.find(shown).closest("tbody, ul");
      const ring = all.filter((a) => view.contains(a));
      const from = ring.findIndex(holds);
      for (let i = 1; i < ring.length; i++) {
        const a = ring[(from + d * i + ring.length * 2) % ring.length];
        if (shown(a)) return a.pathname.split("/").pop();
      }
      return null;
    },
    [slug, dir],
  );

async function openFirst(selector) {
  await page.locator(selector).first().click();
  await page.waitForSelector("[data-detail-panel][data-open] [data-detail]");
  await settle();
  return state();
}

async function arrows(label) {
  await page.focus("[data-detail-panel]");
  const start = (await state()).slug;
  const next = await expected(start, 1);
  await page.keyboard.press("ArrowRight");
  await waitSlug(next).catch(() => {});
  const afterRight = await state();
  record(`${label}: → goes to the next visible item`, afterRight.slug === next && afterRight.path.endsWith(`/${next}`), { from: start, expected: next, got: afterRight.slug, path: afterRight.path });
  const prev = await expected(afterRight.slug, -1);
  await page.keyboard.press("ArrowLeft");
  await waitSlug(prev).catch(() => {});
  const afterLeft = await state();
  record(`${label}: ← goes to the previous visible item`, afterLeft.slug === prev, { expected: prev, got: afterLeft.slug });
}

/* --- /tools, list ------------------------------------------------------- */
await page.goto(`${base}/tools`);
await page.evaluate(() => localStorage.setItem("tools-view", "list"));
await page.goto(`${base}/tools`);
const h0 = (await state()).historyLength;
let s = await openFirst("tr:not([hidden]) a[data-panel-open]");
record("tools: row opens the panel, URL is /tools/<slug>", s.open && s.path === `/tools/${s.slug}`, s);

const layout = await page.evaluate(() => {
  const panel = document.querySelector("[data-detail-panel]").getBoundingClientRect();
  const right = (sel) => document.querySelector(sel).getBoundingClientRect().right;
  return { panelLeft: panel.left, verdictRight: right("#filter-verdict"), categoryRight: right("#filter-category"), toggleRight: right("[data-view-set=\"grid\"]") };
});
record("tools: filters and toggle stay beside the open panel", layout.toggleRight < layout.panelLeft && layout.categoryRight < layout.panelLeft, layout);

// Swap in place: another row, same history entry.
const first = s.slug;
await page.locator("tr:not([hidden]) a[data-panel-open]").nth(3).click({ position: { x: 5, y: 5 } });
await page.waitForFunction((f) => document.querySelector("[data-detail-panel] [data-detail]")?.getAttribute("data-slug") !== f, first);
s = await state();
record("tools: another row swaps the content in place", s.open && s.slug !== first && s.historyLength === h0 + 1, s);

// Filter while open, hiding the open item.
const openVerdict = await page.evaluate((slug) => document.querySelector(`tr a[href="/tools/${slug}"]`).closest("tr").dataset.verdict, s.slug);
const other = await page.evaluate((v) => [...document.querySelectorAll("#filter-verdict option")].map((o) => o.value).find((x) => x && x !== v), openVerdict);
await page.selectOption("#filter-verdict", other);
await settle();
const filtered = await state();
const rowsShown = await page.evaluate(() => document.querySelectorAll("tr[data-tool]:not([hidden])").length);
record("tools: verdict filter works while open and the panel stays on its item", filtered.open && filtered.slug === s.slug && filtered.search.includes(`verdict=${other}`) && rowsShown > 0, { ...filtered, verdict: other, rowsShown });

// Keys inside a select do nothing to the panel.
await page.focus("#filter-verdict");
const before = await state();
for (const key of ["ArrowRight", "ArrowLeft", "Escape"]) await page.keyboard.press(key);
await settle();
const afterSelect = await state();
record("tools: ←/→/Esc inside a select do nothing to the panel", afterSelect.open && afterSelect.slug === before.slug, { before: before.slug, after: afterSelect.slug });

await arrows("tools list (filtered, open item hidden)");

await page.keyboard.press("Escape");
await settle();
s = await state();
record("tools: Esc closes (URL back to /tools, filter kept)", !s.open && s.path === "/tools", s);

// Fresh: open then Esc gives exactly /tools.
await page.goto(`${base}/tools`);
await openFirst("tr:not([hidden]) a[data-panel-open]");
await page.keyboard.press("Escape");
await settle();
s = await state();
record("tools: Esc after open returns the URL to /tools", !s.open && `${s.path}${s.search}` === "/tools", s);

// Back after opening closes.
await openFirst("tr:not([hidden]) a[data-panel-open]");
await page.goBack();
await settle();
s = await state();
record("tools: Back after opening closes the panel", !s.open && s.path === "/tools", s);
await page.goForward();
await settle();
s = await state();
record("tools: Forward reopens it", s.open && s.path === `/tools/${s.slug}`, s);

/* --- /tools, grid -------------------------------------------------------- */
await page.goto(`${base}/tools`);
await page.click('[data-view-set="grid"]');
s = await openFirst("li:not([hidden]) a.tile__link[data-panel-open]");
record("tools grid: tile opens the panel, URL is /tools/<slug>", s.open && s.path === `/tools/${s.slug}`, s);
await arrows("tools grid");

/* --- /sites --------------------------------------------------------------- */
await page.goto(`${base}/sites`);
s = await openFirst("a[data-panel-open]:visible");
record("sites: card opens the panel, URL is /sites/<slug>", s.open && s.path === `/sites/${s.slug}`, s);
await arrows("sites");
await page.keyboard.press("Escape");
await settle();
s = await state();
record("sites: Esc closes, URL back to /sites", !s.open && s.path === "/sites", s);
await openFirst("a[data-panel-open]:visible");
await page.goBack();
await settle();
s = await state();
record("sites: Back after opening closes the panel", !s.open && s.path === "/sites", s);

/* --- filter-to-header gap ------------------------------------------------ */
for (const width of [390, 1280, 1600]) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${base}/tools`);
  await page.evaluate(() => localStorage.setItem("tools-view", "list"));
  await page.goto(`${base}/tools`);
  const gap = await page.evaluate(() => {
    const controls = document.querySelector(".controls").getBoundingClientRect();
    const head = document.querySelector(".dtable thead").getBoundingClientRect();
    return Math.round((head.top - controls.bottom) * 100) / 100;
  });
  record(`tools: controls-to-header gap at ${width}`, gap >= 16, { width, gap });
}

await browser.close();
const failed = results.filter((r) => !r.pass);
writeFileSync(new URL("./check.json", import.meta.url), JSON.stringify({ base, date: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }, null, 2));
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}`);
process.exit(failed.length ? 1 : 0);
