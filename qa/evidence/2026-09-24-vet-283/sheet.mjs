// VET-283: two sets of sample cards side by side, each at full size (1200x630)
// and at 300px wide (iMessage), one row per sample.
//   node qa/evidence/2026-09-24-vet-283/sheet.mjs a b og-variants.png "A: tags top" "B: tags bottom + postmark"
import path from "node:path";

import sharp from "sharp";

const dir = "qa/evidence/2026-09-24-vet-283";
const [left, right, outName, leftLabel = left, rightLabel = right] = process.argv.slice(2);
const names = ["tool", "post", "site", "note", "index"];
const GAP = 40, HEAD = 70, W = 1200, H = 630, SMALL = 300;
const colX = [GAP, GAP + W + GAP, GAP * 3 + W + SMALL + GAP * 2, GAP * 6 + W * 2 + SMALL];
const width = colX[3] + SMALL + GAP;
const height = HEAD + names.length * (H + GAP) + GAP;

const label = (text, x) => ({
  input: Buffer.from(`<svg width="${W}" height="${HEAD}"><text x="0" y="45" font-family="Helvetica" font-size="32" font-weight="700">${text}</text></svg>`),
  left: x,
  top: 0,
});

const layers = [label(leftLabel, colX[0]), label(rightLabel, colX[2])];
for (const [row, name] of names.entries()) {
  const top = HEAD + row * (H + GAP);
  for (const [i, set] of [left, right].entries()) {
    const file = path.join(dir, set, `${name}.png`);
    layers.push({ input: await sharp(file).resize(W).toBuffer(), left: colX[i * 2], top });
    layers.push({ input: await sharp(file).resize(SMALL).toBuffer(), left: colX[i * 2 + 1], top });
  }
}

await sharp({ create: { width, height, channels: 3, background: "#e5e5e5" } }).composite(layers).png().toFile(path.join(dir, outName));
console.log(`wrote ${path.join(dir, outName)} (${width}x${height})`);
