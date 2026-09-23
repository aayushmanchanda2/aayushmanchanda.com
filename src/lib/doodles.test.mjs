/**
 * The pen-mark set (VET-251): `src/assets/doodles/doodles.json` is output, and
 * `scripts/doodles.mjs` is its source. A hand edit to the JSON, or a script
 * change nobody re-ran, fails here.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { build } from "../../scripts/doodles.mjs";

const committed = JSON.parse(readFileSync(new URL("../assets/doodles/doodles.json", import.meta.url), "utf8"));

test("the committed set is what the script writes", () => {
  assert.deepEqual(committed, build());
});

test("twelve shapes, three distinct variants each", () => {
  const shapes = Object.values(build());
  assert.equal(shapes.length, 12);
  for (const { variants } of shapes) {
    assert.equal(variants.length, 3);
    assert.equal(new Set(variants.map((paths) => paths.join())).size, 3);
  }
});
