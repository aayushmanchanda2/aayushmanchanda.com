/**
 * VET-279 addendum: /sites and /tools on a phone at 375x812 with mobile
 * emulation (touch, isMobile), driven by real touch scroll gestures
 * (CDP `Input.synthesizeScrollGesture`), never wheel events.
 *
 *   node qa/evidence/2026-09-23-vet-279-scroll/probe.mjs <base> <label>
 *
 * For each index it taps the first tile or row, then swipes until nothing
 * moves, and reports: whether the panel opened, where the page and the panel
 * scrolled, whether the bottom of the site's screenshot came into view, and
 * what is painted just under the panel's bottom edge (list content there is
 * the "other tools in the background" bug).
 */
import { writeFileSync } from "node:fs";
import { chromium, devices } from "playwright";

const [base = "http://127.0.0.1:4340", label = "probe"] = process.argv.slice(2);
const OUT = new URL(".", import.meta.url).pathname;
const browser = await chromium.launch();
const context = await browser.newContext({ userAgent: devices["iPhone 13"]?.userAgent, viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const result = {};

const state = () =>
  page.evaluate(() => {
    const panel = document.querySelector("[data-detail-panel]");
    const open = panel?.hasAttribute("data-open") ?? false;
    const img = [...document.querySelectorAll(".scroller img")].find((el) => el.checkVisibility());
    const r = panel?.getBoundingClientRect();
    return {
      url: location.pathname,
      panelOpen: open,
      panelTop: open ? Math.round(panel.scrollTop) : null,
      pageY: Math.round(scrollY),
      pageMax: document.documentElement.scrollHeight - innerHeight,
      shotBottom: img ? Math.round(img.getBoundingClientRect().bottom) : null,
      listRowsOnPage: document.querySelectorAll("a[data-panel-open]").length,
      underPanel: open && r ? document.elementsFromPoint(187, Math.min(r.bottom + 2, innerHeight - 1)).slice(0, 3).map((el) => String(el.className || el.tagName)) : null,
    };
  });

for (const index of ["/sites/", "/tools/"]) {
  await page.goto(base + index);
  await Promise.all([page.waitForLoadState("load"), page.locator("a[data-panel-open]:visible").first().tap()]);
  await page.waitForTimeout(800);
  const start = await state();
  let shotSeen = false;
  let last = start;
  for (let i = 0; i < 40; i++) {
    await cdp.send("Input.synthesizeScrollGesture", { x: 187, y: 600, yDistance: -500, speed: 3000, gestureSourceType: "touch" });
    await page.waitForTimeout(200);
    const now = await state();
    shotSeen ||= now.shotBottom !== null && now.shotBottom <= 812;
    if (JSON.stringify(now) === JSON.stringify(last)) break;
    last = now;
  }
  result[index] = { start, end: last, shotBottomSeen: shotSeen };
  await page.screenshot({ path: `${OUT}${label}${index.replaceAll("/", "-")}375.png` });
}

writeFileSync(`${OUT}${label}.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 1));
await browser.close();
