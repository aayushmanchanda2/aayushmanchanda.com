/**
 * The tag dots, under test.
 *
 * Three properties, and the first is the only one a reader would ever notice
 * breaking.
 *
 * **A tag keeps its colour.** `hueSlot` is a hash, so nothing but an edit to the
 * function can move a word from one dot to another — but a hash is also the
 * kind of code someone "improves" (a different multiplier, a `charCodeAt` swap,
 * a modulo moved outside the loop), and every one of those quietly recolours
 * the whole library. The table below is what the shipped data resolves to
 * today, written out, so that edit fails here instead of on the page.
 *
 * **The palette has one size.** The module hands out slots and
 * `styles/chip.css` paints them; a slot with no rule renders the fallback dot
 * and looks like a tag that lost its colour.
 *
 * **A chip only ever points somewhere.** Every tag on every entry has to be a
 * group in `libraryTags`, because that list is the route table for
 * `/library/tag/<slug>` — a tag the derived view missed would be a chip linking
 * to a 404.
 *
 * One thing deliberately *not* tested: that no two tags sharing an entry share
 * a slot. That property is true today and it is how djb2-at-seven was picked
 * over the other candidates, but a new tag can land anywhere, and a failing
 * build is far too loud an answer to two dots that came out the same colour on
 * one row. The word beside the dot is the identifier; the dot is a recognition
 * aid. `lib/tags.ts` says so at more length.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { library, libraryTags } from "./library.ts";
import { TAG_HUES, hueSlot, tagLabel } from "./tags.ts";

/**
 * Every tag in `src/data/library.json` today, and the dot it wears.
 *
 * Not generated from the module it is checking, obviously — these are the
 * numbers as they shipped, and a diff here is the point.
 */
const SHIPPED = {
  agency: 4,
  agents: 6,
  "ai-industry": 1,
  careers: 3,
  design: 5,
  engineering: 2,
  founders: 0,
  "go-to-market": 2,
  harnesses: 0,
  research: 0,
  "second-brain": 2,
  writing: 1,
};

test("every shipped tag still wears the dot it shipped with", () => {
  for (const [slug, hue] of Object.entries(SHIPPED)) {
    assert.equal(
      hueSlot(slug),
      hue,
      `${slug} moved from dot ${hue} to dot ${hueSlot(slug)}. Every tag on the site just changed colour: if that was the intention, this table moves with it.`,
    );
  }
});

test("the same word answers the same twice, and a different one need not", () => {
  assert.equal(hueSlot("agents"), hueSlot("agents"));
  assert.notEqual(hueSlot("agents"), hueSlot("agency"));
});

test("no word can land outside the palette", () => {
  const words = [
    "",
    "a",
    "z".repeat(400),
    "go-to-market",
    "café",
    "第二の脳",
    "0",
    "-",
    "--",
  ];
  for (const word of [...words, ...Object.keys(SHIPPED)]) {
    const hue = hueSlot(word);
    assert.ok(
      Number.isInteger(hue) && hue >= 0 && hue < TAG_HUES,
      `hueSlot(${JSON.stringify(word)}) returned ${hue}, which is not a slot`,
    );
  }
});

test("the label is the slug with the hyphens taken out", () => {
  assert.equal(tagLabel("go-to-market"), "go to market");
  assert.equal(tagLabel("agents"), "agents");
  assert.equal(tagLabel("second-brain"), "second brain");
});

test("the stylesheet paints exactly as many dots as the module hands out", () => {
  const css = readFileSync(fileURLToPath(new URL("../styles/chip.css", import.meta.url)), "utf8");

  // Keyed on the bare attribute rather than on `.tag`, because the monogram on
  // a post card reads the same table now. A sweep for the one class that used
  // to be the only consumer would pass while the shared table was half painted.
  const slots = new Set(
    [...css.matchAll(/^\[data-hue="(\d+)"\]/gm)].map((match) => Number(match[1])),
  );

  assert.deepEqual(
    [...slots].sort((a, b) => a - b),
    Array.from({ length: TAG_HUES }, (_, index) => index),
    `styles/chip.css paints ${slots.size} dots and lib/tags.ts hands out ${TAG_HUES}. A slot with no rule falls back to slot 0's colour and reads as a tag that lost its dot.`,
  );
});

test("every tag a row wears has a page to send it to", () => {
  const routes = new Set(libraryTags.map((group) => group.slug));

  for (const entry of library) {
    for (const slug of entry.tags) {
      assert.ok(
        routes.has(slug),
        `"${entry.slug}" is tagged ${slug}, which has no group in libraryTags — its chip would link to a 404.`,
      );
    }
  }
});

test("every tag page has something on it, and everything on it is tagged", () => {
  for (const group of libraryTags) {
    assert.ok(group.entries.length > 0, `/library/tag/${group.slug} would be an empty page`);
    for (const entry of group.entries) {
      assert.ok(
        entry.tags.includes(group.slug),
        `${entry.slug} is listed under ${group.slug} without carrying it`,
      );
    }
  }
});
