/**
 * capture.mjs — the screenshot engine.
 *
 * One job: given a URL and a slug, leave one WebP file on disk that the /sites
 * gallery can render, plus the handful of colours that file is mostly made of.
 * `publish.mjs` calls `captureSite()` per new bookmark; the CLI entry at the
 * bottom is for seeding and for re-shooting a single entry by hand.
 *
 * Three deliberate choices, each learned the hard way by everyone who has built
 * one of these:
 *
 *   1. NEVER `networkidle`. Analytics beacons, poll loops, and video ads keep
 *      the network busy forever, so `networkidle` either hangs or resolves at
 *      a random moment. We wait for `load`, then for webfonts, then sit still
 *      for a fixed beat and shoot. Predictable beats clever.
 *   2. ONE shot, in whatever scheme the site itself chose. The old engine forced
 *      `colorScheme` twice and shipped a light/dark pair, which cost double the
 *      bytes to say the same thing: a site that ignores `prefers-color-scheme`
 *      returned two identical files, and a site that honours it got a second
 *      picture nobody had asked to see. The context below sets no colour scheme
 *      at all, so what lands on disk is the site's own default — its dominant
 *      look, which is the thing worth saving.
 *   3. The whole page, up to a ceiling. A hero crop tells you a site has a big
 *      headline; the full scroll tells you how it is built. Past `MAX_SHOT_PX`
 *      the picture stops being reference and starts being a megabyte, so the
 *      capture is clipped there and says so in the log.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";

import { describe } from "./util.mjs";

/** Desktop width, 1x. Retina would quadruple the bytes for no gallery gain. */
const VIEWPORT = { width: 1440, height: 900 };
const DEVICE_SCALE_FACTOR = 1;

/** After fonts are ready: entrance animations and lazy images land in here. */
const SETTLE_MS = 2500;

/** Wall-clock ceiling for one shot, navigation and settle included. */
const SHOT_TIMEOUT_MS = 45_000;

/**
 * Tallest page we will keep, in CSS pixels. Roughly thirteen screens: long
 * enough for every marketing page and portfolio in the gallery, short enough
 * that an infinite-scroll feed cannot hand us a 60,000px PNG to encode.
 */
export const MAX_SHOT_PX = 12_000;

/** Output width. Shots arrive at exactly this width, so it is a floor, not a scale. */
const WEBP_WIDTH = 1440;

/**
 * Measured against the six seed sites at full height: every one lands between
 * ~55KB and ~230KB, against the ~600KB budget a repo-committed image gets. That
 * is enough headroom to have kept the quality the light/dark crops used rather
 * than trading legibility for bytes nothing was short of — these are design
 * reference shots, and a soft screenshot of a typeface is not a reference.
 *
 * The number that actually bounds the worst case is `MAX_SHOT_PX`, not this one:
 * a dense, image-heavy page held at 12,000px is the only shape that approaches
 * the budget, and no quality setting fixes that without spoiling the other five.
 */
const WEBP_QUALITY = 82;

/** Sharp's slowest, smallest setting. Six images a run — the seconds are free. */
const WEBP_EFFORT = 6;

/* ---------------------------------------------------------------------------
   Palette
   --------------------------------------------------------------------------- */

/** How many colours a palette holds at most. Six swatches is a row, not a chart. */
const PALETTE_SIZE = 6;

/** The shot, shrunk to this width before counting pixels. ~200k samples is plenty. */
const PALETTE_SAMPLE_WIDTH = 160;

/**
 * Channel bits kept when binning. 3 bits gives 8 levels per channel and 512
 * buckets, which is coarse enough that a gradient counts as one colour and fine
 * enough that a brand red and a brand orange stay apart.
 */
const PALETTE_BITS = 3;

/** Minimum RGB distance between two colours in the result. Below this they read as one. */
const PALETTE_MIN_DISTANCE = 44;

/** Above/below this relative luminance a colour is "the background", not "a colour". */
const NEAR_WHITE = 0.9;
const NEAR_BLACK = 0.08;

/**
 * Share of the image an extreme has to own before it earns a slot. A white page
 * IS white — that is worth saying — but a white margin around a coloured hero is
 * not the site's palette.
 */
const EXTREME_MIN_SHARE = 0.15;

/** Repo-root `public/shots` — where the site expects to find its imagery. */
export const DEFAULT_OUT_DIR = fileURLToPath(
  new URL("../public/shots", import.meta.url),
);

class ShotTimeout extends Error {}

