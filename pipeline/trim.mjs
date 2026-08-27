/**
 * trim.mjs — the judgement that finds where a capture stops being a page.
 *
 * The third browserless judgement, next to `challenge.mjs` (is this a page or a
 * wall?) and `palette.mjs` (what colours is it made of?). This one asks: does
 * the picture keep going after the page has ended? Nothing here launches
 * anything; the row scan takes a buffer and the decision takes an array of
 * numbers, so the thresholds can be checked against the shots this repo has
 * actually committed — which is exactly how they were set.
 *
 * Why there is anything to trim. A scroll-driven site — GSAP pins, Lenis,
 * scroll-distance sections — reports a document height that includes the
 * DISTANCE its animations consume, not just the content they paint. The
 * full-page screenshot renders that whole height, and everything past the last
 * painted section arrives as a flat run of background. creativeatishay.in is
 * the reference case: 5,280px of document, painted content ending near 3,400,
 * then ~1,760px of blank with one orphaned footer fragment at the very bottom
 * (the footer's decorative trees paint; its scroll-revealed text never does).
 * save.design is the other: 23,090px measured, painted content ending near
 * 6,600, and everything after the clip's 12,000px ceiling minus that is band.
 *
 * The scan is `challenge.mjs`'s measurement carried down to the row: the same
 * per-channel standard deviation, the same maximum-across-channels (a row that
 * is one hue with a bright accent is still a row of content), judged per row
 * instead of over the whole image. And the thresholds follow the same
 * discipline — each one is the middle of a measured gap between the shots that
 * must survive and the artifacts that must not, with both anchors named.
 */

import sharp from "sharp";

/**
 * Highest per-row standard deviation a row can have and still be blank.
 *
 * Measured, not guessed. A flat background row survives WebP encoding at a
 * deviation of 2 or less across every committed shot; the faintest row of real
 * content — Atishay Tuli's pale small type — measures about 10. This sits at
 * the geometric middle of those two. One consequence is deliberate:
 * save.design's dotted background texture measures 2–4 per row, so it lands on
 * the blank side, which is right — a texture is ground, not content, and the
 * band it covers is exactly the artifact this module exists to remove.
 */
const ROW_BLANK_SD = 4;

/**
 * Shortest run of blank rows the trim will treat as a tail, in pixels.
 *
 * This is the number that keeps real footers alive, so it is calibrated
 * against every committed shot. The largest stretch of blank a real page in
 * the gallery carries anywhere is 259 rows (an interior gap on rareui.com);
 * the largest trailing one is 140 (Inspora's bottom padding). The smallest
 * scroll-distance band is 858 rows (save.design's dotted stretch), and the
 * atishay band is 1,763. The geometric middle of 259 and 858 is 471; this
 * rounds up, so it sits roughly 2x above the widest real gap and 0.6x below
 * the narrowest known artifact.
 */
const TRIM_MIN_RUN_PX = 500;

/**
 * Most rows of content the trim may discard below a blank run, in pixels.
 *
 * A scroll-distance page can leave a fragment pinned to the document's true
 * bottom, stranded under the band: creativeatishay.in's footer trees are 102
 * rows of ink floating 1,763px below the last painted section, with the rest
 * of their footer never painted at all. Publishing that fragment after a wall
 * of blank misrepresents the page worse than ending it at the content does,
 * so a small island below a qualifying run is discarded with the run. 160 is
 * ~1.5x the known fragment. A real footer under a real gap is the case this
 * bounds against — and no committed shot has any blank run long enough to put
 * one at risk, which is what {@link TRIM_MIN_RUN_PX} holds.
 */
const TRIM_MAX_ORPHAN_ROWS = 160;

/**
 * How much of the blank run survives the cut, in pixels.
 *
 * The trim ends the page the way real pages end. Committed shots close with
 * 34–140px of natural bottom padding, so the cut keeps 120 of the run rather
 * than slamming the new bottom edge against the last row of ink.
 */
const TRIM_KEEP_PX = 120;

/**
 * Shortest shot the trim will produce, in pixels — one viewport, the same 900
 * the capture context renders. A page whose content fits inside its first
 * screen is a page; a trim that leaves less than a screen has misread one, and
 * the blank-shot backstop in `challenge.mjs` is the right judge of a capture
 * that is genuinely empty.
 */
