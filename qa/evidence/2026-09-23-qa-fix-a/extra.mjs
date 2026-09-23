// Pane counts at desktop and 430, and the bar's focus ring from a fresh load.
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:4329";
const out = new URL(".", import.meta.url).pathname;
const b = await chromium.launch();
const r = {};
for (const [w, route] of [[1280, "/library/a-great-cold-email-can-change-your-life"], [430, "/library"], [412, "/library"]]) {
  const p = await b.newPage({ viewport: { width: w, height: 800 } });
  await p.goto(base + route);
  r[`seg${w}`] = await p.evaluate(() => {
    const nav = [...document.querySelectorAll(".seg")].find((el) => el.checkVisibility());
    const box = nav.getBoundingClientRect();
    return {
      counts: [...nav.querySelectorAll(".seg__count")].some((c) => c.checkVisibility()),
      clipped: [...nav.querySelectorAll(".seg__item")].filter((a) => a.getBoundingClientRect().right > box.right + 0.5).length,
    };
  });
  await p.close();
}
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${base}/tools`);
for (let i = 0; i < 15 && !(await p.evaluate(() => document.activeElement?.matches(".bar__search"))); i++) await p.keyboard.press("Tab");
r.barRing = await p.evaluate(() => ({ focused: document.activeElement?.className, outlineOffset: getComputedStyle(document.activeElement).outlineOffset }));
await p.screenshot({ path: `${out}a10-bar-focus.png`, clip: { x: 880, y: 0, width: 400, height: 110 } });
await b.close();
writeFileSync(`${out}extra.json`, JSON.stringify(r, null, 2));
console.log(JSON.stringify(r));
