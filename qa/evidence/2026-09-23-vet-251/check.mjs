// VET-251 behaviour + shots: doodles draw on once, sit static under reduced
// motion and in print, shift no layout (CLS), overlap no text. Page shots at
// 1280 light/dark and 390. node qa/evidence/2026-09-23-vet-251/check.mjs http://localhost:4391
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:4391";
const OUT = new URL(".", import.meta.url).pathname;
const ROUTES = ["/", "/about", "/tools", "/sites", "/library", "/notes", "/experiments", "/computer", "/computer/talk-dont-type", "/notes/building-this-site", "/library/how-gumclaw-works"];
let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failed += 1; };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const offsets = (page) => page.$$eval("svg.doodle[data-draw] path", (ps) => ps.filter((p) => p.closest("svg").checkVisibility()).map((p) => getComputedStyle(p).strokeDashoffset));
const slug = (r) => r === "/" ? "home" : r.slice(1).replaceAll("/", "_");

// Visible doodle boxes that intersect a text rect outside their own mark.
const overlaps = (page) => page.evaluate(() => {
  const hits = [];
  const texts = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const n = walk.currentNode;
    if (!n.textContent.trim() || n.parentElement.closest("svg, script, style, [aria-hidden='true'], .sr-only")) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width && r.height) texts.push([r, n.parentElement]);
  }
  for (const svg of document.querySelectorAll("svg.doodle")) {
    const b = svg.getBoundingClientRect();
    if (!b.width || getComputedStyle(svg).display === "none") continue;
    const own = svg.closest(".mark");
    for (const [r, el] of texts) {
      if (own && own.contains(el)) continue;
      const x = Math.min(b.right, r.right) - Math.max(b.left, r.left);
      const y = Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top);
      if (x > 3 && y > 3) hits.push(`${svg.getAttribute("class")} on "${el.textContent.trim().slice(0, 30)}"`);
    }
  }
  return hits;
});

const browser = await chromium.launch();
try {
  // 1. Draw-on: armed below the fold, drawn when seen, once; CLS 0; no overlaps.
  for (const route of ROUTES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "no-preference" });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    const n = await page.$$eval("svg.doodle", (s) => s.length);
    for (const svg of await page.$$("svg.doodle[data-draw]")) { if (await svg.isVisible()) { await svg.scrollIntoViewIfNeeded(); await pause(150); } }
    await pause(1200);
    const drawn = await offsets(page);
    const shown = await page.$$eval("svg.doodle[data-draw]", (s) => s.filter((e) => e.checkVisibility()).map((e) => e.classList.contains("doodle--on")));
    ok(shown.every(Boolean) && drawn.every((o) => o === "0px" || o === "0"), `${route}: ${n} doodles, all visible ones drawn (${drawn.join(",")})`);
    await page.evaluate(() => window.scrollTo(0, 0)); await pause(300);
    ok((await offsets(page)).join() === drawn.join(), `${route}: still drawn after scrolling back (once)`);
    const cls = await page.evaluate(() => window.__cls);
    ok(cls === 0, `${route}: CLS ${cls}`);
    const hits = await overlaps(page);
    ok(hits.length === 0, `${route}: no doodle on text ${hits.join(" | ")}`);
    await ctx.close();
  }

  // 2. Armed state on the home page: the arrow below the fold waits.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 500 }, reducedMotion: "no-preference" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const arrow = page.locator(".index__arrow path").first();
    const before = await arrow.evaluate((p) => getComputedStyle(p).strokeDashoffset);
    ok(before === "1.05px" || before === "1.05", `home arrow armed below the fold (${before})`);
    await page.locator(".index__arrow").scrollIntoViewIfNeeded();
    await pause(250);
    const mid = await arrow.evaluate((p) => parseFloat(getComputedStyle(p).strokeDashoffset));
    ok(mid > 0 && mid < 1.05, `home arrow mid-draw at 250ms (${mid})`);
    await ctx.close();
  }

  // 3. Reduced motion + print: static and whole, nothing toggles.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 500 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    ok((await offsets(page)).every((o) => o === "0px" || o === "0"), "reduced motion: every mark whole on load");
    await page.locator(".index__arrow").scrollIntoViewIfNeeded(); await pause(300);
    ok(await page.$$eval("svg.doodle", (s) => s.every((e) => !e.classList.contains("doodle--on"))), "reduced motion: observer never runs");
    await ctx.close();
    const pctx = await browser.newContext({ reducedMotion: "no-preference" });
    const pp = await pctx.newPage();
    await pp.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await pp.emulateMedia({ media: "print" });
    // Print drops the dash pattern outright, so a line mid-draw prints whole.
    const dashes = await pp.$$eval("svg.doodle path", (ps) => ps.map((p) => getComputedStyle(p).strokeDasharray));
    ok(dashes.every((d) => d === "none"), `print: no dash pattern on any mark (${dashes.join(",")})`);
    await pctx.close();
  }

  // 4. Shots after the draw: 1280 light/dark, 390 light/dark.
  for (const [w, h, theme] of [[1280, 800, "light"], [1280, 800, "dark"], [390, 844, "light"], [390, 844, "dark"]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, reducedMotion: "reduce", deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    for (const route of ROUTES) {
      await page.goto(BASE + route, { waitUntil: "networkidle" });
      await page.screenshot({ path: `${OUT}${slug(route)}-${w}-${theme}.png` });
      const hits = await overlaps(page);
      ok(hits.length === 0, `${route} ${w} ${theme}: no doodle on text ${hits.join(" | ")}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
