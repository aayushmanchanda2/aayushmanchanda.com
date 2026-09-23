/**
 * Tags and the identity palette, under test.
 *
 * **A word keeps its colour.** `hueSlot` is a hash, and since VET-219 its only
 * consumer is the post monogram (tags are plain grey now). A hash is the kind
 * of code someone "improves" (a different multiplier, a `charCodeAt` swap, a
 * modulo moved outside the loop), and every one of those quietly recolours
 * every monogram. The table below is what known words resolve to, written out,
 * so that edit fails here instead of on the page.
 *
 * **The palette has one size.** The module hands out slots and
 * `styles/chip.css` paints them; a slot with no rule renders the fallback.
 *
 * **A chip only ever points somewhere.** Every tag on every entry has to be a
 * group in `libraryTags`, because that list is the route table for
 * `/library/tag/<slug>` — a tag the derived view missed would be a chip linking
 * to a 404.
 *
 * **The chip is the plain TopicTag box**, and the rows that wrap it keep its
 * 40px hit area from overlapping the line beside it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { library, libraryTags } from "./library.ts";
import { MONOGRAM_HUES, hueSlot, tagLabel } from "./tags.ts";

/**
 * The tags as they were when tags still wore hues, and the slot each hashed to.
 * Kept as a fixed corpus for the hash: not generated from the module it is
 * checking, and a diff here is the point.
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

test("every known word still hashes to the slot it shipped with", () => {
  for (const [slug, hue] of Object.entries(SHIPPED)) {
    assert.equal(
      hueSlot(slug),
      hue,
      `${slug} moved from slot ${hue} to slot ${hueSlot(slug)}. hueSlot changed, so every monogram on the site just changed colour: if that was the intention, this table moves with it.`,
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
      Number.isInteger(hue) && hue >= 0 && hue < MONOGRAM_HUES,
      `hueSlot(${JSON.stringify(word)}) returned ${hue}, which is not a slot`,
    );
  }
});

test("the label is the slug with the hyphens taken out", () => {
  assert.equal(tagLabel("go-to-market"), "go to market");
  assert.equal(tagLabel("agents"), "agents");
  assert.equal(tagLabel("second-brain"), "second brain");
});

test("the stylesheet paints exactly as many slots as the module hands out", () => {
  const css = readFileSync(fileURLToPath(new URL("../styles/chip.css", import.meta.url)), "utf8");

  // Keyed on the bare attribute: the table is written for any consumer, and
  // `.monogram` is the one today.
  const slots = new Set(
    [...css.matchAll(/^\[data-hue="(\d+)"\]/gm)].map((match) => Number(match[1])),
  );

  assert.deepEqual(
    [...slots].sort((a, b) => a - b),
    Array.from({ length: MONOGRAM_HUES }, (_, index) => index),
    `styles/chip.css paints ${slots.size} slots and lib/tags.ts hands out ${MONOGRAM_HUES}. A slot with no rule falls back to slot 0's colour.`,
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

test("the tag is the plain TopicTag box: solid grey hairline, no hue, no mark", () => {
  const css = readFileSync(
    fileURLToPath(new URL("../styles/chip.css", import.meta.url)),
    "utf8",
  );

  const open = css.indexOf("\n.tag {");
  assert.ok(open !== -1, "styles/chip.css no longer declares `.tag`");
  const block = css.slice(open, css.indexOf("\n}", open));

  assert.match(block, /border: 1px solid var\(--hairline-strong\);/);
  assert.match(block, /height: 1\.75rem;/, "the tag is 28px tall (ui-skills h-8, one step down)");
  assert.match(block, /font-family: var\(--font-sans\);/);
  assert.ok(
    !/\.tag[^{]*\{[^}]*--hue-/.test(css),
    "a `.tag` rule reads the hue table again. Tags are grey since VET-219; the table is the monogram's.",
  );
  assert.ok(
    !css.includes(".tag::before") && !css.includes(".tag__icon"),
    "a dot or a mark came back on the tag",
  );

  for (const file of ["components/TagChips.astro", "components/TagFilters.astro"]) {
    const source = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8");
    assert.ok(!source.includes("data-hue"), `${file} puts a hue on a tag again`);
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

test("every row that wraps tag chips is at least as tall as their targets", () => {
  /*
   * A tag draws 28px and claims 40 through an `::after` reaching `0.375rem`
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
  const tagReach = Number(overreach[1]);

  /**
   * Every container that lays tag chips out in a wrapping row, its row gap, and
   * any other overreach sharing that row. The entry strip also carries the kind
   * chip, whose `::after` reaches further than a tag's.
   */
  /** @type {[string, RegExp, RegExp | null][]} */
  const ROWS = [
    ["components/TagChips.astro", /\.tags\s*\{[^}]*gap:\s*([\d.]+)rem/, null],
    ["components/TagFilters.astro", /\.filters__row\s*\{[^}]*gap:\s*([\d.]+)rem/, null],
    [
      "pages/library/[slug].astro",
      /\n  \.strip\s*\{[^}]*gap:\s*([\d.]+)rem/,
      /\.strip__chip::after\s*\{[^}]*inset:\s*-([\d.]+)rem 0;/,
    ],
  ];

  for (const [file, pattern, other] of ROWS) {
    const source = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8");
    const gap = source.match(pattern);
    assert.ok(gap, `${file} no longer states a row gap on the row its tag chips wrap in`);
    const otherReach = other ? Number(source.match(other)?.[1] ?? 0) : 0;
    const needed = Math.max(tagReach, otherReach) * 2;
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
   * it below twice the chip's overreach. The extra air was a *line box*.
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

test("the tag is an 8px box and the chip a pill, both off the token scale", () => {
  /*
   * ui-skills' TopicTag is `rounded-lg`, 8px, on its 32px box; ours is 28px and
   * keeps the 8px (`--r-md`). The `.chip` is a pill, `--r-pill`. Both are tokens, so a
   * shape is never typed outside `styles/global.css`.
   */
  const chip = readFileSync(
    fileURLToPath(new URL("../styles/chip.css", import.meta.url)),
    "utf8",
  );
  const global = readFileSync(
    fileURLToPath(new URL("../styles/global.css", import.meta.url)),
    "utf8",
  );

  assert.match(global, /--r-md: 8px;/, "the tag radius left the token block");
  assert.match(chip, /\n\.tag \{[^}]*border-radius: var\(--r-md\);/);
  assert.match(chip, /\n\.chip \{[^}]*border-radius: var\(--r-pill\);/);
  // The focus ring takes the element's own radius, so a focused tag under
  // `global.css › :focus-visible`'s `--r-sm` would draw a 4px ring round an
  // 8px box.
  assert.match(
    chip,
    /\.tag:focus-visible \{[^}]*border-radius: var\(--r-md\);/,
    "a focused tag draws a 4px ring around an 8px box",
  );
});

test("the kind chip on an entry strip claims the same target its tags do", () => {
  /*
   * They sit on the same line, and the tags there claim 40px (28px plus
   * 0.375rem either side). A 20.3px kind chip needs 0.62rem either side to
   * claim the same. §4's stated hit-area exception is for text — a word in a
   * row of words — and a chip is not one.
   */
  const page = readFileSync(
    fileURLToPath(new URL("../pages/library/[slug].astro", import.meta.url)),
    "utf8",
  );
  assert.match(
    page,
    /\.strip__chip::after\s*\{[^}]*inset:\s*-0\.62rem 0;/,
    "the kind chip on a /library entry lost its 40px target, leaving a 20.3px box next to the 40px tags on its own line",
  );
  assert.match(
    page,
    /\.strip__chip\s*\{[^}]*position:\s*relative;/,
    "the kind chip's hit area is absolutely positioned against something other than the chip",
  );
});

test("the filter row caps at twelve and never hides the tag you are on", () => {
  /*
   * VET-220. Thirty-two chips were eight lines on a phone before the list, so
   * `TagFilters` shows the twelve busiest and a "Show all N" chip. Two things a
   * later edit could quietly break: the number, and the exemption that keeps a
   * tag page's `aria-current` chip visible when its tag ranks past the cap.
   */
  const source = readFileSync(
    fileURLToPath(new URL("../components/TagFilters.astro", import.meta.url)),
    "utf8",
  );
  assert.match(source, /const TAG_CAP = 12;/);
  assert.match(
    source,
    /index >= TAG_CAP && slug !== current/,
    "the current tag can fall into the collapsed tail, so a tag page can hide its own selected chip",
  );
  assert.match(source, /<li data-more hidden>/, "the button shows without scripting, where it does nothing");
  assert.match(source, /hidden > 0 &&/, "the button renders when the tail it toggles is empty");
});
