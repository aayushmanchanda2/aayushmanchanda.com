// VET-231: the list pane keeps its scroll across entry navigations, and j/k walk.
// Run from the repo root against `npx astro preview --port 4329`.
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4329";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const paneTop = () => page.evaluate(() => document.querySelector("[data-pane]").scrollTop);
const current = () => page.evaluate(() => location.pathname);
const results = [];

await page.goto(`${base}/library/how-gumclaw-works`);
await page.evaluate(() => (document.querySelector("[data-pane]").scrollTop = 2000));
let saved = await paneTop();

// Five entries by pressing rows that are in view, never scrolling in between.
for (let hop = 0; hop < 5; hop++) {
  const href = await page.evaluate((hop) => {
    const pane = document.querySelector("[data-pane]");
    const rows = [...pane.querySelectorAll("a:not([aria-current])")];
    const inView = rows.filter((a) => {
      const t = a.offsetTop - pane.scrollTop;
      return t > 0 && t + a.offsetHeight < pane.clientHeight;
    });
    return inView[hop % inView.length].getAttribute("href");
  }, hop);
  await Promise.all([page.waitForURL(`**${href}`), page.click(`[data-pane] a[href="${href}"]`)]);
  const after = await paneTop();
  results.push({ hop: hop + 1, to: href, saved, restored: after, ok: Math.abs(after - saved) <= 20 });
  saved = after;
}

// j goes next, k comes back.
const start = await current();
const next = await page.getAttribute('[data-nav="next"]', "href");
const prev = await page.getAttribute('[data-nav="prev"]', "href");
await Promise.all([page.waitForURL(`**${next}`), page.keyboard.press("j")]);
const afterJ = await current();
await Promise.all([page.waitForURL(`**${start}`), page.keyboard.press("k")]);
const afterK = await current();

// Typing in the search palette must not navigate.
await page.keyboard.press("Meta+k");
await page.waitForTimeout(200);
await page.keyboard.type("jk");
await page.waitForTimeout(400);
const afterTyping = await current();

const keys = {
  start,
  afterJ,
  afterK,
  jWentNext: afterJ !== start,
  kCameBack: afterK === start,
  nextHref: next,
  prevHref: prev,
  typingStayed: afterTyping === start,
};
console.log(JSON.stringify({ results, keys }, null, 2));
await browser.close();
process.exit(results.every((r) => r.ok) && keys.jWentNext && keys.kCameBack && keys.typingStayed ? 0 : 1);
