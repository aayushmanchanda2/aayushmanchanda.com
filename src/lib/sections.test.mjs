/**
 * The section list, and the one copy of it that lives outside the build.
 *
 * `lib/sections.ts › CATALOGUE` is the manifest: the rail nav, the mobile
 * panel and the home index all read it, so those three cannot disagree with
 * each other by construction. The social card can. `scripts/og.mjs` runs under
 * plain node to lay its text out in a real browser, and `sections.ts` imports
 * `astro:content`, which only resolves inside a build — so the card keeps a
 * hand-written copy of the list and there is no import that would keep it
 * honest.
 *
 * It went stale exactly the way a copy does. Reading was renamed to Library and
 * every surface that reads the manifest moved with it; the card, which reads
 * nothing, kept saying `tools · sites · notes · experiments`. Four sections
 * instead of five, on every link anyone shared, for as long as the rename has
 * been live. Nothing surfaced it because a social card is the one asset that is
 * never looked at from the site it belongs to — `design.md` §3's lesson about
 * `favicon.svg`, a second time, on a second file.
 *
 * So the two lists are compared here as text. Parsing rather than importing is
 * the same move `theme.test.mjs` makes on the stylesheets and `mark.test.mjs`
 * makes on the mark: when a value cannot be shared at runtime, the test is what
 * shares it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** @param {string} relative */
const read = (relative) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const SECTIONS_TS = read("./sections.ts");
const OG = read("../../scripts/og.mjs");

/**
 * Every `href` in `CATALOGUE`, in source order, with the leading slash dropped.
 *
 * Scoped to the `CATALOGUE` block rather than run over the whole file, because
 * `SectionHref` above it lists the same five strings and `getSections` below it
 * lists them again as `counts` keys. Matching the file would find fifteen.
 */
function catalogueSections() {
  const block = SECTIONS_TS.match(
    /const CATALOGUE:[^=]*=\s*\[([\s\S]*?)\n\];/,
  );
  assert.ok(
    block,
    "could not find the CATALOGUE array in sections.ts — if it was renamed or reshaped, this test has to learn the new shape",
  );

  return [...block[1].matchAll(/href:\s*"\/([a-z-]+)"/g)].map((m) => m[1]);
}

/** The card's hand-kept copy, `scripts/og.mjs › SECTIONS`. */
function cardSections() {
  const block = OG.match(/const SECTIONS = \[([^\]]*)\]/);
  assert.ok(
    block,
    "could not find SECTIONS in scripts/og.mjs — the card's section list has to stay a named array so this test can read it",
  );

  return [...block[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
}

test("the manifest still parses to the five sections the site has", () => {
  assert.deepEqual(catalogueSections(), [
    "tools",
    "sites",
    "library",
    "notes",
    "experiments",
  ]);
});

test("the social card names every section, in the manifest's order", () => {
  assert.deepEqual(
    cardSections(),
    catalogueSections(),
    "scripts/og.mjs and lib/sections.ts disagree about the sections. Fix og.mjs, then `npm run og` and commit public/og.png — the card is generated, so editing the source alone changes nothing anyone sees.",
  );
});

test("the card renders that list rather than a second hand-typed one", () => {
  // The bug this file exists for was a literal string in the markup. Reading
  // the array and then typing the words out again below it would restore it.
  assert.match(
    OG,
    /class="sections">\$\{SECTIONS\.join\(/,
    "the .sections paragraph must interpolate SECTIONS, not spell the sections out",
  );
});
