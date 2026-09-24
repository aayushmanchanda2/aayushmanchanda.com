// G8: at tablet sizes with touch, a finger drag on the left pane scrolls the pane
// (not the page), and a drag on the detail scrolls the detail side.
// node qa/evidence/2026-09-24-vet-284/pane-scroll.mjs [base]
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4384";
const sizes = [[768, 1024], [820, 1180], [1024, 1366]];
const routes = ["/library/", "/library/kind/article/", "/library/kind/post/", "/library/kind/video/", "/library/she-left-waterloo-without-graduating-now-she-s-a-member-of-t/"];
const browser = await chromium.launch();
let fails = 0;
for (const [width, height] of sizes) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await context.addInitScript(() => sessionStorage.clear());
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  for (const route of routes) {
    await page.goto(base + route, { waitUntil: "networkidle" });
    const box = await page.locator("[data-pane]").boundingBox();
    if (!box || box.width === 0) {
      // Under 48rem of the split the pane hides and the page is one column: its only scroller is the page.
      const split = await page.evaluate(() => document.querySelector(".split")?.getBoundingClientRect().width);
      await cdp.send("Input.synthesizeScrollGesture", { x: width / 2, y: height * 0.7, yDistance: -500, gestureSourceType: "touch", speed: 1200 });
      const y = await page.evaluate(() => scrollY);
      const ok = split < 768 && y > 100;
      if (!ok) fails++;
      console.log(`${ok ? "ok  " : "FAIL"} ${width}x${height} ${route} one column (split ${split}px < 768): no pane; a drag scrolls the page 0->${y}`);
      continue;
    }
    const state = () => page.evaluate(() => { const p = document.querySelector("[data-pane]"); return { pane: Math.round(p.scrollTop), max: p.scrollHeight - p.clientHeight, page: Math.round(scrollY) }; });
    const drag = (x, y) => cdp.send("Input.synthesizeScrollGesture", { x, y, yDistance: -500, gestureSourceType: "touch", speed: 1200 }).then(() => page.waitForTimeout(400));
    const px = box.x + box.width / 2, py = box.y + box.height * 0.7;
    const before = await state();
    if (before.max <= 0) { console.log(`ok   ${width}x${height} ${route} the pane's rows fit (kind-filtered), nothing to scroll`); continue; }
    await drag(px, py);
    const after = await state();
    // Past its end: a drag on the pane must not carry on into the page.
    await page.evaluate(() => { const p = document.querySelector("[data-pane]"); p.scrollTop = p.scrollHeight; });
    const end = await state();
    await drag(px, py);
    const chained = await state();
    // The detail side: drag there, the pane must stay where it is.
    await drag(box.x + box.width + (width - box.x - box.width) / 2, height * 0.7);
    const detail = await state();
    const ok = after.pane > before.pane + 100 && after.page === before.page && chained.page === end.page && detail.pane === chained.pane;
    if (!ok) fails++;
    console.log(`${ok ? "ok  " : "FAIL"} ${width}x${height} ${route} pane drag: pane ${before.pane}->${after.pane}, page ${before.page}->${after.page}; at pane end: page ${end.page}->${chained.page}; detail drag: page ${chained.page}->${detail.page}, pane ${chained.pane}->${detail.pane}`);
  }
  await context.close();
}
await browser.close();
console.log(fails ? `${fails} failed` : "all ok");
process.exitCode = fails ? 1 : 0;
