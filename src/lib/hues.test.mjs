/**
 * Colour families (VET-55), under test.
 *
 * **A swatch names the family a reader would.** Pinned on plain colours and on
 * the near-misses the rules exist for: a cream, a grey, a dark orange.
 *
 * **Prominence weighs.** The same faint tint joins a family at the head of a
 * palette and not at its tail; a vivid tail accent still does.
 *
 * **No site falls through.** Every gallery entry lands in at least one family
 * (drift: a new capture, or a retuned constant, cannot leave a card that no
 * chip reaches).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { HUE_FAMILIES, familyCounts, paletteFamilies, readHue, swatchFamily, withHue } from "./hues.ts";

test("swatchFamily names plain colours", () => {
  assert.equal(swatchFamily("#e53935"), "red");
  assert.equal(swatchFamily("#fa4c01"), "orange");
  assert.equal(swatchFamily("#fdd835"), "yellow");
  assert.equal(swatchFamily("#43a047"), "green");
  assert.equal(swatchFamily("#00acc1"), "teal");
  assert.equal(swatchFamily("#0a84ff"), "blue");
  assert.equal(swatchFamily("#a000ff"), "purple");
  assert.equal(swatchFamily("#ec407a"), "pink");
});

test("swatchFamily leaves neutrals out and calls a dark orange brown", () => {
  for (const neutral of ["#ffffff", "#000000", "#737373", "#f9f8f8", "#09090b"]) {
    assert.equal(swatchFamily(neutral), null, neutral);
  }
  assert.equal(swatchFamily("#513019"), "brown");
  assert.equal(swatchFamily("#4e1700"), "brown");
});

test("paletteFamilies weights by rank", () => {
  // A faint sky blue counts at the head of a palette and not at the tail.
  assert.deepEqual(paletteFamilies(["#b6d5ef", "#ffffff"]), ["blue"]);
  assert.deepEqual(paletteFamilies(["#ffffff", "#eeeeee", "#dddddd", "#cccccc", "#bbbbbb", "#b6d5ef"]), ["mono"]);
  // A vivid accent at the tail still does.
  assert.deepEqual(paletteFamilies(["#ffffff", "#eeeeee", "#dddddd", "#cccccc", "#bbbbbb", "#fc494e"]), ["red"]);
});

test("paletteFamilies returns wheel order, and mono only when nothing else", () => {
  assert.deepEqual(paletteFamilies(["#0a84ff", "#fa4c01"]), ["orange", "blue"]);
  assert.deepEqual(paletteFamilies(["#ffffff", "#000000", "#777777"]), ["mono"]);
});

test("familyCounts leaves out a family nothing is in", () => {
  assert.deepEqual(familyCounts([["#0a84ff"], ["#0a84ff", "#43a047"], ["#ffffff"]]), [
    { family: "green", count: 1 },
    { family: "blue", count: 2 },
    { family: "mono", count: 1 },
  ]);
});

test("readHue and withHue: the URL is the state, an unknown hue reads as All", () => {
  assert.equal(readHue("?hue=blue", ["blue", "mono"]), "blue");
  assert.equal(readHue("?hue=teal", ["blue", "mono"]), "");
  assert.equal(readHue("", ["blue"]), "");
  assert.equal(withHue("?x=1", "blue"), "?x=1&hue=blue");
  assert.equal(withHue("?hue=blue", ""), "");
});

test("drift: every gallery site lands in at least one family", () => {
  const sites = JSON.parse(readFileSync(new URL("../data/sites.json", import.meta.url), "utf8"));
  for (const site of sites) {
    const families = paletteFamilies(site.palette);
    assert.ok(families.length > 0, site.slug);
    for (const family of families) assert.ok(HUE_FAMILIES.includes(family), `${site.slug}: ${family}`);
  }
});
