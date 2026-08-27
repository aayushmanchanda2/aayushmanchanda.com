/**
 * The ink floor: interactive ink never sits below `--muted`.
 *
 * design.md §4. `--faint` is metadata's colour, and composited over the page it
 * measures 2.94:1 on the light theme — under the 4.5:1 the 11px label voice
 * owes and under even the 3:1 a non-text control owes. §3's kind tabs wrote the
 * principle down first ("a control has to clear AA on its own"); this test is
 * what keeps the rest of the site's quiet controls from drifting back.
 *
 * Two halves, both parsed from source the way `theme.test.mjs` reads the
 * stylesheets, because there is no runtime here to ask:
 *
 *  1. The tokens themselves. `--muted` is an alpha over the page background,
 *     so its rendered contrast moves whenever `--bg`, `--fg-channels` or the
 *     alpha moves. Recompute the composite in both themes and hold it at AA,
 *     so a retuned token cannot quietly take every quiet control down with it.
 *
 *  2. The surfaces. Every selector the ink floor names in design.md §4 must
 *     still declare `--muted`. A regression to `--faint` (or to `inherit`
 *     inside a faint container) is exactly the one-word edit nobody catches
 *     in review.
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
 * @param {string} hex six-digit #rrggbb
 * @returns {[number, number, number]}
 */
function channels(hex) {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  assert.ok(m, `not a six-digit hex: ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/** @param {[number, number, number]} rgb */
function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG ratio of fg-at-alpha composited over bg, against bg.
 *
 * @param {[number, number, number]} fg
 * @param {number} alpha
 * @param {[number, number, number]} bg
 */
function ratio(fg, alpha, bg) {
  const blend = /** @type {[number, number, number]} */ (
    fg.map((v, i) => v * alpha + bg[i] * (1 - alpha))
  );
  const a = luminance(blend) + 0.05;
  const b = luminance(bg) + 0.05;
  return Math.max(a, b) / Math.min(a, b);
}

/**
 * Pull one declaration's value out of a CSS slice.
 *
 * @param {string} css
 * @param {string} property
 */
function value(css, property) {
  const m = css.match(new RegExp(`${property}:\\s*([^;]+);`));
  assert.ok(m, `no ${property} declaration found`);
  return m[1].trim();
}

const darkBlock = globalCss.slice(globalCss.indexOf(':root[data-theme="dark"]'));
assert.ok(darkBlock.length > 0, "the pinned-dark block has moved");

const themes = {
  light: {
    bg: channels(value(globalCss, "--bg")),
    fg: /** @type {[number, number, number]} */ (
      value(globalCss, "--fg-channels").split(/\s+/).map(Number)
    ),
  },
  dark: {
    bg: channels(value(darkBlock, "--bg")),
    fg: /** @type {[number, number, number]} */ (
      value(darkBlock, "--fg-channels").split(/\s+/).map(Number)
    ),
  },
};

const alpha = (/** @type {string} */ name) => {
  const m = globalCss.match(
    new RegExp(`${name}: rgb\\(var\\(--fg-channels\\) / ([0-9.]+)\\)`),
  );
  assert.ok(m, `${name} is no longer an alpha over --fg-channels`);
  return Number(m[1]);
};

test("--muted clears AA over both page backgrounds", () => {
  for (const [name, t] of Object.entries(themes)) {
    const r = ratio(t.fg, alpha("--muted"), t.bg);
    assert.ok(
      r >= 4.5,
      `--muted composites to ${r.toFixed(2)}:1 on the ${name} theme — under AA. ` +
        "Every quiet control on the site sits on this token (design.md §4, the ink floor).",
    );
  }
});

test("--faint is still below AA, which is why the floor exists", () => {
  const r = ratio(themes.light.fg, alpha("--faint"), themes.light.bg);
  assert.ok(
    r < 4.5,
    "--faint now clears AA on the light theme. That is not a failure of the site — " +
      "it is a failure of this test's premise, and design.md §4's ink-floor paragraph " +
      "needs rewriting in the same commit as this assertion.",
  );
});

/* --- half two: the surfaces ------------------------------------------------ */

/**
 * Every surface design.md §4 names, as (file, selector) pairs. The block that
 * follows the selector must declare `var(--muted)`.
 */
const FLOORS = [
  ["layouts/Base.astro", ".foot__quiet {"],
  ["styles/global.css", ".crumb {"],
  ["components/ThemeToggle.astro", ".tt {"],
  ["components/ShotActions.astro", ".act {"],
  ["components/ToolList.astro", ".row__more {"],
  ["components/LibraryList.astro", ".row__domain {"],
  ["pages/experiments.astro", ".row__links :global(.row__link) {"],
  ["components/EntryNav.astro", ".hints__row {"],
  ["pages/tools/[slug].astro", ".source :global(.source__repo) {"],
  ["pages/library/[slug].astro", ".strip a:not(.strip__chip) {"],
  ["pages/404.astro", ".agents {"],
  ["styles/palette.css", ".palette__empty {"],
];

test("every ink-floor surface still declares --muted", () => {
  for (const [file, selector] of FLOORS) {
    // Comments out first: a brace inside one (`a { color: ... }` quoted in
    // prose) would otherwise end the block slice early.
    const source = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
    const at = source.indexOf(selector);
    assert.ok(at !== -1, `${file}: selector "${selector}" has moved — update FLOORS and design.md §4 together`);
    const block = source.slice(at, source.indexOf("}", at));
    assert.ok(
      block.includes("var(--muted)"),
      `${file} › ${selector.replace(" {", "")} no longer sits on --muted. ` +
        "It is a control, and interactive ink never sits below --muted (design.md §4, the ink floor).",
    );
  }
});