/**
 * Rejects if `work` outruns the deadline. The underlying page work is not
 * cancellable, so the caller still has to close the context afterwards —
 * which is why the context below is closed by its owner, not by `shoot`.
 *
 * @template T
 * @param {Promise<T>} work
 * @param {string} label
 * @returns {Promise<T>}
 */
function withDeadline(work, label) {
  /** @type {ReturnType<typeof setTimeout>} */
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new ShotTimeout(`${label} exceeded ${SHOT_TIMEOUT_MS}ms`)),
      SHOT_TIMEOUT_MS,
    );
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

/**
 * One page, one PNG buffer of the whole scroll.
 *
 * @param {import("playwright").Browser} browser
 * @param {string} url
 * @param {(line: string) => void} log
 * @param {string} slug   Only so the clip notice names the entry it is about.
 * @returns {Promise<Buffer>}
 */
async function shoot(browser, url, log, slug) {
  const context = await browser.newContext({
    // No `colorScheme`. Forcing one is what produced the old light/dark pair;
    // leaving it alone is what makes the shot the site's own default rendering.
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    // Sites that gate on motion preference should render their resting state:
    // a shot taken mid-animation is a shot of nothing.
    reducedMotion: "reduce",
  });

  try {
    return await withDeadline(
      (async () => {
        const page = await context.newPage();
        page.setDefaultTimeout(SHOT_TIMEOUT_MS);

        await page.goto(url, {
          waitUntil: "load",
          timeout: SHOT_TIMEOUT_MS,
        });

        // Webfonts swap in after `load`. Shooting before they land gives you a
        // screenshot of the fallback stack, which is a screenshot of the wrong
        // site. A page with no webfonts resolves this immediately.
        await page.evaluate(() => document.fonts.ready);

        await page.waitForTimeout(SETTLE_MS);

        const height = await page.evaluate(() => {
          const { body, documentElement: root } = document;
          return Math.max(
            body?.scrollHeight ?? 0,
            body?.offsetHeight ?? 0,
            root.scrollHeight,
            root.offsetHeight,
            root.clientHeight,
          );
        });

        if (height > MAX_SHOT_PX) {
          log(
            `capture: ${slug} is ${height}px tall, clipped to the first ${MAX_SHOT_PX}px`,
          );
          // `fullPage` AND `clip`: the two together mean "the whole document,
          // then this window of it". `clip` on its own is measured against the
          // viewport, so it would silently hand back the top 900px and call it
          // a 12,000px capture — which looks like a working clip right up until
          // you open the file.
          return await page.screenshot({
            type: "png",
            fullPage: true,
            clip: { x: 0, y: 0, width: VIEWPORT.width, height: MAX_SHOT_PX },
          });
        }

        return await page.screenshot({ type: "png", fullPage: true });
      })(),
      `shot of ${url}`,
    );
  } finally {
    await context.close().catch(() => {
      // The browser is torn down by the caller regardless; a close failure
      // here would otherwise mask the real capture error.
    });
  }
}

/**
 * Relative luminance, near enough. Rec. 709 weights on raw sRGB rather than
 * linearised channels: this only ever decides "is this basically the page
 * background", and the gamma step would not move that answer.
 *
 * @param {number} r @param {number} g @param {number} b @returns {number} 0..1
 */
