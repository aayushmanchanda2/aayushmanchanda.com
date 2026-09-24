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
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

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

  for (const tag of tags) {
    const isImg = tag.startsWith("<img");
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

if (failures.length > 0) {
  console.error(`image-budget: ${failures.length} failure(s)\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`image-budget: ${checked} picture references on ${htmlFiles(DIST).length} pages within budget; /sites pictures ${Math.round(sitesTotal / KB)} KB of ${Math.round(SITES_PAGE_BUDGET / KB)} KB`);
