/**
 * palette.mjs — the colours a screenshot is mostly made of.
 *
 * Its own module because it is not part of taking the picture. A buffer goes in
 * and six hex strings come out; there is no browser, no network and no disk on
 * this side of the line, which is why the rules below can be pinned by tests
 * that generate their fixtures arithmetically rather than by shooting a page.
 * `capture.mjs` calls it once per shot and hands the result to the gallery.
 *
 * The whole file is one judgement repeated: which colours a reader would say the
 * page IS. That is a claim this site makes about somebody else's design, so the
 * constants carry the reasoning behind them — widening a bin or dropping the
 * extreme rule changes the claim, not the implementation.
 */

import sharp from "sharp";

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
