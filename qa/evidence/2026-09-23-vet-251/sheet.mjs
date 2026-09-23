// VET-251 contact sheet: every shape x variant x pen colour, light and dark,
// drawn from the committed doodles.json with the pen tokens read out of
// global.css and Doodle.astro's stroke rules. node qa/evidence/2026-09-23-vet-251/sheet.mjs
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const root = new URL("../../../", import.meta.url);
const set = JSON.parse(readFileSync(new URL("src/assets/doodles/doodles.json", root), "utf8"));
const pens = [...readFileSync(new URL("src/styles/global.css", root), "utf8").matchAll(/--pen-\w+: light-dark\([^;]+;/g)].map((m) => m[0]).join("\n");
const COLORS = ["amber", "blue", "pink", "green", "ink"];

const svg = (name, v, color) => {
  const { box, variants } = set[name];
  const [w, h] = box;
  const s = 52 / Math.max(w, h);
  return `<svg viewBox="0 0 ${w} ${h}" width="${Math.round(w * s)}" height="${Math.round(h * s)}" style="color:var(--pen-${color})">${variants[v]
    .map((d) => `<path d="${d}"/>`)
    .join("")}</svg>`;
};

const panel = (scheme) => `<section style="color-scheme:${scheme}; background:${scheme === "dark" ? "#000" : "#fff"}; color:${scheme === "dark" ? "#fff" : "#171717"}">
  <h2>${scheme} · 12 shapes × 3 variants × 5 pens · stroke 2px</h2>
  <table><tr><th></th>${COLORS.map((c) => `<th colspan="3">${c}</th>`).join("")}</tr>
  ${Object.keys(set)
    .map((name) => `<tr><th>${name}</th>${COLORS.map((c) => [0, 1, 2].map((v) => `<td>${svg(name, v, c)}</td>`).join("")).join("")}</tr>`)
    .join("")}</table>
  <h2>strokes 1.5 / 2 / 3 (underline, circle, arrow-curve, ink)</h2>
  <div class="strokes">${[1.5, 2, 3].map((sw) => `<span style="--sw:${sw}px">${svg("underline", 0, "ink")}${svg("circle", 0, "ink")}${svg("arrow-curve", 0, "ink")}</span>`).join("")}</div>
</section>`;

const html = `<!doctype html><style>
:root { ${pens} }
body { margin: 0; font: 12px ui-monospace, monospace; }
section { padding: 16px 20px; }
h2 { font-size: 12px; font-weight: 500; margin: 4px 0 12px; opacity: .7; }
th { font-weight: 400; text-align: left; padding: 0 10px 0 0; opacity: .6; }
td { width: 60px; height: 60px; text-align: center; }
svg { overflow: visible; }
path { fill: none; stroke: currentColor; stroke-width: var(--sw, 2px); stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.strokes { display: flex; gap: 40px; } .strokes span { display: flex; gap: 16px; align-items: center; }
</style>${panel("light")}${panel("dark")}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 800 }, deviceScaleFactor: 2 });
await page.setContent(html);
await page.screenshot({ path: new URL("doodle-sheet.png", import.meta.url).pathname, fullPage: true });
await browser.close();
console.log("wrote doodle-sheet.png");
