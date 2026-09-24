// Wrapped chip rows at 390 with touch: the visual gap between rows, the chip's
// hit area (elementFromPoint 21px above and below each chip's centre), and a shot.
// node qa/evidence/2026-09-24-vet-57/tags.mjs <label> [base]
import { chromium } from "playwright";

const label = process.argv[2] ?? "before";
const base = process.argv[3] ?? "http://localhost:4384";
const out = new URL(".", import.meta.url).pathname;
const rows = [
  ["/sites/", ".collections .collections", "sites-collections"],
  ["/sites/", ".hues__row", "sites-hues"],
  ["/sites/collection/landing-pages/", ".hues__row", "collection-hues"],
  ["/library/", ".ltags__list", "library-tags", ".ltags__sum"],
  ["/library/anatomy-of-an-agent-harness/", "ul.tags", "entry-tags"],
  ["/sites/about-brian-lovin/", ".facts .collections", "site-facts"],
];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
for (const [route, sel, name, open] of rows) {
  await page.goto(base + route, { waitUntil: "networkidle" });
  if (open) await page.locator(`${open} >> visible=true`).first().click();
  const row = page.locator(`${sel} >> visible=true`).first();
  if (!(await row.count()) || !(await row.isVisible())) { console.log(`${name}: ${sel} not visible`); continue; }
  await row.scrollIntoViewIfNeeded();
  const m = await row.evaluate((el) => {
    const kids = [...el.querySelectorAll("a, button, label")].filter((k) => k.getBoundingClientRect().height);
    const tops = [...new Set(kids.map((k) => Math.round(k.getBoundingClientRect().top)))].sort((a, b) => a - b);
    const h = kids[0] ? kids[0].getBoundingClientRect().height : 0;
    const gaps = tops.slice(1).map((t, i) => Math.round(t - tops[i] - h));
    // hit area: is the chip itself what a press 21px above / below its centre lands on?
    const hit = kids.every((k) => {
      const r = k.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      return [-21, 21].every((dy) => k.contains(document.elementFromPoint(x, y + dy)));
    });
    return { rows: tops.length, chipH: Math.round(h), gaps, hit44: hit, rowGap: getComputedStyle(el).rowGap };
  });
  console.log(`${name} ${JSON.stringify(m)}`);
  const box = await row.boundingBox();
  await page.screenshot({ path: `${out}tags-${label}-${name}.png`, clip: { x: 0, y: Math.max(0, box.y - 24), width: 390, height: box.height + 48 } });
}
await browser.close();
