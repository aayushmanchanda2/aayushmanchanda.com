/**
 * The before/after contact sheet (VET-279): each entry's 1280 and 390 shots,
 * main's beside this branch's, into before-after.png. Also `crop <png> <x> <y>
 * <w> <h> <out>` for a close look at one shot.
 *
 *   node qa/evidence/2026-09-23-vet-279/sheet.mjs
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const DIR = new URL(".", import.meta.url).pathname;
const src = (png) => `data:image/png;base64,${readFileSync(`${DIR}${png}`).toString("base64")}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1 });

if (process.argv[2] === "crop") {
  const [png, x, y, w, h, out] = process.argv.slice(3);
  await page.setViewportSize({ width: Number(w), height: Number(h) });
  await page.setContent(`<body style="margin:0"><img src="${src(png)}" style="display:block;margin:-${y}px 0 0 -${x}px">`);
  await page.waitForLoadState("load");
  await page.screenshot({ path: `${DIR}${out}` });
} else {
  const shots = ["library_jason_liu_codex_operating_system", "library_how_gumclaw_works", "library_most_valuable_skill_2026_managing_ai_agents", "me_fixture_entry"];
  const cell = (dir, name, width) => `<figure><figcaption>${dir} ${width}</figcaption><img src="${src(`${dir}/${name}-${width}-light.png`)}" style="width:${width === 390 ? 180 : 420}px"></figure>`;
  const rows = shots.map((name) => `<section><h2>${name.replace(/_/g, " ")}</h2><div>${cell("before", name, 1280)}${cell("after", name, 1280)}${cell("before", name, 390)}${cell("after", name, 390)}</div></section>`).join("");
  await page.setViewportSize({ width: 1260, height: 800 });
  await page.setContent(`<style>body{font:14px system-ui;margin:16px}section{margin-bottom:24px}div{display:flex;gap:12px;align-items:flex-start}figure{margin:0}figcaption{color:#555;margin-bottom:4px}img{border:1px solid #ccc}h2{font-size:15px}</style>${rows}`);
  await page.waitForLoadState("load");
  await page.screenshot({ path: `${DIR}before-after.png`, fullPage: true });
}
await browser.close();
