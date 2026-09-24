// E1: the phone list in both variants at 390, light, top of page and scrolled.
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:4364";
const out = new URL("./", import.meta.url).pathname;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, colorScheme: "light" });
const page = await ctx.newPage();
for (const v of ["inset", "plain"]) {
  await page.goto(`${base}/library`, { waitUntil: "networkidle" });
  await page.evaluate((v) => { localStorage.theme = "light"; document.querySelector("[data-notes]").dataset.notes = v; }, v);
  await page.screenshot({ path: `${out}e1-${v}-top.png` });
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}e1-${v}-scrolled.png` });
}
await browser.close();
