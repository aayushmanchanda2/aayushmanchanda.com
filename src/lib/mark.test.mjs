/**
 * The site mark, under test.
 *
 * The mark is drawn three times: once in `components/SiteMark.astro` for the
 * page, once in `public/favicon.svg` for the tab strip, and once in
 * `scripts/og.mjs` for the social card and the raster icon. It cannot be drawn
 * once — the favicon has to ship as a standalone file with its colours pinned,
 * and the card is rendered by a hand-run script in a throwaway browser that has
 * no Astro build to import a component from.
 *
 * So the copies are compared here instead. Two failures are worth catching and
 * neither is visible from any one file:
 *
 * 1. **Drift.** Nudge the crossbar in the component and the tab strip keeps the
 *    old letter for as long as nobody looks at a 16px icon on purpose. That is
 *    exactly how `favicon.ico` came to be serving a previous brand.
 * 2. **A second stroke weight.** `design.md` says the hairline scale has two
 *    steps and no third, and the mark itself is monoline. A lighter crossbar or
 *    a heavier M is a one-character edit in a file nobody re-reads.
 *
 * The split between what each file carries is deliberate and is asserted too:
 * the page and the card get the AM lockup, the favicon and the raster icon get
 * the A alone, because at 16x16 the lockup has no fully inked pixel in it. If
 * someone "fixes" that inconsistency by pasting the M into `favicon.svg`, this
 * fails and says why.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** @param {string} relative */
const read = (relative) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const COMPONENT = read("../components/SiteMark.astro");
const FAVICON = read("../../public/favicon.svg");
const OG = read("../../scripts/og.mjs");

/**
 * The `<path>` elements in a file, in source order.
 *
 * Elements rather than a bare attribute sweep, because two of these three files
 * describe the mark in prose as well as drawing it, and a sentence quoting an
 * attribute is not a second path.
 *
 * @param {string} source
 * @returns {string[]}
 */
const pathTags = (source) => source.match(/<path\b[^>]*>/g) ?? [];

/**
 * One attribute off every `<path>`, in source order, whitespace normalised so a
 * reformat is not a failure but a moved point is.
 *
 * @param {string} source
 * @param {string} attr
 * @returns {string[]}
 */
function attrs(source, attr) {
  const re = new RegExp(`\\b${attr}="([^"]+)"`);
  return pathTags(source)
    .map((tag) => re.exec(tag)?.[1])
    .filter((v) => v !== undefined)
    .map((v) => v.trim().replace(/\s+/g, " "));
}

/** @param {string} source */
const paths = (source) => attrs(source, "d");
/** @param {string} source */
const weights = (source) => attrs(source, "stroke-width");

/** The A: two paths, and the only thing the favicon is allowed to contain. */
const A = ["M2.2 14.1 L8 3.1 L13.8 14.1", "M5.9 10.4 H10.1"];
/** The M: one path, and never in the favicon. */
const M = "M15.713 14.1 L15.713 1.7 L21.588 12.842 L27.463 1.7 L27.463 14.1";

test("the favicon is the A, exactly as the lockup draws it", () => {
  assert.deepEqual(paths(FAVICON), A);
  assert.deepEqual(paths(COMPONENT).slice(0, 2), A);
});

test("the card is the lockup, exactly as the page draws it", () => {
  assert.deepEqual(paths(COMPONENT), [...A, M]);
  assert.deepEqual(paths(OG), [...A, M]);
});

test("the favicon does not carry the M, on purpose", () => {
  // At 16x16 the lockup's strokes land at 0.81 device pixels and no pixel in it
  // is ever fully inked. If this ever looks like an oversight worth fixing,
  // rasterise both and count solid pixels before touching it.
  assert.ok(!FAVICON.includes(M), "favicon.svg has grown an M");
  assert.equal(paths(FAVICON).length, 2);
});

test("the mark is monoline, in every copy of it", () => {
  for (const [name, source] of [
    ["SiteMark.astro", COMPONENT],
    ["favicon.svg", FAVICON],
    ["og.mjs", OG],
  ]) {
    const found = weights(source);
    assert.ok(found.length > 0, `${name}: no stroke-width at all`);
    assert.deepEqual(
      [...new Set(found)],
      ["1.5"],
      `${name}: the mark has picked up a second stroke weight`,
    );
  }
});

test("the two boxes are the two drawings", () => {
  // 29.75 wide against 16 tall is the lockup; a square 16 is the A alone. The
  // component's CSS sets `height` and lets the width follow, so a box that
  // stopped matching its contents would silently letterbox the glyph.
  assert.match(COMPONENT, /viewBox="0 0 29\.75 16"/);
  assert.match(OG, /viewBox="0 0 29\.75 16"/);
  assert.match(OG, /viewBox="0 0 16 16"/); // the raster icon
  assert.match(FAVICON, /viewBox="0 0 16 16"/);
});

test("the M's top corners are cut and its valley is not", () => {
  // 2.4 sits above the A's apex and the M's valley (both 2.144 miter ratios)
  // and below the M's top corners (4.163), which is the whole reason it is
  // there: points stay points up to the A's own sharpness, and anything
  // sharper is cut flat the way a geometric sans cuts an M.
  for (const [name, source] of [
    ["SiteMark.astro", COMPONENT],
    ["og.mjs", OG],
  ]) {
    assert.deepEqual(
      attrs(source, "stroke-miterlimit"),
      ["2.4"],
      `${name}: only the M takes a miterlimit; the A's apex clears the default`,
    );
    // and it is on the M, not on one of the A's two paths
    assert.match(pathTags(source)[2], /stroke-miterlimit="2\.4"/);
  }
});
