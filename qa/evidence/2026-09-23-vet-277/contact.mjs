// Before/after contact sheet of the block: before on the left, after on the right.
import sharp from "sharp";
const dir = new URL(".", import.meta.url).pathname;
const pairs = [["before/verbatim-1280-light.png", "after/verbatim-1280-light.png"], ["before/next-390-light.png", "after/next-390-light.png"], ["before/next-390-dark.png", "after/next-390-dark.png"]];
const gap = 40, rows = [];
for (const pair of pairs) rows.push(await Promise.all(pair.map(async (f) => ({ f, buf: await sharp(dir + f).resize({ width: 1280, height: 1600, fit: "inside", withoutEnlargement: true }).toBuffer() }))));
const meta = await Promise.all(rows.flat().map((t) => sharp(t.buf).metadata()));
let i = 0; const composite = []; let y = gap;
for (const row of rows) {
  let x = gap, h = 0;
  for (const t of row) { const m = meta[i++]; composite.push({ input: t.buf, left: x, top: y }); x += 1280 + gap; h = Math.max(h, m.height); }
  y += h + gap;
}
await sharp({ create: { width: 2 * 1280 + 3 * gap, height: y, channels: 3, background: "#9a9a9a" } }).composite(composite).png().toFile(dir + "before-after.png");
console.log("before-after.png");
