// VET-261: 2x crops of the mat's top-left corner (ruler, grain) per route/theme
import { chromium } from "playwright";
const dir = new URL("./", import.meta.url).pathname;
const b = await chromium.launch();
for (const scheme of ["light", "dark"]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  for (const r of ["/sites", "/library"]) {
    await p.goto("http://localhost:4321" + r, { waitUntil: "networkidle" });
    await p.evaluate(() => document.querySelector("astro-dev-toolbar")?.remove());
    await p.screenshot({ path: `${dir}zoom-${r.slice(1)}-${scheme}.png`, clip: { x: 0, y: 0, width: 260, height: 140 } });
  }
  await ctx.close();
}
await b.close();
