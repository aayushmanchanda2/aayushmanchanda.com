// Ran once against the two prototypes (variant B was src/components/HueStrip.astro, since removed).
// VET-55 design-twice: shoots variant A (swatch chips) and B (spectrum strip)
// on /sites at 1280, light, then stitches them side by side into variants.png.
import { chromium } from "playwright";
import sharp from "sharp";
const dir = "qa/evidence/2026-09-24-vet-55";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
await p.goto("http://localhost:4321/sites", { waitUntil: "networkidle" });
const shots = [];
for (const [variant, hide] of [["a", ".strip"], ["b", ".hues"]]) {
  await p.addStyleTag({ content: `${hide}{display:none!important} ${variant === "a" ? ".hues{display:flex!important}" : ".strip{display:flex!important}"}` });
  await p.waitForTimeout(600);
  const file = `${dir}/variant-${variant}.png`;
  await p.screenshot({ path: file });
  shots.push(file);
}
const [a, bb] = await Promise.all(shots.map((f) => sharp(f).resize(800).png().toBuffer()));
const h = (await sharp(a).metadata()).height;
await sharp({ create: { width: 1616, height: h, channels: 3, background: "#888" } })
  .composite([{ input: a, left: 0, top: 0 }, { input: bb, left: 816, top: 0 }])
  .png({ compressionLevel: 9, palette: true }).toFile(`${dir}/variants.png`);
await b.close();
