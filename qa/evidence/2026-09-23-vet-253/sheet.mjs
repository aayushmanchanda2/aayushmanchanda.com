// Contact sheets for the two frame sequences. node qa/evidence/2026-09-23-vet-253/sheet.mjs
import sharp from "sharp";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = dirname(fileURLToPath(import.meta.url));
for (const [name, w, h] of [["open", 640, 400], ["jiggle", 700, 300]]) {
  const tiles = await Promise.all(
    [1, 2, 3, 4, 5].map((i) => sharp(join(OUT, `${name}-${i}.png`)).resize(w, h).toBuffer()),
  );
  await sharp({ create: { width: w, height: h * 5, channels: 3, background: "#fff" } })
    .composite(tiles.map((input, i) => ({ input, left: 0, top: i * h })))
    .png()
    .toFile(join(OUT, `${name}-sheet.png`));
}
