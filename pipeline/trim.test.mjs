/**
 * The trim, held to the pixels it was calibrated on.
 *
 * The fixtures in `pipeline/fixtures/` are real: cropped out of the two
 * captures that shipped with scroll-distance tails (creativeatishay.in and
 * save.design, as committed before the recapture) and out of two real pages
 * whose quiet endings the trim must leave alone. Synthetic rows are used only
 * to pin the threshold arithmetic — the judgement calls are proven against
 * pictures the pipeline actually took, because a trim that only works on
 * fixtures built to suit it is the bug `challenge.mjs` warns about, one module
 * over.
 *
 * The tail fixtures are cropped high enough to keep more than one viewport of
 * page above the band, because the trim refuses to cut a shot down below
 * 900px — a fixture that tripped that floor would be testing the guard, not
 * the detection.
 */

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { findTrim, rowVariances, trimTrailingBlank } from "./trim.mjs";

/** @param {string} name @returns {Promise<Buffer>} */
async function fixture(name) {
  return await readFile(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)));
}

/* ---------------------------------------------------------------------------
   The two tails that shipped
   --------------------------------------------------------------------------- */

test("the atishay tail is cut at the band, and the orphaned footer trees go with it", async () => {
  // Rows 2400-5322 of the shot that shipped: the last painted sections, then
  // 1,784px of blank scroll distance, then 102 rows of footer decoration
  // stranded at the document's true bottom — the rest of that footer never
  // painted. In crop coordinates the band starts at 1,032.
  const trimmed = await trimTrailingBlank(await fixture("atishay-tail.webp"));

  assert.notEqual(trimmed, null, "this is the capture the ticket is about");
  assert.equal(trimmed?.from, 2922);
  assert.equal(
    trimmed?.to,
    1152,
    "the band's top plus the 120px of bottom padding a real page ends with",
  );
});

test("the save.design tail is cut above the dotted band, not just above the flat one", async () => {
  // Rows 5700-12000: real content to 912 (crop coordinates), then the dotted
  // scroll-to-explore stretch, seven rows of hint text, and 4,523px of flat
  // dark. The walk climbs through band, fragment, band and settles at the
  // highest cut that discards only blank and orphans.
  const trimmed = await trimTrailingBlank(await fixture("save-design-tail.webp"));

  assert.notEqual(trimmed, null);
  assert.equal(trimmed?.from, 6300);
  assert.equal(trimmed?.to, 1032, "912 of painted page, plus the kept padding");
});

test("a trimmed shot does not trim again", async () => {
  // Idempotence is by construction — the output ends in 120px of blank, far
  // under the 500px a tail needs — but construction is the thing this suite
  // exists to check.
  const trimmed = await trimTrailingBlank(await fixture("atishay-tail.webp"));

  assert.ok(trimmed);
  assert.equal(findTrim(await rowVariances(trimmed.png)), null);
});

/* ---------------------------------------------------------------------------
   The footers that must survive
   --------------------------------------------------------------------------- */

test("Inspora's quiet ending is not a tail", async () => {
  // The bottom 700 rows, closing with 140px of padding — the longest natural
  // trailing blank in the gallery, and the anchor under the 500px threshold.
  assert.equal(await trimTrailingBlank(await fixture("inspora-footer.webp")), null);
});

test("rareui's interior gap is not a tail either", async () => {
  // The bottom 1,200 rows, containing a 259px near-uniform stretch mid-page —
  // the longest blank run any real page in the gallery carries anywhere.
  assert.equal(await trimTrailingBlank(await fixture("rareui-footer.webp")), null);
});

test("every committed shot is already trim-clean", async () => {
  // The calibration claim, standing: the thresholds were set so that nothing
  // in `public/shots` trims. A shot the pipeline writes has been trimmed
  // already, so a failure here means either a hand-committed tail or a
  // threshold that drifted onto a real page.
  const shotsDir = new URL("../public/shots/", import.meta.url);

  const shots = (await readdir(fileURLToPath(shotsDir))).filter((name) =>
    name.endsWith(".webp"),
  );
  assert.ok(shots.length > 0, "an empty gallery would make this test vacuous");

  for (const name of shots) {
    const image = await readFile(fileURLToPath(new URL(name, shotsDir)));
    assert.equal(
      findTrim(await rowVariances(image)),
      null,
      `${name} carries a trailing blank tail — recapture it, or the thresholds have drifted`,
    );
  }
});

/* ---------------------------------------------------------------------------
   The threshold arithmetic, on synthetic rows
   --------------------------------------------------------------------------- */

/**
 * A per-row deviation profile, written as content/blank runs top to bottom.
 *
 * @param {readonly [kind: "content" | "blank", rows: number][]} runs
 * @returns {number[]}
 */
function profile(runs) {
  return runs.flatMap(([kind, rows]) => Array(rows).fill(kind === "blank" ? 0 : 30));
}

test("a run one row short of the threshold is bottom padding, not a tail", () => {
  assert.equal(findTrim(profile([["content", 1000], ["blank", 499]])), null);
  assert.equal(findTrim(profile([["content", 1000], ["blank", 500]])), 1120);
});

test("the orphan budget is a budget, not an invitation", () => {
  // 160 rows of ink under the band travel with it; 161 is a footer, and a
  // footer ends the walk before the band above it can qualify.
  const island = (/** @type {number} */ rows) =>
    profile([["content", 1000], ["blank", 600], ["content", rows]]);

  assert.equal(findTrim(island(160)), 1120);
  assert.equal(findTrim(island(161)), null);
});

test("a cut below one viewport is refused, whatever the tail looks like", () => {
  // A one-screen page with a tail, and a page that is nothing but blank: both
  // would trim to less than a screen, and neither is this module's call — the
  // blank-shot backstop in challenge.mjs judges an empty capture.
  assert.equal(findTrim(profile([["content", 300], ["blank", 900]])), null);
  assert.equal(findTrim(profile([["blank", 2000]])), null);
});
