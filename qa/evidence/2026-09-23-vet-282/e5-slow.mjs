// E5: the palette's opening frames at 1/20 speed, with /search.json held 400ms.
// Usage: node e5-slow.mjs <base> <label> [mobile]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const [base, label, mobile] = process.argv.slice(2);
const out = new URL(`./e5-${label}-slow/`, import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext(mobile ? { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
await page.route("**/search.json", async (route) => { await new Promise((r) => setTimeout(r, 400)); await route.continue(); });
await page.goto(`${base}/library`, { waitUntil: "networkidle" });
const cdp = await context.newCDPSession(page);
await cdp.send("Animation.enable");
await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.05 });
const t0 = Date.now();
if (mobile) await page.evaluate(() => document.querySelector("[data-palette-open]").click());
else await page.keyboard.press("Meta+k");
for (let i = 0; i < 12; i++) {
  await page.screenshot({ path: `${out}s-${String(i).padStart(2, "0")}-${Date.now() - t0}ms.png`, animations: "allow" });
  await page.waitForTimeout(120);
}
await browser.close();
