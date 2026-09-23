/**
 * The full-width pages, and where the width is allowed to stop.
 *
 * The index pages (/tools, /sites, /library and their filter pages, plus a
 * library entry's list-detail) run edge to edge: `Base.astro`'s `full` prop
 * lifts `.shell__main`'s cap and nothing else. The whole risk in that is
 * scope. There are two easy ways to widen a page and only one of them is right:
 *
 *   - `.shell__main--full { max-width: none }` widens the content.
 *   - `.shell { … }`, or a page redeclaring `--page-max`, widens the content
 *     **and the footer under it**, because both read the same token.
 *
 * The second one looks identical on the page you were testing. It shows up as a
 * colophon that is one width on the reading pages and another on the index
 * pages, which nobody notices from inside one page. So the token's consumers
 * and the list of full-width routes are fixed here rather than in a sentence.
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

/** The one file allowed to declare the column token, relative to `src/`. */
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
 * Every line that *declares* the column token, with its file.
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
        const match = text.match(/(--page-max)\s*:/);
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
 * The scoped stylesheets of the shell, `layouts/Base.astro` and the footer it
 * renders (`components/Footer.astro`), flattened to one selector per entry. Nested at-rules fall out of the walk on their own: a selector
 * whose body still contains braces cannot match, so `@media` wrappers are
 * skipped and the rules inside them are read at their own selector.
 *
 * @returns {Map<string, string>}
 */
function shellRules() {
  const css = ["layouts/Base.astro", "components/Footer.astro"]
    .map((file) => {
      const source = readFileSync(path.join(SRC, file), "utf8");
      const open = source.indexOf("<style>");
      const close = source.indexOf("</style>");
      assert.ok(open !== -1 && close > open, `${file} has no scoped stylesheet`);
      return source.slice(open + "<style>".length, close);
    })
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");

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

/**
 * Every page that passes `full` to Base, relative to `src/pages/`.
 *
 * @returns {string[]}
 */
function fullPages() {
  const pages = path.join(SRC, "pages");
  return walk(pages)
    .filter((full) => full.endsWith(".astro"))
    .filter((full) => /<Base\b[^>]*\n\s+full\n/.test(readFileSync(full, "utf8")))
    .map((full) => path.relative(pages, full).split(path.sep).join("/"))
    .sort();
}

test("the column token is declared once, in global.css", () => {
  assert.deepEqual(
    declarations().map((one) => one.file),
    [TOKENS_LIVE_IN],
    `--page-max is declared somewhere other than ${TOKENS_LIVE_IN}. Redeclaring it scoped to a page widens the footer with the content, because the colophon reads the same token — pass \`full\` to Base instead.`,
  );
});

test("only the content column drops its cap", () => {
  const uncapped = [...shellRules()]
    .filter(([, declarations]) => /max-width: none/.test(declarations))
    .map(([selector]) => selector);
  assert.deepEqual(
    uncapped,
    [".shell__main--full"],
    "something other than the content column lifts its cap. The footer must stay at --page-max on every page: it is the same colophon closing all of them.",
  );
});

test("the footer and the default column still cap at --page-max", () => {
  assert.deepEqual(consumersOf(shellRules(), "--page-max"), [".foot", ".shell__main"]);
});

test("the shell itself caps nothing", () => {
  // `.shell` is the flex column holding main and the footer. A max-width there
  // would cap both at once and take the `full` prop's decision away from the
  // page that made it.
  for (const [selector, declarations] of shellRules()) {
    if (selector !== ".shell" && selector !== ".shell--full") continue;
    assert.ok(
      !declarations.includes("max-width"),
      `${selector} declares a max-width (${declarations}). Cap .shell__main, never the shell.`,
    );
  }
});

test("full width is the index pages and nothing else", () => {
  // Reading pages (notes, about, a tool's page, a site's page, contact,
  // privacy, home) keep the centred column. A new index page joins this list
  // on purpose, and a reading page that lands here is the bug.
  assert.deepEqual(fullPages(), [
    "library.astro",
    "library/[slug].astro",
    "library/domain/[domain].astro",
    "library/kind/[kind].astro",
    "library/tag/[slug].astro",
    "sites.astro",
    "sites/collection/[slug].astro",
    "sites/domain/[domain].astro",
    "tools.astro",
    "tools/category/[category].astro",
    "tools/verdict/[verdict].astro",
  ]);
});

test("the sweep is actually finding declarations", () => {
  // A regex that silently stops matching would make the first test pass by
  // finding nothing, which is the failure mode a text-parsing test has.
  assert.equal(declarations().length, 1);
  assert.ok(shellRules().size > 20);
});
