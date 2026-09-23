// Contact sheet of every committed preview, 6 across, slug under each.
import { readdirSync } from "node:fs";
import sharp from "sharp";
const dir = "public/previews", files = readdirSync(dir).filter((f) => f.endsWith(".webp")).sort();
const W = 400, H = 210, L = 22, cols = 6, rows = Math.ceil(files.length / cols);
const tiles = await Promise.all(files.map(async (f, i) => {
  const img = await sharp(`${dir}/${f}`).resize(W, H).png().toBuffer();
  const label = Buffer.from(`<svg width="${W}" height="${L}"><text x="4" y="16" font-size="13" font-family="sans-serif">${f.slice(0, 55)}</text></svg>`);
  const x = (i % cols) * W, y = Math.floor(i / cols) * (H + L);
  return [{ input: img, left: x, top: y }, { input: label, left: x, top: y + H }];
}));
await sharp({ create: { width: cols * W, height: rows * (H + L), channels: 3, background: "#fff" } })
  .composite(tiles.flat()).png().toFile(process.argv[2]);
console.log(files.length, "previews");