function luminance(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** @param {number} value @returns {string} */
function hex(value) {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");
}

/**
 * The colours a screenshot is mostly made of, most common first.
 *
 * Frequency binning rather than k-means, and on purpose: k-means on a screenshot
 * spends its iterations separating shades of the same off-white, needs a seed to
 * be reproducible, and would be a dependency. Coarse bins plus a distance filter
 * get the same six swatches deterministically, in one pass, from a 160px thumbnail.
 *
 * Near-white and near-black are held to a higher bar than everything else. Almost
 * every page is mostly background, so without that rule every palette on the site
 * would open with white, black, and four greys.
 *
 * @param {Buffer} image   Any format sharp can read.
 * @param {object} [options]
 * @param {number} [options.size]   How many colours at most.
 * @returns {Promise<string[]>}     Lowercase `#rrggbb`, dominant first.
 */
export async function extractPalette(image, { size = PALETTE_SIZE } = {}) {
  const { data, info } = await sharp(image)
    .resize({
      width: PALETTE_SAMPLE_WIDTH,
      fit: "inside",
      withoutEnlargement: true,
      // The default kernel invents intermediate colours along every edge; on a
      // page of flat brand colours those averages would outvote the real ones.
      kernel: "nearest",
    })
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const shift = 8 - PALETTE_BITS;
  const levels = 1 << PALETTE_BITS;

  /** @type {Map<number, { r: number, g: number, b: number, count: number }>} */
  const bins = new Map();
  let total = 0;

  for (let i = 0; i + channels <= data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const key = ((r >> shift) * levels + (g >> shift)) * levels + (b >> shift);
    const bin = bins.get(key);
    if (bin === undefined) {
      bins.set(key, { r, g, b, count: 1 });
    } else {
      bin.r += r;
      bin.g += g;
      bin.b += b;
      bin.count += 1;
    }
    total += 1;
  }

  if (total === 0) return [];

  // Each bin's mean colour, so the swatch is a colour that was actually on the
  // page rather than the corner of the bucket it fell into.
  const candidates = [...bins.values()]
    .map(({ r, g, b, count }) => ({
      r: r / count,
      g: g / count,
      b: b / count,
      share: count / total,
    }))
    .sort((a, b) => b.share - a.share);

  /** @type {{ r: number, g: number, b: number }[]} */
  const picked = [];

  const farEnough = (/** @type {{ r: number, g: number, b: number }} */ colour) =>
    picked.every((seen) => {
      const dr = seen.r - colour.r;
      const dg = seen.g - colour.g;
      const db = seen.b - colour.b;
      return Math.sqrt(dr * dr + dg * dg + db * db) >= PALETTE_MIN_DISTANCE;
    });

  for (const colour of candidates) {
    if (picked.length >= size) break;

    const lum = luminance(colour.r, colour.g, colour.b);
    const extreme = lum >= NEAR_WHITE || lum <= NEAR_BLACK;
    if (extreme && colour.share < EXTREME_MIN_SHARE) continue;

    if (farEnough(colour)) picked.push(colour);
  }

  // A page of nothing but faint greys can filter itself down to nothing. An
  // empty palette is worse than an honest one, so fall back to raw dominance.
  if (picked.length === 0) {
    for (const colour of candidates) {
      if (picked.length >= size) break;
      if (farEnough(colour)) picked.push(colour);
    }
  }

  return picked.map(({ r, g, b }) => `#${hex(r)}${hex(g)}${hex(b)}`);
}

/**
 * PNG buffer in, WebP file on disk out.
 *
 * @param {Buffer} png
 * @param {string} file
 * @returns {Promise<string>}
 */
async function writeWebp(png, file) {
  const webp = await sharp(png)
    .resize({ width: WEBP_WIDTH, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
    .toBuffer();
  await writeFile(file, webp);
  return file;
}

/**
 * Capture one site: one full-page shot, and the colours it is made of.
 *
 * @param {object} options
 * @param {string} options.url        Page to shoot.
 * @param {string} options.slug       Filename stem; also the gallery slug.
 * @param {string} [options.outDir]   Defaults to repo `public/shots`.
 * @param {(line: string) => void} [options.log]
 *   Where a clipped capture is reported. `console.warn` by default, which is
 *   right for the CLI at the bottom of this file and wrong inside a pipeline
 *   run: those lines go to stderr, outside the run log, so the one sentence
 *   explaining why an entry stops mid-page would land where nobody is reading.
 *   `apply.mjs` passes the run's own logger.
 * @returns {Promise<{ shot: string, palette: string[] }>}
 *   Absolute path of the file written, and its dominant colours.
 */
export async function captureSite({
  url,
  slug,
  outDir = DEFAULT_OUT_DIR,
  log = console.warn,
}) {
  if (typeof url !== "string" || url.trim() === "") {
    throw new Error("captureSite needs a url");
  }
  if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`captureSite needs a URL-safe slug (got ${JSON.stringify(slug)})`);
  }

  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    const png = await shoot(browser, url, log, slug);

    // Palette off the PNG, not the WebP: lossy encoding smears flat colour into
    // a spray of near-neighbours, which is exactly what the binning counts.
    const palette = await extractPalette(png);
    const shot = await writeWebp(png, path.join(outDir, `${slug}.webp`));

    return { shot, palette };
  } finally {
    await browser.close();
  }
}

/* ---------------------------------------------------------------------------
   CLI — `node pipeline/capture.mjs <url> <slug>`
   Writes into public/shots/ and prints what it wrote.
   --------------------------------------------------------------------------- */

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const [url, slug] = process.argv.slice(2);

  if (!url || !slug) {
    console.error("usage: node pipeline/capture.mjs <url> <slug>");
    process.exit(2);
  }

  try {
    const result = await captureSite({ url, slug });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`capture failed for ${slug}: ${describe(error)}`);
    process.exit(1);
  }
}
