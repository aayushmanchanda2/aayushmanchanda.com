// VET-261: render candidate feTurbulence tiles and compare their alpha stats
// with arc.net's noise-light.png (mean 16.5/255, max 41, white pixels)
import { chromium } from "playwright";
import sharp from "sharp";
const svg = (f, o, k, c) => `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${f}' numOctaves='${o}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 ${k} 0 0 0 ${c}'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 220, height: 220 } });
for (const [f, o, k, c] of process.argv.slice(2).map((s) => s.split(","))) {
  const s = svg(f, o, k, c);
  await p.setContent(`<body style="margin:0"><div style="width:220px;height:220px;background:url(&quot;data:image/svg+xml,${s.replace(/"/g, "&quot;")}&quot;)"></div>`);
  const png = await p.screenshot({ omitBackground: true });
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0, max = 0, zero = 0; const n = data.length / 4;
  for (let i = 0; i < n; i++) { const a = data[i * 4 + 3]; sum += a; max = Math.max(max, a); zero += a === 0; }
  console.log({ f, o, k, c, mean: (sum / n).toFixed(1), max, zeroPct: ((zero / n) * 100).toFixed(0), bytes: s.length });
}
await b.close();
