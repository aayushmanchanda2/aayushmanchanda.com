// VET-262 behaviour: stamp insets at 320/390/1280, horizontal overflow at 320,
// the sticky bar, the /tools sticky header and column alignment, and the
// /library/<slug> pane, all measured inside the keyline.
// usage: node behaviour.mjs <library slug> [base url]
import { chromium } from "playwright";

const [slug, base = "http://localhost:4329"] = process.argv.slice(2);
const routes = ["/", "/tools", "/sites", "/library", "/notes/building-this-site", `/library/${slug}`, "/experiments"];
const b = await chromium.launch();
const out = {};
const page = async (w, route, h = 800) => {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  await p.goto(base + route, { waitUntil: "networkidle" });
  return p;
};

for (const w of [320, 390, 1280]) {
  const p = await page(w, "/tools");
  out[`inset-${w}`] = await p.evaluate(() => {
    const cs = getComputedStyle(document.body);
    const s = document.querySelector(".stamp").getBoundingClientRect();
    return { frame: cs.paddingLeft, stampLeft: s.left, band: getComputedStyle(document.querySelector(".stamp")).borderLeftWidth };
  });
  await p.context().close();
}

out.overflow320 = {};
for (const r of routes) {
  const p = await page(320, r);
  out.overflow320[r] = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await p.context().close();
}

const t = await page(1280, "/tools");
await t.evaluate(() => scrollTo(0, 1500));
await t.waitForTimeout(200);
out.tools1280 = await t.evaluate(() => {
  const r = (s) => document.querySelector(s).getBoundingClientRect();
  const frame = parseFloat(getComputedStyle(document.body).paddingLeft);
  const cols = [...document.querySelectorAll(".head th")].map((th) => Math.round(th.getBoundingClientRect().left));
  const row = [...document.querySelector(".row").children].map((td) => Math.round(td.getBoundingClientRect().left));
  return { frame, barTop: r(".bar").top, theadTop: r(".thead th").top, tableLeft: r(".table").left, tableRight: innerWidth - r(".table").right, headCols: cols, rowCols: row };
});

const l = await page(1280, `/library/${slug}`);
await l.evaluate(() => scrollTo(0, 1200));
await l.waitForTimeout(200);
out.libraryPane1280 = await l.evaluate(() => {
  const p = document.querySelector(".pane").getBoundingClientRect();
  return { left: p.left, top: p.top, bottomGap: innerHeight - p.bottom, barTop: document.querySelector(".bar").getBoundingClientRect().top };
});
console.log(JSON.stringify(out, null, 1));
await b.close();
