// Element shots of the /design sections VET-307 added. node qa/evidence/2026-09-24-vet-307/sections.mjs [base]
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:4391";
const dir = new URL(".", import.meta.url).pathname;
const browser = await chromium.launch();
for (const [w, theme] of [[1280, "light"], [390, "dark"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: theme });
  await ctx.addInitScript((t) => localStorage.setItem("theme", t), theme);
  const page = await ctx.newPage();
  await page.goto(`${base}/design/`, { waitUntil: "networkidle" });
  for (const name of ["Entries", "Lists", "Frame"]) {
    // Full-page shot clipped to the section: an element shot scrolls, which drags the fixed mat edges and sticky heads into the crop.
    const sec = page.locator("section", { has: page.locator("h2", { hasText: new RegExp(`^${name}$`) }) });
    await sec.scrollIntoViewIfNeeded();
    await page.evaluate(() => scrollTo(0, 0));
    const box = await sec.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height }; });
    await page.screenshot({ path: `${dir}design-${name.toLowerCase()}-${w}-${theme}.png`, fullPage: true, clip: box, animations: "disabled" });
  }
  await ctx.close();
}
await browser.close();
