/**
 * The /thumbs copies (VET-309), under test: every path a page names is one the
 * build writes, so a card can never point at a copy that does not exist.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { cropOf, phoneOf, posterSrcset, previewOf, variantsOf } from "./thumbs.ts";

const SHOT = "/shots/arc-from-the-browser-company.webp";
const built = new Set(variantsOf(SHOT).map((variant) => `/thumbs/${variant.name}`));
/** @param {string} srcset */
const candidates = (srcset) => srcset.split(", ").map((candidate) => candidate.split(" ")[0]);

test("every path a site shot's pictures name is a copy the build writes", () => {
  const crop = cropOf(SHOT);
  for (const path of [...candidates(crop.avif), ...candidates(crop.webp), crop.src, previewOf(SHOT), phoneOf(SHOT)]) {
    assert.ok(built.has(path), `${path} is named but never built`);
  }
});

test("a card's copy is the top of the shot at 8:5, never the full page", () => {
  const crop = cropOf(SHOT);
  assert.equal(crop.width / crop.height, 8 / 5);
  assert.ok(![crop.src, ...candidates(crop.webp), ...candidates(crop.avif)].some((path) => path.startsWith("/shots/")));
});

test("a video poster gets one tile copy, and none when it is already that small", () => {
  const thumb = "/shots/some-talk-thumb.webp";
  assert.deepEqual(variantsOf(thumb).map((variant) => variant.name), ["some-talk-thumb-640.webp"]);
  assert.equal(posterSrcset(thumb, 1280), "/thumbs/some-talk-thumb-640.webp 640w, /shots/some-talk-thumb.webp 1280w");
  assert.equal(posterSrcset(thumb, 480), undefined);
});
