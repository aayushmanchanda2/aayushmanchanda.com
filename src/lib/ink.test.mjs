/**
 * The four text levels, measured, and the ink floor.
 *
 * design.md §2 and §4. Two halves, both parsed from source the way
 * `theme.test.mjs` reads the stylesheets, because there is no runtime here:
 *
 *  1. The tokens. Recompute every text level over its own page background in
 *     both themes. Primary, secondary and tertiary hold AA (4.5:1), so a
 *     retuned token cannot quietly take metadata or controls under it.
 *     Quaternary sits under 3:1, which is why it is decoration only.
 *
 *  2. The ink floor. Controls sit on `--text-secondary`, a level above the
 *     metadata beside them, so a control never reads as a label. Every
 *     selector design.md §4 names must still declare it: a slide back to
 *     `--text-tertiary` is the one-word edit nobody catches in review.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const read = (/** @type {string} */ rel) => readFileSync(SRC + rel, "utf8");

const globalCss = read("styles/global.css");

/* --- half one: the tokens ------------------------------------------------- */

/**
 * A declared colour as [r, g, b, alpha]: `#rrggbb` or `rgb(r g b / a)`.
 *
 * @param {string} css
 * @returns {[number, number, number, number]}
 */
function parse(css) {
  const hex = css.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex) return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16), 1];
  const rgb = css.match(/^rgb\((\d+) (\d+) (\d+) \/ ([0-9.]+)\)$/);
  assert.ok(rgb, `not a colour this test reads: ${css}`);
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4])];
}

/** @param {number[]} rgb */
function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG ratio of a (possibly translucent) ink composited over an opaque bg. */
function ratio(/** @type {string} */ ink, /** @type {string} */ bg) {
  const [r, g, b, a] = parse(ink);
  const ground = parse(bg);
  const blend = [r, g, b].map((v, i) => v * a + ground[i] * (1 - a));
  const x = luminance(blend) + 0.05;
  const y = luminance(ground) + 0.05;
  return Math.max(x, y) / Math.min(x, y);
}

/** One declaration's value out of a CSS slice. */
function value(/** @type {string} */ css, /** @type {string} */ property) {
  const m = css.match(new RegExp(`${property}:\\s*([^;]+);`));
  assert.ok(m, `no ${property} declaration found`);
  return m[1].trim();
}

const darkBlock = globalCss.slice(globalCss.indexOf(':root[data-theme="dark"]'));
const themes = { light: globalCss, dark: darkBlock };

for (const level of ["primary", "secondary", "tertiary"]) {
  test(`--text-${level} clears AA over both page backgrounds`, () => {
    for (const [name, css] of Object.entries(themes)) {
      const r = ratio(value(css, `--text-${level}`), value(css, "--bg"));
      assert.ok(r >= 4.5, `--text-${level} is ${r.toFixed(2)}:1 on the ${name} theme, under AA`);
    }
  });
}

test("--text-quaternary stays under 3:1, so it never carries words", () => {
  for (const [name, css] of Object.entries(themes)) {
    const r = ratio(value(css, "--text-quaternary"), value(css, "--bg"));
    assert.ok(
      r < 3,
      `--text-quaternary is ${r.toFixed(2)}:1 on the ${name} theme. If it is meant to carry text now, ` +
        "design.md §2 changes in the same commit as this assertion.",
    );
  }
});

test("dark text levels are briOS's alpha whites", () => {
  assert.deepEqual(
    ["primary", "secondary", "tertiary", "quaternary"].map((l) => value(darkBlock, `--text-${l}`)),
    ["rgb(255 255 255 / 0.9)", "rgb(255 255 255 / 0.7)", "rgb(255 255 255 / 0.5)", "rgb(255 255 255 / 0.32)"],
  );
});

