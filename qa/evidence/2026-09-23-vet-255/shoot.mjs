// VET-255 evidence: screenshots + title-offset / side-padding measurements.
// usage: node shoot.mjs <label> [frameVariant] [routes csv] [widths csv]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const [label = "shot", variant = "", routesArg, widthsArg] = process.argv.slice(2);
const routes = (routesArg ?? "/tools,/sites,/library,/library/philosopher-ceo-kareem-amin,/notes,/").split(",");
const widths = (widthsArg ?? "390,1280,1600").split(",").map(Number);
const dir = new URL(`./${label}/`, import.meta.url).pathname;
mkdirSync(dir, { recursive: true });

const b = await chromium.launch();
const report = {};
for (const scheme of ["light", "dark"]) {
  for (const w of widths) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme });
    const p = await ctx.newPage();
    for (const route of routes) {
      await p.goto(`http://localhost:4321${route}`, { waitUntil: "networkidle" });
      if (variant) await p.evaluate((v) => document.documentElement.setAttribute("data-frame", v), variant);
      await p.evaluate(() => document.querySelector("astro-dev-toolbar")?.remove());
      await p.waitForTimeout(150);
      const m = await p.evaluate(() => {
        const bar = document.querySelector("[data-bar]").getBoundingClientRect();
        const h1 = [...document.querySelectorAll("h1")].find((h) => h.getBoundingClientRect().width > 0);
        const t = h1?.getBoundingClientRect();
        const main = document.querySelector("main").getBoundingClientRect();
        return {
          barBottom: bar.bottom,
          barLeft: bar.left,
          h1Top: t && Math.round(t.top),
          titleOffset: t && Math.round(t.top - bar.bottom),
          titleLeft: t && Math.round(t.left),
          mainLeft: Math.round(main.left),
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
        };
      });
      report[`${route} ${w} ${scheme}`] = m;
      const name = `${route === "/" ? "home" : route.slice(1).replaceAll("/", "_")}-${w}-${scheme}.png`;
      await p.screenshot({ path: dir + name });
    }
    await ctx.close();
  }
}
await b.close();
writeFileSync(dir + "report.json", JSON.stringify(report, null, 1));
for (const [k, v] of Object.entries(report)) console.log(k.padEnd(52), `offset ${v.titleOffset} left ${v.titleLeft} main ${v.mainLeft} overflow ${v.scrollW > v.clientW}`);
