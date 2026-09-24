/**
 * image-budget.mjs — every picture `dist/` asks a browser for, held to the
 * images policy (design.md §8 "Images", VET-309). Runs after the build, with
 * `validate:schema`.
 *
 *   1. Every local `<img>`/`<source>` file (src and each srcset candidate) and
 *      every hover-card picture exists and is under its folder's byte budget.
 *   2. No page but an entry's own points at a full-page shot: a card, a list
 *      row's hover card and a screen strip take `/thumbs` copies.
 *   3. Every local `<img>` carries `width` and `height`, and a page has at most
 *      one `fetchpriority="high"`.
 *   4. /sites, fully scrolled, stays under a total: the fallback `src` of every
 *      picture on it, which is the most a browser can pull.
 *   5. No raster is over 2x the widest box its kind fills (VET-309b): every
 *      candidate of an `<img>` and its `<picture>`'s sources, against the
 *      measured `src/data/image-widths.json` (`scripts/image-widths.mjs`, run
 *      by hand, since a layout needs a browser and CI has none), and a hover
 *      card's picture against the card's 400px.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

const DIST = path.join(process.cwd(), "dist");
const KB = 1024;

/** Per-file ceilings by path prefix, first match wins. Numbers: the VET-309 after-build plus headroom. */
const BUDGETS = [
  ["/thumbs/", 420 * KB], // a phone's full page (the tallest shot, ~300 KB) is the big one; a crop is under 80 KB
  ["/shots/", 1000 * KB], // originals, on the entry page only (check 2)
  ["/previews/", 80 * KB],
  ["/posts/", 300 * KB],
  ["/icons/", 30 * KB],
  ["/og/", 300 * KB], // share cards stay JPEG at 1200x630: Slack and Discord refuse WebP
  ["/", 150 * KB],
];

/** Every picture /sites can load, scrolled to the end: 779 KB at VET-309 (7,856 KB before), plus room for more saves. */
const SITES_PAGE_BUDGET = 1000 * KB;

/** Widest box per kind, "<first class> <folder>" (`scripts/image-widths.mjs`). */
const WIDTHS = /** @type {Record<string, number>} */ (JSON.parse(readFileSync(path.join(process.cwd(), "src", "data", "image-widths.json"), "utf8")));

/** `PreviewCard.astro`: `min(400px, 100vw - 40px)`. */
const PREVIEW_CARD = 400;

/** Rounding room on "2x": a 1280px shot in a 654px column is 1.96x. */
const MAX_RATIO = 2.02;

/** A site's full-page shot (not a video poster, `<slug>-thumb.webp`). */
const FULL_SHOT = /^\/shots\/[a-z0-9-]+(?<!-thumb)\.webp$/;

/** Pages whose job is the full shot: `/sites/<slug>`. */
const ENTRY = /^sites\/[a-z0-9-]+\/index\.html$/;

/** @type {string[]} */
const failures = [];
/** @param {string} page @param {string} message */
const fail = (page, message) => failures.push(`${page}: ${message}`);

/** @param {string} dir @param {string} [base] @returns {string[]} */
function htmlFiles(dir, base = "") {
  return readdirSync(path.join(dir, base)).flatMap((name) => {
    const rel = path.join(base, name);
    if (statSync(path.join(dir, rel)).isDirectory()) return name === "_astro" ? [] : htmlFiles(dir, rel);
    return name.endsWith(".html") ? [rel] : [];
  });
}

/** @param {string} tag @param {string} name */
const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

/** Local paths in a `src`, a `srcset` or a `data-preview`. @param {string} tag @returns {string[]} */
function urls(tag) {
  const srcset = (attr(tag, "srcset") ?? "").split(",").map((candidate) => candidate.trim().split(/\s+/)[0] ?? "");
  return [attr(tag, "src"), attr(tag, "data-preview"), ...srcset].filter((url) => url !== null && url.startsWith("/")).map((url) => /** @type {string} */ (url).split("?")[0] ?? "");
}

/** @type {Map<string, number>} */
const sizes = new Map();
/** @param {string} url @returns {number | null} */
function bytes(url) {
  if (!sizes.has(url)) {
    const file = path.join(DIST, decodeURIComponent(url));
    sizes.set(url, existsSync(file) ? statSync(file).size : -1);
  }
  const size = sizes.get(url) ?? -1;
  return size < 0 ? null : size;
}