test("every token the dark theme sets has a light value too", () => {
  // theme.test.mjs holds the two dark blocks to each other; this is the third
  // side. A dark-only token is `unset` on a light page (transparent, or no
  // shadow), and neither fails loudly. VET-240 added seven tokens at once.
  const names = (/** @type {string} */ block) => [...block.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]);
  const light = new Set(names(globalCss.slice(0, globalCss.indexOf("@media (prefers-color-scheme: dark)"))));
  const dark = names(darkBlock.slice(0, darkBlock.indexOf("}")));
  assert.ok(dark.length > 10, "found no dark tokens to check");
  assert.deepEqual(dark.filter((name) => !light.has(name)), []);
});

/**
 * Ink over a translucent tint over an opaque ground: the colour a reader
 * actually sees behind a chip, a highlight or a selection.
 */
function inkOnTint(/** @type {string} */ ink, /** @type {string} */ tint, /** @type {string} */ ground) {
  const [r, g, b, a] = parse(tint);
  const under = parse(ground);
  const flat = [r, g, b].map((v, i) => Math.round(v * a + under[i] * (1 - a)));
  return ratio(ink, `#${flat.map((v) => v.toString(16).padStart(2, "0")).join("")}`);
}

/** A token's value, following one `var()` hop. */
function token(/** @type {string} */ css, /** @type {string} */ name) {
  const v = value(css, name);
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  return ref ? value(css, ref[1]) : v;
}

/* VET-240's pairs, each over the page and over the darkest row surface it can
   sit on. The amber pill holds the chip bar (6:1 over its own tint, design.md
   §1); the highlighter and the selection hold AA. */
/** @type {[string, string, number][]} */
const PAIRS = [
  ["--amber-ink", "--amber-bg", 6],
  ["--text-primary", "--highlight", 4.5],
  ["--selection-ink", "--selection-bg", 4.5],
];

for (const [ink, tint, floor] of PAIRS) {
  test(`${ink} on ${tint} clears ${floor}:1 in both themes`, () => {
    for (const [name, css] of Object.entries(themes)) {
      for (const ground of ["--bg", "--surface-3"]) {
        const r = inkOnTint(token(css, ink), token(css, tint), token(css, ground));
        assert.ok(r >= floor, `${ink} on ${tint} over ${ground} is ${r.toFixed(2)}:1 on the ${name} theme`);
      }
    }
  });
}

/* --- half two: the surfaces ------------------------------------------------ */

/**
 * Every surface design.md §4 names, as (file, selector) pairs. The block that
 * follows the selector must declare `var(--text-secondary)`.
 */
const FLOORS = [
  ["components/Footer.astro", ".foot__quiet {"],
  ["components/ThemeToggle.astro", ".tt {"],
  ["components/ShotActions.astro", ".act {"],
  ["components/ToolList.astro", ".sort {"],
  ["components/LibraryList.astro", ".row__domain {"],
  ["components/LibraryList.astro", ".row__source {"],
  ["pages/experiments.astro", ".row__links :global(.row__link) {"],
  ["components/EntryNav.astro", ".hints__row {"],
  ["pages/tools/[slug].astro", ".source :global(.source__repo) {"],
  ["pages/library/[slug].astro", ".out :global(a) {"],
  ["pages/404.astro", ".agents {"],
  ["styles/palette.css", ".palette__empty {"],
  ["pages/sites.astro", ".collections a {"],
  ["styles/chip.css", ".tag__count {"],
];

test("every ink-floor surface still declares --text-secondary", () => {
  for (const [file, selector] of FLOORS) {
    // Comments out first: a brace inside one (`a { color: ... }` quoted in
    // prose) would otherwise end the block slice early.
    const source = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
    const at = source.indexOf(selector);
    assert.ok(at !== -1, `${file}: selector "${selector}" has moved — update FLOORS and design.md §4 together`);
    const block = source.slice(at, source.indexOf("}", at));
    assert.ok(
      block.includes("var(--text-secondary)"),
      `${file} › ${selector.replace(" {", "")} no longer sits on --text-secondary. ` +
        "It is a control, and controls sit a level above metadata (design.md §4, the ink floor).",
    );
  }
});
