// VET-55 live proof. From the repo root, against the dev server (or any base):
//   node qa/evidence/2026-09-24-vet-55/check.mjs [base]
// Scripted check (Chromium): ?hue=blue shows exactly the cards whose palette is
// blue (lib/hues.ts), in grid and list; the chip is aria-current; a press on a
// list row still opens its entry (row-link.ts); the hue survives a reload; a
// collection chip carries it and the collection page filters its subset; the
// on chip clears and every card comes back. Then the shots: 390 (Chromium
// phone), 1024 (WebKit, touch), 1280, 1600 light, 1280 dark, 1280 forced
// colours, each with ?hue=blue. Writes check.json and the PNGs next to itself.
import { chromium, webkit } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

import { paletteFamilies } from "../../../src/lib/hues.ts";
import { groupByDomain } from "../../../src/lib/screens.ts";

const base = (process.argv[2] ?? "http://localhost:4321").replace(/\/$/, "");
const dir = new URL(".", import.meta.url).pathname;
const sites = JSON.parse(readFileSync("src/data/sites.json", "utf8"));
const report = { base, at: new Date().toISOString(), checks: [] };
const ok = (name, detail = "") => { report.checks.push({ name, ok: true, detail }); console.log("ok  ", name, detail); };
const pin = ([theme, view]) => { try { localStorage.setItem("theme", theme); localStorage.setItem("sites-view", view); } catch {} };

/** The slugs of the cards a filter should leave, off the same function the build uses. */
const expected = (list, hue) => groupByDomain(list).filter((g) => !hue || paletteFamilies(g.primary.palette).includes(hue)).map((g) => g.primary.slug).sort();
const shown = (page, sel) => page.$$eval(sel, (els) => els.filter((e) => !e.closest("[hidden]") && e.checkVisibility()).map((e) => e.getAttribute("href").split("/").pop().split("?")[0]).sort());

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
await ctx.addInitScript(pin, ["light", "grid"]);
const page = await ctx.newPage();

await page.goto(`${base}/sites?hue=blue`, { waitUntil: "networkidle" });
assert.deepEqual(await shown(page, "[data-sites-grid] .card__link"), expected(sites, "blue"));
assert.equal(await page.getAttribute('[data-hue-set="blue"]', "aria-current"), "true");
ok("?hue=blue on load: grid shows exactly the blue cards", `${expected(sites, "blue").length} of ${expected(sites, "").length}`);

await page.reload({ waitUntil: "networkidle" });
assert.deepEqual(await shown(page, "[data-sites-grid] .card__link"), expected(sites, "blue"));
ok("survives reload");

await page.click('[data-view-set="list"]');
assert.deepEqual(await shown(page, "[data-sites-list] .row__link"), expected(sites, "blue"));
ok("list view shows the same filtered set");
const first = expected(sites, "blue")[0];
await page.locator(`[data-sites-list] tr:has(a[href^="/sites/${first}"]) td`).last().click();
await page.waitForURL(new RegExp(`/sites/${first}\\?hue=blue`));
ok("row-link: a press on a filtered row opens its entry, hue kept", page.url().replace(base, ""));
await page.keyboard.press("Escape");
await page.waitForURL(/\/sites\?hue=blue$/);
await page.click('[data-view-set="grid"]');

const collection = sites.flatMap((s) => s.collections).find((c) => expected(sites.filter((s) => s.collections.includes(c)), "blue").length);
const chip = `[data-carry-hue] a[href*="/sites/collection/${collection}"]`;
const carried = new URL(await page.getAttribute(chip, "href"), base);
assert.equal(carried.pathname + carried.search, `/sites/collection/${collection}?hue=blue`);
await page.click(chip);
await page.waitForLoadState("networkidle");
const inCollection = sites.filter((s) => s.collections.includes(collection));
assert.deepEqual(await shown(page, "[data-sites-grid] .card__link"), expected(inCollection, "blue"));
ok("combines with a collection", `${collection}: ${expected(inCollection, "blue").length} of ${expected(inCollection, "").length}`);
await page.click('[data-hue-set="blue"]');
assert.equal(new URL(page.url()).search, "");
assert.deepEqual(await shown(page, "[data-sites-grid] .card__link"), expected(inCollection, ""));
ok("clearing on a collection restores its whole set");

await page.goto(`${base}/sites?hue=blue`, { waitUntil: "networkidle" });
await page.click('[data-hue-set="blue"]');
assert.equal(new URL(page.url()).search, "");
assert.equal(await page.$('[data-hue-filter] [aria-current]'), null);
assert.deepEqual(await shown(page, "[data-sites-grid] .card__link"), expected(sites, ""));
ok("clearing restores all", `${expected(sites, "").length} cards`);
assert.equal(await page.textContent("[data-hue-status]"), `All ${expected(sites, "").length} sites`);
await page.click('[data-hue-set="mono"]');
assert.deepEqual(await shown(page, "[data-sites-grid] .card__link"), expected(sites, "mono"));
ok("a second family (mono) filters too, status announces", await page.textContent("[data-hue-status]"));

await page.goto(`${base}/sites?hue=teal`, { waitUntil: "networkidle" });
assert.equal(await page.$('[data-hue-set="teal"]'), null);
assert.deepEqual(await shown(page, "[data-sites-grid] .card__link"), expected(sites, ""));
ok("a family with no sites has no chip, and ?hue=teal reads as All");
await ctx.close();

// ---------- shots ----------
const clip = async (p, name) => {
  await p.evaluate(() => document.querySelector("[data-hue-filter]").scrollIntoView({ block: "center" }));
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${dir}${name}.png`, animations: "disabled" });
};
const shots = [
  [chromium, "390-light", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, "light"],
  [webkit, "1024-webkit-touch-light", { viewport: { width: 1024, height: 1366 }, hasTouch: true }, "light"],
  [chromium, "1280-light", { viewport: { width: 1280, height: 800 } }, "light"],
  [chromium, "1600-light", { viewport: { width: 1600, height: 900 } }, "light"],
  [chromium, "1280-dark", { viewport: { width: 1280, height: 800 } }, "dark"],
  [chromium, "1280-forced", { viewport: { width: 1280, height: 800 }, forcedColors: "active" }, "light"],
];
for (const [engine, name, options, theme] of shots) {
  const b = engine === chromium ? browser : await webkit.launch();
  const c = await b.newContext({ ...options, reducedMotion: "reduce" });
  await c.addInitScript(pin, [theme, "grid"]);
  const p = await c.newPage();
  await p.goto(`${base}/sites?hue=blue`, { waitUntil: "networkidle" });
  if (options.hasTouch) {
    // 44px under a finger: probe 21px out from each chip's centre, up and down.
    const misses = await p.$$eval("[data-hue-set]", (chips) => chips.flatMap((chip) => {
      const r = chip.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      return [y - 21, y + 21].filter((py) => !chip.contains(document.elementFromPoint(x, py))).map((py) => `${chip.dataset.hueSet}@${Math.round(py - y)}`);
    }));
    assert.deepEqual(misses, []);
    ok(`${name}: every chip takes a press 21px above and below its centre (44px)`);
  }
  await clip(p, name);
  ok(`shot ${name}`);
  await c.close();
  if (b !== browser) await b.close();
}
await browser.close();
writeFileSync(`${dir}check.json`, JSON.stringify(report, null, 2));
