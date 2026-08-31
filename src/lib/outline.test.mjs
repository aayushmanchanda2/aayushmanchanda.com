/**
 * The image outline, under test.
 *
 * A drift test in the sense `lib/clamp.test.mjs` and `lib/overscroll.test.mjs`
 * are: it parses shipped files as text, because there is no runtime to ask what
 * an `.astro` component drew.
 *
 * **What it holds is a rule that was false for months and looked fine.**
 * `styles/global.css › .outlined` shipped as `box-shadow: inset 0 0 0 1px`, and
 * an inner shadow is painted above an element's background and below its
 * content — so on an `<img>`, where the content is the picture and there is no
 * padding to leave a gap, the ring is drawn and then covered. Eight of the nine
 * things wearing the class are images, so the declaration did nothing on all
 * eight. The ninth is a `<span>`, where it worked, which is the only reason
 * anything looked inconsistent at all.
 *
 * Nothing caught it because **the failure of an outline is a missing hairline**,
 * and no page looks broken without one. It surfaced by putting a white image on
 * the white theme and going looking for its edge. That is exactly the class of
 * bug a drift test is for: true in the design document, false on the page, and
 * invisible to every gate in between.
 *
 * The second half is the trap the fix introduces. `.outlined` sits after
 * `:focus-visible` in `global.css` and has the same specificity, so an
 * `.outlined` element that can take focus would silently lose its ring. Nothing
 * wearing the class is focusable today; this is what makes the day one is a
 * failing build rather than a keyboard user with nowhere to look.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("..", import.meta.url));

/**
 * Every shipped file under `src/`, tests skipped. Same walk `clamp.test.mjs`
 * uses, and the return annotation is load-bearing for the same reason:
 * `checkJs` is on and a recursive function inferring its own return type is
 * ts7023.
 *
 * @param {string} dir
 * @returns {string[]} paths relative to `src/`, forward-slashed
 */
function walk(dir) {
  return readdirSync(path.join(SRC, dir)).flatMap((entry) => {
    const rel = dir === "" ? entry : `${dir}/${entry}`;
    if (statSync(path.join(SRC, rel)).isDirectory()) return walk(rel);
    return entry.endsWith(".test.mjs") ? [] : [rel];
  });
}

/** @param {string} name @returns {string} */
const read = (name) => readFileSync(path.join(SRC, name), "utf8");

/**
 * A file with its comments taken out, so a sweep reads what shipped and not
 * what was written about it.
 *
 * @param {string} source
 * @returns {string}
 */
const code = (source) => source.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "");

test("the image outline is a real outline, because an inset shadow is not one", () => {
  const css = code(read("styles/global.css"));

  const open = css.indexOf("\n.outlined {");
  assert.ok(open !== -1, "styles/global.css no longer declares `.outlined`");
  const block = css.slice(open, css.indexOf("\n}", open));

  assert.match(
    block,
    /outline:\s*1px solid var\(--outline\);/,
    "`.outlined` stopped using a real outline. An inset box-shadow is painted under a replaced element's own picture, so on the eight images wearing this class it draws nothing at all — design.md §8.",
  );
  assert.match(
    block,
    /outline-offset:\s*-1px;/,
    "the outline sits outside the box, so it adds a pixel to every image's footprint instead of being inset like the shadow it replaced",
  );
  assert.ok(
    !/box-shadow/.test(block),
    "`.outlined` is back to a box-shadow. It is invisible on an `<img>`; `ShotFrame.astro › .scroller` worked this out for its own children and the general case is the same one.",
  );
});

test("the outline colour is pure black and pure white, never a tinted neutral", () => {
  // A tinted near-black picks up the surface under it and reads as dirt on the
  // image edge, which is why `--outline` is declared separately from `--fg`
  // and its channels rather than derived from them.
  const css = code(read("styles/global.css"));
  assert.match(
    css,
    /--outline:\s*rgb\(0 0 0 \/ 0\.1\);/,
    "the light theme's image outline is no longer pure black at 10%",
  );
  assert.match(
    css,
    /--outline:\s*rgb\(255 255 255 \/ 0\.1\);/,
    "the dark theme's image outline is no longer pure white at 10%",
  );
});

test("nothing focusable wears the class, because it would lose its focus ring", () => {
  /*
   * `.outlined` is declared after `:focus-visible` in `global.css` and matches
   * at the same specificity, so on a focusable element the 1px hairline wins
   * and the 2px accent ring never paints. Every consumer today is an `<img>` or
   * an `aria-hidden` `<span>`; this fails on the first one that is not.
   */
  const wearing = walk("").filter((file) => /\boutlined\b/.test(code(read(file))));

  // The stylesheet that declares it, and the components that spend it.
  assert.ok(wearing.length > 1, "nothing uses `.outlined` any more; the rule is dead code");

  for (const file of wearing) {
    if (file === "styles/global.css") continue;
    const source = code(read(file));
    for (const tag of source.matchAll(/<(\w+)[^>]*\bclass(?::list)?=[^>]*\boutlined\b[^>]*>/g)) {
      assert.ok(
        ["img", "span", "div"].includes(tag[1]),
        `${file} puts \`.outlined\` on a <${tag[1]}>. If it can take focus it has just lost its focus ring — the rule sits after \`:focus-visible\` at the same specificity.`,
      );
      assert.ok(
        !/\btabindex=/.test(tag[0]),
        `${file} puts \`.outlined\` on something with a tabindex, which silently replaces its focus ring with a 1px hairline`,
      );
    }
  }
});
