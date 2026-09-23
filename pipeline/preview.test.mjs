/**
 * `preview.mjs › encodePreview`: the card's 2x pixels, stepped down in quality
 * until the file fits the budget, and still a picture when nothing fits.
 */

import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { PREVIEW_MAX_BYTES, PREVIEW_WIDTH, encodePreview } from "./preview.mjs";

/** A 1200x630 viewport shot; `sigma` is how busy the page is. @param {number} sigma */
const shot = (sigma) =>
  sharp({ create: { width: 1200, height: 630, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma } } })
    .png()
    .toBuffer();

test("a busy page is stepped down until it fits, at 800x420", async () => {
  const webp = await encodePreview(await shot(30));
  const meta = await sharp(webp).metadata();

  assert.deepEqual([meta.format, meta.width, meta.height], ["webp", PREVIEW_WIDTH, 420]);
  assert.ok(webp.length <= PREVIEW_MAX_BYTES, `${webp.length} bytes`);
  // At the first quality it would not have fit: the step-down did the work.
  assert.ok((await sharp(await shot(30)).resize({ width: PREVIEW_WIDTH }).webp({ quality: 80 }).toBuffer()).length > PREVIEW_MAX_BYTES);
});

test("a page too dense for the budget still gets its picture, at the lowest quality", async () => {
  const webp = await encodePreview(await shot(80));
  assert.equal((await sharp(webp).metadata()).format, "webp");
  assert.ok(webp.length > PREVIEW_MAX_BYTES);
});
