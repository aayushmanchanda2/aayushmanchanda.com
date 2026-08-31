/**
 * The row note cap, under test.
 *
 * A drift test in the sense `lib/wide.test.mjs` and `lib/overscroll.test.mjs`
 * are: it parses shipped files as text, because there is no runtime to ask what
 * an `.astro` component drew.
 *
 * **What it holds is the rule that a clamp only belongs where the overflow has
 * somewhere to go.** A listing row is scanned, so its note stops at two lines
 * and the whole of it renders on the page the row's title points at. A page
 * that IS the overflow may never clamp: `PostBody.astro` exists to render
 * thirty-one thousand characters that the card cut, and a `line-clamp` there
 * would be the site promising a reader something and then hiding it — which is
 * exactly the trade `lib/post.ts` refuses at length and the reason a post is
 * cut in the component rather than in CSS.
 *
 * So the sweep is two-sided. A fourth listing that grows a clamp has to come
 * and add itself here; a detail page that grows one fails.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("..", import.meta.url));

/**
 * Every shipped file under `src/`, tests skipped. Same walk `card.test.mjs`
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
 * what was written about it. Both spellings: `.astro` frontmatter and its
 * scoped CSS use the bare block comment, the template wraps it in braces.
 *
 * @param {string} source
 * @returns {string}
 */
const code = (source) => source.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "");

/** The three listings whose rows carry a note, and the only three that clamp. */
const LISTINGS = [
  "components/LibraryList.astro",
  "components/ToolList.astro",
  "components/VideoFacade.astro",
];

test("every listing note stops at two lines, and nothing else in the build clamps", () => {
  const clamped = walk("").filter((file) => /-webkit-line-clamp/.test(code(read(file))));

  assert.deepEqual(
    clamped.sort(),
    [...LISTINGS].sort(),
    "the set of files clamping a line count changed. A clamp belongs on a listing row whose title goes to a page carrying the whole thing, and nowhere else — a page that is itself the overflow must render all of it (lib/post.ts says why at length).",
  );
});

test("the clamp is spelled both ways, so it is not a prefix nobody standardised", () => {
  for (const file of LISTINGS) {
    const css = code(read(file));
    assert.match(css, /-webkit-line-clamp:\s*2;/, `${file} does not cap its note at two lines`);
    assert.match(
      css,
      /(^|\n)\s*line-clamp:\s*2;/,
      `${file} ships only the prefixed clamp. Both are written: the prefixed one is what every engine actually honours today and the unprefixed one is the property this is.`,
    );
    assert.match(
      css,
      /-webkit-box-orient:\s*vertical;/,
      `${file} clamps without the box orientation, which makes the clamp a no-op`,
    );
    assert.match(css, /overflow:\s*hidden;/, `${file} clamps without hiding the overflow`);
  }
});

test("the pages the overflow lives on render all of it", () => {
  // The other half of the rule, named rather than left to the sweep above: a
  // reader who pressed a clamped row lands on one of these, and finding the
  // same three lines there would make the row a door to nowhere.
  for (const file of [
    "components/PostBody.astro",
    "components/VoiceBlocks.astro",
    "components/DigestBlocks.astro",
    "components/DraftBlock.astro",
    "pages/library/[slug].astro",
    "pages/tools/[slug].astro",
  ]) {
    assert.ok(
      !/line-clamp/.test(code(read(file))),
      `${file} clamps something. It is a detail page, which is where the overflow was sent.`,
    );
  }
});
