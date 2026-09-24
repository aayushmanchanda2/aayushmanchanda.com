// E5 probe: what paints in the frames after ⌘K opens the palette.
// Usage: node qa/evidence/2026-09-23-vet-282/e5-probe.mjs <base> <label> [mobile]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const [base = "http://localhost:4363", label = "before", mobile] = process.argv.slice(2);
const out = new URL(`./e5-${label}/`, import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext(
  mobile ? { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } },
);
const page = await context.newPage();
await page.goto(`${base}/library`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);

// Per-frame log from inside the page: how many rows exist, and whether each
// row's title text has laid out (a non-zero box) on that frame.
await page.evaluate(() => {
  const log = [];
  window.__e5 = log;
  const t0 = performance.now();
  window.__e5start = () => {
    const tick = () => {
      const rows = document.querySelectorAll("[data-palette-row]");
      const titled = [...rows].filter((r) => r.querySelector(".palette__row-title")?.getBoundingClientRect().width > 0).length;
      const icons = [...rows].filter((r) => r.querySelector(".palette__icon")).length;
      const panel = getComputedStyle(document.querySelector(".palette__panel"));
      log.push({ t: Math.round(performance.now() - t0), rows: rows.length, titled, icons, opacity: panel.opacity, status: document.querySelector("[data-palette-status]").textContent });
      if (log.length < 60) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
});

const cdp = await context.newCDPSession(page);
const frames = [];
cdp.on("Page.screencastFrame", async ({ data, sessionId, metadata }) => {
  frames.push({ data, ts: metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
await page.waitForTimeout(300);

const requests = [];
page.on("request", (r) => requests.push({ url: r.url().replace(base, ""), t: Date.now() }));
const pressed = Date.now();
await page.evaluate(() => window.__e5start());
if (mobile) {
  await page.evaluate(() => document.querySelector("[data-palette-open]")?.click());
} else {
  await page.keyboard.press("Meta+k");
}
await page.waitForTimeout(900);
await cdp.send("Page.stopScreencast");

const log = await page.evaluate(() => window.__e5);
frames.forEach((f, i) => writeFileSync(`${out}frame-${String(i).padStart(2, "0")}.png`, Buffer.from(f.data, "base64")));
const report = { base, mobile: !!mobile, frames: frames.length, requests: requests.map((r) => ({ ...r, t: r.t - pressed })), log };
writeFileSync(`${out}report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ frames: frames.length, requests: report.requests, log: log.slice(0, 20) }, null, 1));
await browser.close();
