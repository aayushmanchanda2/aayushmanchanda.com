// Pixel parity: before vs after shots; prints changed-pixel count and the bounding box of change.
import sharp from "sharp";
import { readdirSync } from "node:fs";
const A = "qa/evidence/2026-09-23-qa-fix-2-before", B = "qa/evidence/2026-09-23-qa-fix-2";
for (const f of readdirSync(B).filter((f) => f.endsWith(".png"))) {
  const [a, b] = await Promise.all([A, B].map((d) => sharp(`${d}/${f}`).raw().toBuffer({ resolveWithObject: true })));
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) { console.log(f, "size", a.info.width, a.info.height, "->", b.info.width, b.info.height); continue; }
  const w = a.info.width, c = a.info.channels; let n = 0, x0 = w, y0 = 1e9, x1 = -1, y1 = -1;
  for (let i = 0; i < a.data.length; i += c) {
    if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i+1] - b.data[i+1]) + Math.abs(a.data[i+2] - b.data[i+2]) > 24) {
      n++; const p = i / c, x = p % w, y = Math.floor(p / w);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  console.log(f, `${w}x${a.info.height}`, "changed px", n, n ? `box ${x0},${y0}-${x1},${y1}` : "");
}
