// Scripted checks for Wave A Fix 1. Run from repo root: node qa/evidence/2026-09-22-qa-fix-1/checks.mjs <base> <slug>
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const [base, slug] = process.argv.slice(2);
const out = {};
const browser = await chromium.launch();
const at = async (w, h, opts = {}) => (await browser.newContext({ viewport: { width: w, height: h }, ...opts })).newPage();

// E: Tab from the top of /library/<slug> at 1280 until focus leaves the bar and the pane.
{
  const page = await at(1280, 800);
  await page.goto(`${base}/library/${slug}`);
  const stops = [];
  for (let i = 1; i <= 20; i++) {
    await page.keyboard.press("Tab");
    const f = await page.evaluate(() => {
      const a = document.activeElement;
      return { text: (a?.textContent ?? "").trim().slice(0, 40), inPane: !!a?.closest("[data-pane]"), inMain: !!a?.closest("main"), current: a?.getAttribute("aria-current") };
    });
    stops.push(f);
    if (f.inMain) { out.tabToEntry = { presses: i, stops }; break; }
  }
  out.paneTabStops = stops.filter((s) => s.inPane).length;
  out.skipLinkFirst = stops[0]?.text;
  // Up/Down/Home/End in the pane.
  await page.goto(`${base}/library/${slug}`);
  await page.locator('[data-pane] a[aria-current="page"]').focus();
  const idx = () => page.evaluate(() => [...document.querySelectorAll("[data-pane] a")].indexOf(document.activeElement));
  const start = await idx();
  await page.keyboard.press("ArrowDown"); const down = await idx();
  await page.keyboard.press("ArrowUp"); const up = await idx();
  await page.keyboard.press("End"); const end = await idx();
  await page.keyboard.press("Home"); const home = await idx();
  const zeroes = await page.evaluate(() => [...document.querySelectorAll("[data-pane] a")].filter((a) => a.tabIndex === 0).length);
  out.paneKeys = { start, down, up, end, home, linksAtTabindex0: zeroes };
  // Enter follows the focused link.
  await page.keyboard.press("ArrowDown");
  const want = await page.evaluate(() => document.activeElement.getAttribute("href"));
  await Promise.all([page.waitForURL((u) => u.pathname === want), page.keyboard.press("Enter")]);
  out.enterFollows = { want, got: new URL(page.url()).pathname };
}

// C: j on body does nothing; j inside the pane navigates.
{
  const page = await at(1280, 800);
  await page.goto(`${base}/library/${slug}`);
  await page.locator("h1").click();
  await page.keyboard.press("j");
  await page.waitForTimeout(800);
  out.jOnBody = { navigated: !page.url().endsWith(`/library/${slug}`), url: page.url() };
  await page.locator('[data-pane] a[aria-current="page"]').focus();
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith(slug), { timeout: 5000 }), page.keyboard.press("j")]);
  out.jInPane = { navigated: true, url: page.url() };
}

// D, G, B at 390.
{
  const page = await at(390, 844);
  await page.goto(`${base}/tools`);
  out.select390 = await page.$$eval(".select", (els) => els.map((e) => [getComputedStyle(e).fontSize, e.getBoundingClientRect().height]));
  out.chipFontSize = await page.$eval(".chip", (e) => getComputedStyle(e).fontSize);
  out.verdictOptions = await page.$$eval("#filter-verdict option", (o) => o.map((x) => x.textContent));
  const heads = await page.getByRole("columnheader").allInnerTexts();
  const rows = page.getByRole("row");
  const firstBodyCells = await rows.nth(1).getByRole("cell").count();
  out.table390 = { tableRole: await page.getByRole("table").count(), columnheaders: heads.length, heads, firstRowCells: firstBodyCells, rows: await rows.count() };
  out.table390.snapshot = (await page.getByRole("table").ariaSnapshot()).split("\n").slice(0, 14).join("\n");
}
{
  const page = await at(390, 844, { hasTouch: true, isMobile: true });
  await page.goto(`${base}/tools`);
  out.selectCoarse = await page.$$eval(".select", (els) => els.map((e) => e.getBoundingClientRect().height));
  await page.goto(`${base}/library/${slug}`);
  out.hintKeyTouch = await page.$$eval(".hint__key", (els) => els.map((e) => getComputedStyle(e).display));
}
await browser.close();
writeFileSync(new URL("./checks.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
