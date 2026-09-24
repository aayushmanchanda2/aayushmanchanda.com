/**
 * image-sweep.mjs — bring every committed raster in `public/` under
 * `pipeline/image-policy.mjs` (VET-309b). Run by hand from the repo root:
 *
 *   node scripts/image-sweep.mjs          # rewrite what is over its width
 *   node scripts/image-sweep.mjs --dry    # list it
 *
 * Idempotent by width: a file is re-encoded only when it is wider than its
 * folder's cap, so a second run touches nothing, and a file the pipeline wrote
 * under the policy is never re-encoded (each pass of lossy WebP loses a
 * little). Same name, same format, so no reference moves. Metadata goes: sharp
 * writes none unless asked.
 */
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { AVATAR_WIDTH, ICON_SIZE, ICON_WEBP, POST_PICTURE_WIDTH, POSTER_WIDTH, SHOT_WIDTH, WEBP } from "../pipeline/image-policy.mjs";
import { writeAtomic } from "../pipeline/util.mjs";

const PUBLIC = path.join(process.cwd(), "public");
const dry = process.argv.includes("--dry");

/** Cap and encoder by path under `public/`, first match wins; no match is left alone. */
const RULES = [
  [/^shots\/[a-z0-9-]+-thumb\.webp$/, POSTER_WIDTH, WEBP], // video posters
  [/^shots\/[a-z0-9-]+\.webp$/, SHOT_WIDTH, WEBP], // captures
  [/^posts\/\d+\/avatar\.webp$/, AVATAR_WIDTH, WEBP],
  [/^posts\/\d+\/[^/]+\.webp$/, POST_PICTURE_WIDTH, WEBP],
  [/^icons\/[a-z0-9-]+\.webp$/, ICON_SIZE, ICON_WEBP],
];

/** @param {string} dir @returns {Promise<string[]>} */
async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(full)));
    else out.push(path.relative(PUBLIC, full));
  }
  return out;
}

let before = 0;
let after = 0;
let count = 0;
for (const file of await files(PUBLIC)) {
  const rule = RULES.find(([pattern]) => /** @type {RegExp} */ (pattern).test(file));
  if (!rule) continue;
  const [, cap, options] = /** @type {[RegExp, number, import("sharp").WebpOptions]} */ (rule);
  const full = path.join(PUBLIC, file);
  const { width = 0 } = await sharp(full, { limitInputPixels: false }).metadata();
  if (width <= cap) continue;
  const size = (await stat(full)).size;
  const webp = await sharp(full, { limitInputPixels: false }).resize({ width: cap }).webp(options).toBuffer();
  before += size;
  after += webp.length;
  count++;
  console.log(`${file}  ${width}px ${Math.round(size / 1024)} KB -> ${cap}px ${Math.round(webp.length / 1024)} KB`);
  if (!dry) await writeAtomic(full, webp);
}
console.log(`${dry ? "would re-encode" : "re-encoded"} ${count} file(s): ${(before / 1048576).toFixed(2)} MB -> ${(after / 1048576).toFixed(2)} MB`);
