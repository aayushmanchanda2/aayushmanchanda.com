// The static /sites/<slug> page at 375x812, touch: swipe down the middle of the screen until the page stops, report where the shot ends up.
import { chromium, devices } from "playwright";
const [base = "http://127.0.0.1:4340", label = "static", slug = "mother-design-brand-strategy-and-design"] = process.argv.slice(2);
const OUT = new URL(".", import.meta.url).pathname;
const browser = await chromium.launch();
const context = await browser.newContext({ userAgent: devices["iPhone 13"]?.userAgent, viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await page.goto(`${base}/sites/${slug}`);
await page.waitForTimeout(500);
const state = () => page.evaluate(() => {
  const s = document.querySelector(".scroller");
  const img = s?.querySelector("img");
  const r = img?.getBoundingClientRect();
  return { pageY: Math.round(scrollY), pageMax: document.documentElement.scrollHeight - innerHeight, scroller: s ? { top: Math.round(s.scrollTop), max: s.scrollHeight - s.clientHeight, h: s.clientHeight } : null, imgBottom: r ? Math.round(r.bottom) : null, imgH: r ? Math.round(r.height) : null, shotEndSeen: r ? r.bottom <= innerHeight : null };
});
const trail = [await state()];
let seen = false;
for (let i = 0; i < 40; i++) {
  await cdp.send("Input.synthesizeScrollGesture", { x: 187, y: 600, yDistance: -500, speed: 3000, gestureSourceType: "touch" });
  await page.waitForTimeout(200);
  const now = await state();
  seen ||= now.shotEndSeen;
  trail.push(now);
  if (now.pageY === now.pageMax && (!now.scroller || now.scroller.top >= now.scroller.max - 1)) break;
}
await page.screenshot({ path: `${OUT}${label}-375-end.png` });
console.log(JSON.stringify({ slug, first: trail[0], last: trail.at(-1), swipes: trail.length - 1, shotBottomSeen: seen }, null, 1));
await browser.close();
