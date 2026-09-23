/**
 * The hover card's placement and trigger attributes. `PreviewCard.astro` only
 * wires these to the DOM.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { placeCard, previewAttributes } from "./preview-card.ts";

const card = { width: 400, height: 280 };
const viewport = { width: 1280, height: 800 };
/** @param {number} top */
const row = (top) => ({ top, bottom: top + 56, left: 100, width: 1000 });

test("the card sits 8px below its trigger, centred on the cursor", () => {
  assert.deepEqual(placeCard(row(300), card, viewport, 640), { left: 440, top: 364, side: "bottom" });
});

test("near the viewport floor it flips above", () => {
  const placed = placeCard(row(600), card, viewport, 640);
  assert.equal(placed.side, "top");
  assert.equal(placed.top, 600 - 8 - 280);
});

test("it stays below when there is no room above either", () => {
  assert.equal(placeCard(row(250), card, { width: 1280, height: 500 }, 640).side, "bottom");
});

test("it shifts to stay 20px inside both sides", () => {
  assert.equal(placeCard(row(300), card, viewport, 30).left, 20);
  assert.equal(placeCard(row(300), card, viewport, 1270).left, 1280 - 20 - 400);
});

test("with no cursor (keyboard focus) it centres on the trigger", () => {
  assert.equal(placeCard(row(300), card, viewport, null).left, 100 + 500 - 200);
});

test("attributes: empty image means icon-only, a note repeating the description is dropped", () => {
  assert.deepEqual(previewAttributes({ image: null, name: "Eve", domain: "eve.dev", description: "A", note: "A" }), {
    "data-preview": "",
    "data-preview-name": "Eve",
    "data-preview-domain": "eve.dev",
    "data-preview-description": "A",
  });
  assert.equal(previewAttributes({ image: "/p.webp", name: "Eve", domain: "", note: "B" })["data-preview-note"], "B");
});
