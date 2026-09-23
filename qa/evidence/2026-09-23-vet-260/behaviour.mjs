// VET-260 behaviour: data-section per route, frame width per viewport, no
// horizontal overflow, menu over the mat at 390, 390 dark, and a reading page.
import { chromium } from "playwright";

const dir = new URL("./behaviour/", import.meta.url).pathname;
const b = await chromium.launch();
const out = {};
for (const [w, scheme] of [[390, "dark"], [925, "light"], [1280, "light"]]) {
  const p = await b.newPage({ viewport: { width: w, height: 800 }, colorScheme: scheme });
  for (const route of ["/", "/tools", "/sites", "/library", "/notes", "/experiments", "/about", "/library/philosopher-ceo-kareem-amin"]) {
    await p.goto(`http://localhost:4321${route}`, { waitUntil: "networkidle" });
    await p.evaluate(() => document.querySelector("astro-dev-toolbar")?.remove());
    out[`${route} ${w}`] = await p.evaluate(() => ({
      section: document.documentElement.dataset.section,
      mat: document.documentElement.dataset.mat,
      frame: parseFloat(getComputedStyle(document.body).paddingLeft),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    if (w === 390) await p.screenshot({ path: `${dir}${route === "/" ? "home" : route.slice(1).replaceAll("/", "_")}-390-dark.png` });
  }
  if (w === 390) {
    await p.goto("http://localhost:4321/tools", { waitUntil: "networkidle" });
    await p.click("[data-bar] button");
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${dir}menu-390-dark.png` });
  }
  await p.close();
}
await b.close();
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(48), JSON.stringify(v));
