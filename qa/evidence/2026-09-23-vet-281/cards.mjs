// Card validator: every built page's og/twitter image tags resolve to a real 1200x630 file.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
const walk = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? (f === "_astro" ? [] : walk(p)) : p.endsWith(".html") ? [p] : []; });
const tag = (h, k) => h.match(new RegExp(`<meta (?:property|name)="${k}" content="([^"]*)"`))?.[1];
const bad = [], kinds = {}, seen = new Map();
for (const f of walk("dist")) {
  const h = readFileSync(f, "utf8");
  const t = { img: tag(h, "og:image"), w: tag(h, "og:image:width"), hgt: tag(h, "og:image:height"), alt: tag(h, "og:image:alt"), card: tag(h, "twitter:card"), timg: tag(h, "twitter:image"), talt: tag(h, "twitter:image:alt") };
  if (!t.img || t.card !== "summary_large_image" || t.timg !== t.img || !t.alt || t.talt !== t.alt || t.w !== "1200" || t.hgt !== "630") { bad.push([f, t]); continue; }
  const file = path.join("dist", new URL(t.img).pathname);
  if (!seen.has(file)) { const m = await sharp(file).metadata(); seen.set(file, `${m.format} ${m.width}x${m.height}`); }
  if (!/ 1200x630$/.test(seen.get(file))) bad.push([f, seen.get(file)]);
  const kind = new URL(t.img).pathname.split("/").slice(0, 3).join("/").replace(/\.jpg$/, "");
  kinds[kind] = (kinds[kind] ?? 0) + 1;
}
console.log(JSON.stringify({ pages: walk("dist").length, distinctImages: seen.size, formats: [...new Set(seen.values())], bad: bad.length, byCard: kinds }, null, 1));
if (bad.length) console.log(bad.slice(0, 5));
