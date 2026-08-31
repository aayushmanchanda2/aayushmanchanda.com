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

test("every tag a row wears is drawn, and the ring is what says one is not", () => {
  const glyph = readFileSync(
    fileURLToPath(new URL("../components/TagGlyph.astro", import.meta.url)),
    "utf8",
  );

  const open = glyph.indexOf("const GLYPHS: Record<string, string> = {");
  assert.ok(open !== -1, "TagGlyph.astro no longer declares GLYPHS");
  const block = glyph.slice(open, glyph.indexOf("\n};", open));

  // Both spellings a key takes: a bare identifier and a quoted hyphenated slug.
  const drawn = new Set([...block.matchAll(/^ {2}"?([a-z-]+)"?:/gm)].map((match) => match[1]));

  // A drawn tag nothing is filed under is a row in a table nobody can see.
  for (const slug of drawn) {
    assert.ok(
      libraryTags.some((group) => group.slug === slug),
      `TagGlyph.astro draws "${slug}" and nothing on the site is filed under it. Delete the row, or file something under the word.`,
    );
  }

  const undrawn = libraryTags.map((group) => group.slug).filter((slug) => !drawn.has(slug));
  assert.deepEqual(
    undrawn,
    [],
    `these tags fall back to the ring: ${undrawn.join(", ")}. That is a working state rather than a bug — a tag arrives from Raindrop and a drawing does not, so the ring is what an unmapped word is meant to wear. The assertion is here so the day it happens is a decision, taken by drawing the word or by moving this line, instead of something nobody noticed.`,
  );
});

test("the mark is drawn on the same grid as every other icon on the site", () => {
  const glyph = readFileSync(
    fileURLToPath(new URL("../components/TagGlyph.astro", import.meta.url)),
    "utf8",
  );

  assert.match(glyph, /viewBox="0 0 16 16"/, "the icon set is one 16-unit grid");
  assert.match(glyph, /fill="none"/);
  assert.match(glyph, /stroke="currentColor"/);
  assert.ok(
    !/#[0-9a-fA-F]{3,8}|hsl\(|rgb\(/.test(glyph),
    "TagGlyph.astro names a colour. The hue table lives in styles/chip.css, and a colour typed outside styles/ is the bug design.md §1 opens with.",
  );
  assert.ok(
    !/\bwidth:|\bheight:/.test(glyph),
    "TagGlyph.astro sizes itself. The icon's size is part of the chip's own height arithmetic, so styles/chip.css owns it.",
  );
});

