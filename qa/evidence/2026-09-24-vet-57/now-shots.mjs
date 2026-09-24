// /now at 390 / 1280 / 1600 light and 1280 dark: the viewport at the top and scrolled to the end.
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:4384";
const out = new URL(".", import.meta.url).pathname;
const browser = await chromium.launch();
for (const [w, h, theme, touch] of [[390, 844, "light", true], [1280, 800, "light"], [1600, 900, "light"], [1280, 800, "dark"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, isMobile: !!touch, hasTouch: !!touch, reducedMotion: "reduce" });
  await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} }, theme);
  const page = await ctx.newPage();
  await page.goto(base + "/now/", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}now-${w}-${theme}.png` });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}now-${w}-${theme}-end.png` });
  await ctx.close();
}
await browser.close();
