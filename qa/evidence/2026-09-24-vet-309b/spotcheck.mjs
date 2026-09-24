/**
 * VET-309b spot check: five shots, a 560x360 region each, at 100% of the stored
 * 1280px width. Left: the committed 1440px original scaled to 1280 (lossless),
 * middle: WebP q80, right: WebP q75, both from that original. From the repo root:
 *   node qa/evidence/2026-09-24-vet-309b/spotcheck.mjs [--from <dir of originals>]
 * Run before the sweep (VET-309b), on the 1440px originals; they are at fac827c.
 */
import path from "node:path";
import sharp from "sharp";

const dir = path.dirname(new URL(import.meta.url).pathname);
const i = process.argv.indexOf("--from");
const from = i === -1 ? "public/shots" : process.argv[i + 1];
const PICKS = [
  ["arc-from-the-browser-company", 0.02],
  ["bajgart-office", 0.3],
  ["about-brian-lovin", 0.1],
  ["save-design", 0.05],
  ["rauno-freiberg-note-4", 0.2],
];
const W = 560, H = 360;
for (const [slug, at] of PICKS) {
  const base = await sharp(path.join(from, `${slug}.webp`), { limitInputPixels: false }).resize({ width: 1280 }).png().toBuffer();
  const { height = 0 } = await sharp(base, { limitInputPixels: false }).metadata();
  const region = { left: 360, top: Math.min(Math.round(height * at), height - H), width: W, height: H };
  const tiles = [await sharp(base, { limitInputPixels: false }).extract(region).png().toBuffer()];
  for (const quality of [80, 75]) {
    const webp = await sharp(base, { limitInputPixels: false }).webp({ quality, effort: 6 }).toBuffer();
    tiles.push(await sharp(webp, { limitInputPixels: false }).extract(region).png().toBuffer());
  }
  await sharp({ create: { width: W * 3 + 16, height: H, channels: 3, background: "#ff00ff" } })
    .composite(tiles.map((input, n) => ({ input, left: n * (W + 8), top: 0 })))
    .png()
    .toFile(path.join(dir, `spot-${slug}.png`));
}
