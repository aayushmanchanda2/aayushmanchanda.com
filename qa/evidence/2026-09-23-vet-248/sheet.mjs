// Contact sheet of the new previews (library + links), 6 across at 400x210.
import { readdirSync } from "node:fs";
import sharp from "sharp";
const dirs = ["public/previews/library", "public/previews/links"];
const files = dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".webp")).map((f) => `${d}/${f}`));
const W = 400, H = 210, COLS = 6;
for (let page = 0; page * 24 < files.length; page++) {
  const chunk = files.slice(page * 24, page * 24 + 24);
  const tiles = await Promise.all(chunk.map(async (f, i) => ({
    input: await sharp(f).resize(W, H, { fit: "cover", position: "top" }).png().toBuffer(),
    left: (i % COLS) * (W + 4), top: Math.floor(i / COLS) * (H + 4),
  })));
  await sharp({ create: { width: COLS * (W + 4), height: Math.ceil(chunk.length / COLS) * (H + 4), channels: 3, background: "#f00" } })
    .composite(tiles).png().toFile(new URL(`sheet-${page}.png`, import.meta.url).pathname);
  console.log(page, chunk.map((f) => f.split("/").pop()).join(" "));
}
