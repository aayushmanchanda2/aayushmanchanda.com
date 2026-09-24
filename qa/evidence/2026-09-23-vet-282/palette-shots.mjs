// The palette open on a phone at 390, light and dark, from the top bar's search glyph.
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:4364";
const out = new URL("./", import.meta.url).pathname;
const b = await chromium.launch();
for (const theme of ["light", "dark"]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, colorScheme: theme });
  await ctx.addInitScript((t) => { try { localStorage.theme = t; } catch {} }, theme);
  const p = await ctx.newPage();
  await p.goto(`${base}/library`, { waitUntil: "networkidle" });
  await p.locator(".bar__search").tap();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}palette-390-${theme}.png` });
  await ctx.close();
}
await b.close();
