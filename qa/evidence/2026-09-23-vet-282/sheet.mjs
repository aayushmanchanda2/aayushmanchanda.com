// Contact sheet: node sheet.mjs <out.png> <cols> <cellWidth> <img...> (sharp, already a devDependency)
import sharp from "sharp";

const [out, cols, width, ...files] = process.argv.slice(2);
const w = Number(width);
const cells = await Promise.all(files.map(async (file) => {
  const buf = await sharp(file).resize({ width: w }).png().toBuffer();
  return { buf, h: (await sharp(buf).metadata()).height };
}));
const n = Number(cols);
const rows = Math.ceil(cells.length / n);
const rowH = Array.from({ length: rows }, (_, r) => Math.max(...cells.slice(r * n, r * n + n).map((c) => c.h)));
const gap = 12;
const composite = cells.map((c, i) => ({
  input: c.buf,
  left: (i % n) * (w + gap),
  top: rowH.slice(0, Math.floor(i / n)).reduce((a, b) => a + b + gap, 0),
}));
await sharp({ create: { width: n * (w + gap) - gap, height: rowH.reduce((a, b) => a + b + gap, 0) - gap, channels: 3, background: "#888" } })
  .composite(composite)
  .png()
  .toFile(out);
console.log(out);
