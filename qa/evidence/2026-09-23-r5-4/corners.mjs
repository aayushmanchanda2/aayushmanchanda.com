// R5-4 corner proof. `node corners.mjs <base> before|after` shoots real 4x
// (deviceScaleFactor 4) 72px corners of /sites and /library, light and dark;
// `node corners.mjs sheet` lays before|after side by side into corners.png.
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const [mode, phase] = process.argv.slice(2);
const W = 1280, H = 800, C = 72;
const cells = [];
for (const route of ["/sites", "/library"])
  for (const theme of ["light", "dark"])
    for (const corner of ["tl", "br"]) cells.push({ route, theme, corner, name: `${route.slice(1)}-${theme}-${corner}` });

const browser = await chromium.launch({ headless: true });
try {
  if (mode === "sheet") {
    const img = (p) => `data:image/png;base64,${readFileSync(join(DIR, "corners", p)).toString("base64")}`;
    const rows = cells.map((c) => `<tr><th>${c.name}</th><td><img src="${img(`before-${c.name}.png`)}"></td><td><img src="${img(`after-${c.name}.png`)}"></td></tr>`).join("");
    const page = await browser.newPage({ viewport: { width: 700, height: 400 } });
    await page.setContent(`<style>body{margin:12px;font:13px system-ui;background:#fff}td,th{padding:4px;text-align:left}img{width:288px;display:block}</style><table><tr><th></th><th>before</th><th>after</th></tr>${rows}</table>`);
    await page.screenshot({ path: join(DIR, "corners.png"), fullPage: true });
  } else {
    mkdirSync(join(DIR, "corners"), { recursive: true });
    for (const theme of ["light", "dark"]) {
      const ctx = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: theme, deviceScaleFactor: 4 });
      await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} }, theme);
      const page = await ctx.newPage();
      for (const c of cells.filter((c) => c.theme === theme)) {
        await page.goto(new URL(c.route, mode).href, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
        const clip = c.corner === "tl" ? { x: 0, y: 0, width: C, height: C } : { x: W - C, y: H - C, width: C, height: C };
        await page.screenshot({ path: join(DIR, "corners", `${phase}-${c.name}.png`), clip, animations: "disabled" });
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