/** @type {Map<string, Promise<number>>} */
const pixels = new Map();
/** A raster's pixel width off its header; 0 for a vector. @param {string} url */
function pixelWidth(url) {
  if (!pixels.has(url)) {
    const file = path.join(DIST, decodeURIComponent(url));
    pixels.set(url, url.endsWith(".svg") ? Promise.resolve(0) : sharp(file).metadata().then((meta) => meta.width ?? 0));
  }
  return /** @type {Promise<number>} */ (pixels.get(url));
}

/** @type {{ page: string, url: string, kind: string, box: number | undefined }[]} */
const fits = [];

if (!existsSync(DIST)) {
  console.error("dist/ is not there. Run `npm run build` first.");
  process.exit(1);
}

let checked = 0;
let sitesTotal = 0;
for (const page of htmlFiles(DIST)) {
  const html = readFileSync(path.join(DIST, page), "utf8");
  const tags = [...html.matchAll(/<(?:img|source)\b[^>]*>|<a\b[^>]*\sdata-preview="\/[^"]*"[^>]*>/g)].map((match) => match[0]);
  let high = 0;
  let total = 0;
  /** The sources of the `<picture>` being read, owned by its `<img>`. @type {string[]} */
  let sources = [];

  for (const tag of tags) {
    const isImg = tag.startsWith("<img");
    if (tag.startsWith("<source")) sources.push(...urls(tag).filter((url) => bytes(url) !== null));
    else if (isImg && attr(tag, "src")?.startsWith("/")) {
      const kind = `${(attr(tag, "class") ?? "").split(/\s+/).find((c) => c !== "") ?? "(none)"} ${attr(tag, "src")?.split("/")[1]}`;
      for (const url of [...urls(tag), ...sources]) if (bytes(url) !== null) fits.push({ page, url, kind, box: WIDTHS[kind] });
      sources = [];
    } else if (!isImg) {
      const url = attr(tag, "data-preview");
      if (url && bytes(url) !== null) fits.push({ page, url, kind: "hover card", box: PREVIEW_CARD });
    }
    if (isImg && attr(tag, "fetchpriority") === "high") high++;
    for (const url of urls(tag)) {
      checked++;
      const size = bytes(url);
      if (size === null) {
        fail(page, `${url} is not in dist/`);
        continue;
      }
      const budget = BUDGETS.find(([prefix]) => url.startsWith(String(prefix)))?.[1] ?? 0;
      if (size > Number(budget)) fail(page, `${url} is ${Math.round(size / KB)} KB, over its ${Math.round(Number(budget) / KB)} KB budget`);
      if (FULL_SHOT.test(url) && !ENTRY.test(page)) fail(page, `${url} is a full-page shot on a page that only needs its /thumbs copy`);
    }
    const src = attr(tag, "src");
    if (isImg && src?.startsWith("/")) {
      total += bytes(src) ?? 0;
      if (!src.endsWith(".svg") && (attr(tag, "width") === null || attr(tag, "height") === null)) fail(page, `<img src="${src}"> has no width/height, so its box is not reserved`);
    }
  }

  if (high > 1) fail(page, `${high} images ask for fetchpriority="high"; only the LCP should`);
  if (page === "sites/index.html") sitesTotal = total;
  if (page === "sites/index.html" && total > SITES_PAGE_BUDGET) {
    fail(page, `pictures total ${Math.round(total / KB)} KB, over the ${Math.round(SITES_PAGE_BUDGET / KB)} KB page budget`);
  }
}

/** One failure per file and kind, not per page it appears on. */
const seen = new Set();
for (const { page, url, kind, box } of fits) {
  const key = `${url} ${kind}`;
  if (seen.has(key)) continue;
  seen.add(key);
  if (box === undefined) {
    fail(page, `no measured width for "${kind}" (${url}): run scripts/image-widths.mjs`);
    continue;
  }
  const width = await pixelWidth(url);
  if (width > box * MAX_RATIO) fail(page, `${url} is ${width}px wide for a ${box}px "${kind}", over 2x`);
}

if (failures.length > 0) {
  console.error(`image-budget: ${failures.length} failure(s)\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`image-budget: ${checked} picture references on ${htmlFiles(DIST).length} pages within budget; /sites pictures ${Math.round(sitesTotal / KB)} KB of ${Math.round(SITES_PAGE_BUDGET / KB)} KB`);
