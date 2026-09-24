// Sideways overflow in states a load alone does not reach: scrolled to the end,
// grid view, a hue filter, the menu open, and a full-page capture's width.
// node qa/evidence/2026-09-24-vet-57/probe-states.mjs [base]
import { chromium, webkit } from "playwright";

const base = process.argv[2] ?? "http://localhost:4384";
const measure = () => {
  const de = document.documentElement;
  window.scrollTo(400, window.scrollY);
  const x = window.scrollX;
  window.scrollTo(0, window.scrollY);
  return { scrollW: de.scrollWidth, bodyScrollW: document.body.scrollWidth, vw: de.clientWidth, x, vv: visualViewport.width };
};
for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]]) {
  const browser = await engine.launch();
  for (const width of [320, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    for (const [route, act] of [
      ["/sites/", null],
      ["/sites/?hue=blue", null],
      ["/sites/", async () => page.click('[data-view-set="grid"]').catch(() => {})],
      ["/sites/", async () => page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))],
      ["/tools/", async () => page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))],
      ["/", async () => page.click("[data-mnav-toggle]")],
    ]) {
      await page.goto(base + route, { waitUntil: "networkidle" });
      if (act) { await act(); await page.waitForTimeout(400); }
      const m = await page.evaluate(measure);
      const shot = await page.screenshot({ fullPage: true });
      const pngWidth = shot.readUInt32BE(16);
      console.log(`${name} ${width} ${route}${act ? " +act" : ""} ${JSON.stringify(m)} fullPagePng=${pngWidth}`);
    }
    await ctx.close();
  }
  await browser.close();
}