test("the chip is painted rather than described: the dot is gone and the outline is dotted", () => {
  const css = readFileSync(
    fileURLToPath(new URL("../styles/chip.css", import.meta.url)),
    "utf8",
  );

  const open = css.indexOf("\n.tag {");
  assert.ok(open !== -1, "styles/chip.css no longer declares `.tag`");
  const block = css.slice(open, css.indexOf("\n}", open));

  assert.match(
    block,
    /border: 1px dotted hsl\(var\(--hue-h\) var\(--hue-s\) var\(--hue-l\)\)/,
    "the tag's outline is a dotted 1px in its own hue. Solid would be the `.chip` pill with the fill taken out, and the two vocabularies would read as one system saying two things.",
  );
  assert.ok(
    !css.includes(".tag::before"),
    "the 6px dot is back. It was replaced by the outline and the mark inside it — design.md §1 carries the reversal, and both cannot be true at once.",
  );
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

test("every row that wraps tag chips is at least as tall as their targets", () => {
  /*
   * A tag draws 20.3px and claims 40 through an `::after` reaching `0.62rem`
   * above and below it (design.md §4's floor). That overreach has to land on
   * empty line, and whether it does is a property of the *container*, not of
   * the chip — so it is checkable, and it went wrong the moment a third
   * container started laying these out.
   *
   * `library/[slug].astro › .strip` was that container. It inherited `gap: 0`
   * from the /tools strip it was copied from, where nothing claims more room
   * than it draws, and once it wrapped on a phone the first tag's target
   * covered the kind chip by 9.9px and the domain link by 8.6px. Measured, not
   * inferred. design.md §4 states the rule twice: adjacent targets may touch,
   * never overlap.
   *
   * So the arithmetic is read out of the stylesheet rather than written down
   * here, and a fourth container has to come and add itself.
   */
  const chip = readFileSync(
    fileURLToPath(new URL("../styles/chip.css", import.meta.url)),
    "utf8",
  );

  const overreach = chip.match(/\.tag::after\s*\{[^}]*inset:\s*-([\d.]+)rem 0;/);
  assert.ok(overreach, "styles/chip.css no longer extends the tag's hit area, so the 40px floor is gone");
  const needed = Number(overreach[1]) * 2;

  /** Every container that lays tag chips out in a wrapping row, and its row gap. */
  const ROWS = [
    ["components/TagChips.astro", /\.tags\s*\{[^}]*gap:\s*([\d.]+)rem/],
    ["components/TagFilters.astro", /\.filters__row\s*\{[^}]*gap:\s*([\d.]+)rem/],
    ["pages/library/[slug].astro", /\n  \.strip\s*\{[^}]*gap:\s*([\d.]+)rem/],
  ];

  for (const [file, pattern] of ROWS) {
    const source = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8");
    const gap = source.match(pattern);
    assert.ok(gap, `${file} no longer states a row gap on the row its tag chips wrap in`);
    assert.ok(
      Number(gap[1]) >= needed,
      `${file} wraps tag chips ${gap[1]}rem apart and their targets need ${needed}rem. The upper line eats presses meant for the lower one — design.md §4, adjacent targets may touch, never overlap.`,
    );
  }
});

test("a row of tag chips is as tall as the chips, not as tall as a line of text", () => {
  /*
   * **VET-114, and it is the other half of the row gap above.** Aayush's review
   * of the filter row: the line spacing looks weird. The gap was not the
   * culprit and could not be — it is a hit area, and design.md §4 will not have
   * it below `2 × 0.62rem`. The extra air was a *line box*.
   *
   * An `li` is a block box and a `.tag` is `inline-flex`, so the chip sat on a
   * text baseline inside a strut as tall as the inherited line-height: measured
   * live on `/library`, a 20.27px chip inside a 25.59px item, so every wrapped
   * line carried 5.32px nobody chose and the pitch came out at 45.59px. Making
   * the item a flex container blockifies the chip and the strut has nothing to
   * hold — pitch 40.27px, and what is left between two lines is the row gap and
   * only the row gap.
   *
   * It is worth a test rather than a comment because the symptom is invisible
   * in the source: every number in the stylesheet looks right, the check above
   * passes, and the row is simply looser than all of them say. A container that
   * lays these out has to say so.
   */
  // Annotated because `checkJs` is on and a mixed tuple widens to
  // `(string | RegExp)[]`, which `assert.match` will not take.
  /** @type {[string, RegExp][]} */
  const ROWS = [
    ["components/TagChips.astro", /\.tags li \{[^}]*display: flex;/],
    ["components/TagFilters.astro", /\.filters__row li \{[^}]*display: flex;/],
  ];

  for (const [file, pattern] of ROWS) {
    const source = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8");
    assert.match(
      source,
      pattern,
      `${file} puts its tag chips back in a line box, so every wrapped line is ~5px taller than its row gap says and the chips stop sitting where the arithmetic above puts them`,
    );
  }
});

test("the tag is a pill and the chip is not, which is how they stay two things", () => {
  /*
   * Aayush asked whether the filter chips should be pills and the answer is
   * yes, so the tag takes `--r-pill` and the `.chip` keeps its 4px box. That is
   * the separation the dotted border already draws — design.md §1 holds the tag
   * out of the chip's vocabulary on purpose — carried into the shape, and
   * design.md §3 counts a pill as no corner at all rather than as a fourth
   * radius.
   *
   * Neither half may drift: a `.chip` turning into a pill collapses the
   * distinction, and a `.tag` going back to `--r-sm` on the one row where the
   * two sit side by side (`library/[slug].astro › .strip`) makes them one
   * object saying two things.
   */
  const chip = readFileSync(
    fileURLToPath(new URL("../styles/chip.css", import.meta.url)),
    "utf8",
  );
  const global = readFileSync(
    fileURLToPath(new URL("../styles/global.css", import.meta.url)),
    "utf8",
  );

  assert.match(
    global,
    /--r-pill: 999px;/,
    "the pill radius left the token block, so a shape is stated outside styles/",
  );
  assert.match(
    chip,
    /\n\.tag \{[^}]*border-radius: var\(--r-pill\);/,
    "the tag stopped being a pill, which is the question Aayush asked about this chip answered the other way",
  );
  assert.match(
    chip,
    /\n\.chip \{[^}]*border-radius: var\(--r-sm\);/,
    "the chip became something other than the 4px box. A pill beside a pill on one strip is two idioms collapsing into one.",
  );
  // The focus ring takes the element's own radius, so a focused pill under
  // `global.css › :focus-visible`'s `--r-sm` would draw corners on two ends
  // that have none.
  assert.match(
    chip,
    /\.tag:focus-visible \{[^}]*border-radius: var\(--r-pill\);/,
    "a focused tag draws a 4px ring around a 999px pill",
  );
});

test("the kind chip on an entry strip claims the same target its tags do", () => {
  /*
   * They are the same box at the same size on the same line: design.md §1
   * measures both at 20.28px so that two pixels between them cannot read as a
   * mistake, and 20.3px of target beside 40.1px of target is that mistake at
   * twice the size. §4's stated hit-area exception is for text — a word in a
   * row of words — and a chip is not one.
   */
  const page = readFileSync(
    fileURLToPath(new URL("../pages/library/[slug].astro", import.meta.url)),
    "utf8",
  );
  assert.match(
    page,
    /\.strip__chip::after\s*\{[^}]*inset:\s*-0\.62rem 0;/,
    "the kind chip on a /library entry lost its 40px target, leaving a 20.3px box next to the 40.1px tags on its own line",
  );
  assert.match(
    page,
    /\.strip__chip\s*\{[^}]*position:\s*relative;/,
    "the kind chip's hit area is absolutely positioned against something other than the chip",
  );
});
