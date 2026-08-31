/**
 * The wide page, and where it is allowed to stop.
 *
 * `/library`'s rows carry a tags column, and a column needs room the 44rem
 * shell does not have, so `Base.astro` takes a `wide` prop that lifts the
 * content column to `--page-wide`. The whole risk in that concession is scope.
 * There are two easy ways to widen a page and only one of them is right:
 *
 *   - `.shell__main--wide { max-width: var(--page-wide) }` widens the content.
 *   - `.shell { … }`, or a page redeclaring `--page-max` on `:root`, widens the
 *     content **and the footer under it**, because both read the same token.
 *
 * The second one looks identical on the page you were testing. It shows up as a
 * colophon that is 44rem on eleven pages and 52rem on four, which nobody
 * notices from inside one page — it is a difference between pages, and the
 * reader who sees it is the one who navigated. So the token's consumers are a
 * fixed list here rather than a sentence in design.md.
 *
 * Parsed as text, the same move `theme.test.mjs` and `overscroll.test.mjs`
 * make on the stylesheets: there is no runtime to ask.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("..", import.meta.url));

/** The one file allowed to declare either width token, relative to `src/`. */
const TOKENS_LIVE_IN = "styles/global.css";

/**
 * Every shipped file under `src/`, tests skipped, so a new surface cannot land
 * outside the sweep.
 *
 * The return annotation is not decoration: `checkJs` is on, and a recursive
 * function that infers its own return type from its own call is an error
 * (ts7023), not a hint. design.md §8 gate 1.
 *
 * @param {string} dir
 * @returns {string[]} absolute paths
 */
function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return entry.endsWith(".test.mjs") ? [] : [full];
  });
}

/**
 * Every line that *declares* one of the two width tokens, with its file.
 *
 * A declaration is `--page-max:`; a use is `var(--page-max)`. Only the first
 * can move the footer, which is why the sweep looks for it and not for both.
 *
 * @returns {{ file: string, line: number, token: string }[]}
 */
function declarations() {
  return walk(SRC).flatMap((full) =>
    readFileSync(full, "utf8")
      .split("\n")
      .flatMap((text, index) => {
        const match = text.match(/(--page-max|--page-wide)\s*:/);
        return match
          ? [
              {
                file: path.relative(SRC, full).split(path.sep).join("/"),
                line: index + 1,
                token: match[1],
              },
            ]
          : [];
      }),
  );
}

/**
 * The scoped stylesheet inside `layouts/Base.astro`, flattened to one selector
 * per entry. Nested at-rules fall out of the walk on their own: a selector
 * whose body still contains braces cannot match, so `@media` wrappers are
 * skipped and the rules inside them are read at their own selector.
 *
 * @returns {Map<string, string>}
 */
function shellRules() {
  const source = readFileSync(path.join(SRC, "layouts/Base.astro"), "utf8");
  const open = source.indexOf("<style>");
  const close = source.indexOf("</style>");
  assert.ok(open !== -1 && close > open, "Base.astro has no scoped stylesheet");

  const css = source.slice(open + "<style>".length, close).replace(/\/\*[\s\S]*?\*\//g, "");

  /** @type {Map<string, string>} */
  const found = new Map();
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = match[2].replace(/\s+/g, " ").trim();
    for (const selector of match[1].split(",")) {
      const trimmed = selector.trim().replace(/\s+/g, " ");
      if (trimmed) found.set(trimmed, declarations);
    }
  }
  return found;
}

/**
 * @param {Map<string, string>} rules
 * @param {string} token
 * @returns {string[]}
 */
function consumersOf(rules, token) {
  return [...rules]
    .filter(([, declarations]) => declarations.includes(`var(${token})`))
    .map(([selector]) => selector)
    .sort();
}

test("both width tokens are declared once, in global.css", () => {
  for (const token of ["--page-max", "--page-wide"]) {
    const found = declarations().filter((one) => one.token === token);
    assert.deepEqual(
      found.map((one) => one.file),
      [TOKENS_LIVE_IN],
      `${token} is declared somewhere other than ${TOKENS_LIVE_IN}. Redeclaring it scoped to a page widens the footer with the content, because the colophon reads the same token — widen \`.shell__main\` instead.`,
    );
  }
});

test("only the content column takes the wide width", () => {
  assert.deepEqual(
    consumersOf(shellRules(), "--page-wide"),
    [".shell__main--wide"],
    "something other than the content column reads --page-wide. The footer must stay at --page-max on every page: it is the same colophon closing all of them.",
  );
});

test("the footer and the default column still cap at --page-max", () => {
  assert.deepEqual(consumersOf(shellRules(), "--page-max"), [".foot", ".shell__main"]);
});

test("the shell itself caps nothing", () => {
  // `.shell` is the flex column holding main and the footer. A max-width there
  // would cap both at once and take the `wide` prop's decision away from the
  // page that made it.
  for (const [selector, declarations] of shellRules()) {
    if (selector !== ".shell") continue;
    assert.ok(
      !declarations.includes("max-width"),
      `.shell declares a max-width (${declarations}). Cap .shell__main, never the shell.`,
    );
  }
});

test("the sweep is actually finding declarations", () => {
  // A regex that silently stops matching would make the first test pass by
  // finding nothing, which is the failure mode a text-parsing test has.
  assert.equal(declarations().length, 2);
  assert.ok(shellRules().size > 20);
});
