// Is the blank band in mid-fling shots the capture or the page? Sample the mat's box per frame
// and capture through CDP from the surface, before and after the H3 CSS (CSS env toggles the old canvas).
import { chromium, devices } from "playwright";
const base = process.argv[2] ?? "http://localhost:4391";
const OUT = new URL(".", import.meta.url).pathname;
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPad (gen 7)"] });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await page.goto(base + "/sites/about-brian-lovin/", { waitUntil: "networkidle" });
if (process.env.OLD) await page.addStyleTag({ content: ":root{background:var(--mat)!important}" });
await page.evaluate(() => { window.__rects = []; const f = () => { const r = document.querySelector(".mat").getBoundingClientRect(); window.__rects.push([Math.round(r.top), Math.round(r.height), Math.round(scrollY)]); if (window.__rects.length < 90) requestAnimationFrame(f); }; requestAnimationFrame(f); });
const flying = cdp.send("Input.synthesizeScrollGesture", { x: 405, y: 860, yDistance: -3000, speed: 2500, gestureSourceType: "touch" });
for (let i = 0; i < 3; i++) {
  await page.waitForTimeout(80);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  (await import("node:fs")).writeFileSync(`${OUT}fling-cdp-${process.env.OLD ? "old" : "new"}-${i}.png`, Buffer.from(data, "base64"));
}
await flying;
const rects = await page.evaluate(() => window.__rects);
console.log(process.env.OLD ? "old" : "new", "mat top/height per frame all 0/viewport:", rects.every(([t, h]) => t === 0 && h === 1080), "frames", rects.length, "scrollY", rects[0][2], "->", rects.at(-1)[2]);
await browser.close();
