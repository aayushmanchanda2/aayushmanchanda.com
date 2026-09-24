// Contact sheets of a run's shots: node qa/evidence/2026-09-24-vet-307/sheet.mjs <tag> <prefix> <cols> <thumbWidth>
import sharp from "sharp";
import { readdirSync } from "node:fs";
const dir = new URL(".", import.meta.url).pathname;
const [tag, prefix, cols = "4", tw = "360"] = process.argv.slice(2);
const W = +tw, C = +cols;
const files = readdirSync(dir).filter((f) => f.startsWith(`${tag}-${prefix}`) && f.endsWith(".png")).sort();
const tiles = await Promise.all(files.map(async (f) => {
  const img = sharp(dir + f).resize({ width: W });
  const buf = await img.png().toBuffer();
  const { height } = await sharp(buf).metadata();
  const h = Math.min(height, Math.round(W * 1.6));
  const label = Buffer.from(`<svg width="${W}" height="22"><rect width="100%" height="100%" fill="#ffeb3b"/><text x="4" y="16" font-size="13" font-family="Helvetica">${f.replace(`${tag}-`, "").replace(".png", "")}</text></svg>`);
  return { buf: await sharp(buf).extract({ left: 0, top: 0, width: W, height: h }).toBuffer(), h, label };
}));
const rowH = [];
for (let i = 0; i < tiles.length; i += C) rowH.push(Math.max(...tiles.slice(i, i + C).map((t) => t.h)) + 22 + 8);
const out = [];
let y = 0;
tiles.forEach((t, i) => {
  const r = Math.floor(i / C), c = i % C;
  if (c === 0 && r > 0) y += rowH[r - 1];
  out.push({ input: t.label, left: c * (W + 8), top: y }, { input: t.buf, left: c * (W + 8), top: y + 22 });
});
await sharp({ create: { width: C * (W + 8), height: rowH.reduce((a, b) => a + b, 0), channels: 3, background: "#888" } }).composite(out).png().toFile(`${dir}sheet-${tag}-${prefix}.png`);
console.log(`sheet-${tag}-${prefix}.png`, files.length);
