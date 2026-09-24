// Contact sheet of share cards: node qa/evidence/2026-09-23-vet-281/sheet.mjs out.png card.jpg...
import sharp from "sharp";
const [out, ...cards] = process.argv.slice(2);
const W = 600, H = 315, G = 12, cols = 3, rows = Math.ceil(cards.length / cols);
const tiles = await Promise.all(cards.map((f) => sharp(`dist/og/${f}`).resize(W, H).toBuffer()));
await sharp({ create: { width: cols * W + (cols + 1) * G, height: rows * H + (rows + 1) * G, channels: 3, background: "#888" } })
  .composite(tiles.map((input, i) => ({ input, left: G + (i % cols) * (W + G), top: G + Math.floor(i / cols) * (H + G) })))
  .png().toFile(out);
console.log(out, cards.length);