const TRIM_MIN_HEIGHT_PX = 900;

/**
 * Per-row deviation, the row-level version of `challenge.mjs › measureShot`.
 *
 * For each row: the standard deviation of each colour channel across the row,
 * and the maximum of those — not the mean, for the same reason the blank-shot
 * backstop takes the maximum: a row that is one hue with a bright accent is
 * still a row with something on it. Alpha is ignored; a screenshot's
 * transparency is not its content.
 *
 * @param {Buffer} image  Anything sharp can decode; in practice the PNG.
 * @returns {Promise<Float64Array>}  One deviation per row, top to bottom.
 */
export async function rowVariances(image) {
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const colours = Math.min(channels, 3);

  const rows = new Float64Array(height);
  for (let y = 0; y < height; y += 1) {
    const base = y * width * channels;
    let widest = 0;
    for (let c = 0; c < colours; c += 1) {
      let sum = 0;
      let squares = 0;
      for (let x = 0; x < width; x += 1) {
        const value = data[base + x * channels + c];
        sum += value;
        squares += value * value;
      }
      const mean = sum / width;
      const deviation = Math.sqrt(Math.max(0, squares / width - mean * mean));
      if (deviation > widest) widest = deviation;
    }
    rows[y] = widest;
  }
  return rows;
}

/**
 * The height this shot should be, or null to leave it alone.
 *
 * One walk from the bottom row upward, carrying two counts: the length of the
 * blank run currently underfoot, and how many rows of ink have been passed so
 * far. Every time the run underfoot is at least {@link TRIM_MIN_RUN_PX} while
 * the ink below it is within {@link TRIM_MAX_ORPHAN_ROWS}, the top of that run
 * becomes the cut — so the walk climbs through a stack of band, fragment, band
 * (save.design's shape: 4,523px of flat, seven rows of "scroll to explore",
 * 858px of dotted band) and settles at the highest cut that discards only
 * blank and orphans. The first stretch of real content ends the walk: no cut
 * above it could qualify, because everything below a cut counts against the
 * orphan budget.
 *
 * @param {ArrayLike<number>} rows  Per-row deviations, from {@link rowVariances}.
 * @returns {number | null}  New height in rows, or null when nothing trims.
 */
export function findTrim(rows) {
  const height = rows.length;

  /** @type {number | null} */
  let cut = null;
  let run = 0;
  let ink = 0;

  for (let y = height - 1; y >= 0; y -= 1) {
    if (rows[y] <= ROW_BLANK_SD) {
      run += 1;
      if (run >= TRIM_MIN_RUN_PX && ink <= TRIM_MAX_ORPHAN_ROWS) cut = y;
    } else {
      ink += 1;
      if (ink > TRIM_MAX_ORPHAN_ROWS) break;
      run = 0;
    }
  }

  if (cut === null) return null;

  const to = cut + TRIM_KEEP_PX;
  if (to < TRIM_MIN_HEIGHT_PX) return null;
  return to;
}

/**
 * The shot without its blank tail, or null when it never had one.
 *
 * Runs before the encode in `capture.mjs › finish`, which is what keeps the
 * rest of that path honest for free: the WebP is encoded once at the final
 * height, the blank-shot backstop measures the file that will be committed,
 * and the palette is read off pixels the gallery will actually show — a tail
 * this size would otherwise vote thousands of rows of background into the
 * dominant colours.
 *
 * Trimming is idempotent by construction: the output ends in exactly
 * {@link TRIM_KEEP_PX} rows of blank, which is far below
 * {@link TRIM_MIN_RUN_PX}, so a second pass finds nothing.
 *
 * @param {Buffer} png
 * @returns {Promise<{ png: Buffer, from: number, to: number } | null>}
 *   The shorter image plus both heights for the run log, or null.
 */
export async function trimTrailingBlank(png) {
  const rows = await rowVariances(png);
  const to = findTrim(rows);
  if (to === null) return null;

  const { width } = await sharp(png).metadata();
  if (width === undefined) return null;

  const trimmed = await sharp(png)
    .extract({ left: 0, top: 0, width, height: to })
    .png()
    .toBuffer();

  return { png: trimmed, from: rows.length, to };
}
