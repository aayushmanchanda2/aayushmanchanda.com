// E1 after: /library at 390 (top, scrolled with the title folded, a tag picked) and an entry with "‹ Library".
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:4364";
const out = new URL("./", import.meta.url).pathname;
const b = await chromium.launch();
for (const theme of ["light", "dark"]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, colorScheme: theme });
  await ctx.addInitScript((t) => { try { localStorage.theme = t; } catch {} }, theme);
  const p = await ctx.newPage();
  await p.goto(`${base}/library`, { waitUntil: "networkidle" });
  await p.screenshot({ path: `${out}e1-after-top-${theme}.png` });
  await p.evaluate(() => scrollTo(0, 700));
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}e1-after-scrolled-${theme}.png` });
  await p.goto(`${base}/library?tags=agents`, { waitUntil: "networkidle" });
  await p.evaluate(() => scrollTo(0, 240));
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}e1-after-tag-${theme}.png` });
  await p.goto(`${base}/library/agents-with-taste`, { waitUntil: "networkidle" });
  await p.screenshot({ path: `${out}e1-after-detail-${theme}.png` });
  await ctx.close();
}
await b.close();
