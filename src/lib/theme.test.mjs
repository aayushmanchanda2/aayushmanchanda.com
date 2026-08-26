/**
 * The three-state theme, under test.
 *
 * Two halves, and the second is the reason this file exists.
 *
 * The first half is `lib/theme.ts`: a cycle, some label strings, and the
 * pre-paint script. Cheap to check, and worth checking, because the pre-paint
 * script is a *string* — nothing type-checks it, and if it and the runtime
 * module ever disagree about which word goes in storage, the symptom is a flash
 * of the wrong theme that only shows up on a cold load.
 *
 * The second half is the stylesheets. The dark theme has to be declared twice —
 * once under `prefers-color-scheme` for a reader following their OS, once under
 * `[data-theme="dark"]` for a reader who pinned it — and CSS gives no way to say
 * a block twice without writing it twice. The failure mode is nasty and quiet:
 * add a token to the media query only, and the site looks right for everyone
 * whose OS is already dark, and ships a half-themed page to everyone who pinned
 * dark on a light machine. Nobody finds that by looking, because looking means
 * looking in the state where it works.
 *
 * So the CSS is parsed and the two sets are compared property by property. This
 * is the only thing in the suite that reads a stylesheet, and it reads two.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  ATTRIBUTE,
  PREPAINT,
  STORAGE_KEY,
  THEMES,
  THEME_COLOR_MEDIA,
  isTheme,
  labelFor,
  nextTheme,
  statusFor,
  titleFor,
} from "./theme.ts";

/* -------------------------------------------------------------------------- */
/* the module                                                                  */
/* -------------------------------------------------------------------------- */

test("the cycle is system, light, dark, and back to system", () => {
  assert.equal(nextTheme("system"), "light");
  assert.equal(nextTheme("light"), "dark");
  assert.equal(nextTheme("dark"), "system");
});

test("three presses return to where they started, from any state", () => {
  for (const theme of THEMES) {
    assert.equal(nextTheme(nextTheme(nextTheme(theme))), theme);
  }
});

test("isTheme rejects anything that is not one of the three words", () => {
  for (const theme of THEMES) assert.equal(isTheme(theme), true);
  for (const value of ["", "DARK", "auto", null, undefined, 0, {}]) {
    assert.equal(isTheme(value), false);
  }
});

test("the label names the current theme and the one a press moves to", () => {
  assert.equal(labelFor("system"), "Theme: system. Switch to light.");
  assert.equal(labelFor("light"), "Theme: light. Switch to dark.");
  assert.equal(labelFor("dark"), "Theme: dark. Switch to system.");
});

test("every theme has a title and a spoken status", () => {
  for (const theme of THEMES) {
    assert.ok(titleFor(theme).includes(theme));
  }

  // One sentence shape for all three, so a screen reader announcing the change
  // does not read two of them as a label and one as a name.
  assert.equal(statusFor("system"), "System theme");
  assert.equal(statusFor("light"), "Light theme");
  assert.equal(statusFor("dark"), "Dark theme");
});

test("every theme has a media query for both theme-color metas", () => {
  for (const theme of THEMES) {
    const media = THEME_COLOR_MEDIA[theme];
    assert.ok(media.light, `${theme} has no light media`);
    assert.ok(media.dark, `${theme} has no dark media`);
  }

  // Pinning a theme has to take the decision away from the OS, or the status
  // bar keeps answering to `prefers-color-scheme` while the page does not.
  assert.equal(THEME_COLOR_MEDIA.light.light, "all");
  assert.equal(THEME_COLOR_MEDIA.light.dark, "not all");
  assert.equal(THEME_COLOR_MEDIA.dark.dark, "all");
  assert.equal(THEME_COLOR_MEDIA.dark.light, "not all");
});

test("the pre-paint script carries the same key and attribute as the module", () => {
  assert.ok(
    PREPAINT.includes(JSON.stringify(STORAGE_KEY)),
    "pre-paint script reads a different storage key than the module writes",
  );
  assert.ok(
    PREPAINT.includes(JSON.stringify(ATTRIBUTE)),
    "pre-paint script sets a different attribute than the module reads",
  );
});

test("the pre-paint script embeds the media table rather than a copy of it", () => {
  assert.ok(PREPAINT.includes(JSON.stringify(THEME_COLOR_MEDIA)));
});

test("the pre-paint script cannot throw on a page with storage blocked", () => {
  // The whole body is inside one try/catch. Cheap to assert, and the reason is
  // real: `localStorage` throws on access, not on read, in a blocked context.
  assert.match(PREPAINT, /^\(function\(\)\{try\{/);
  assert.match(PREPAINT, /\}catch\(e\)\{\}\}\)\(\);$/);
});

/* -------------------------------------------------------------------------- */
/* the stylesheets                                                             */
/* -------------------------------------------------------------------------- */

/** The guard on every rule inside the `prefers-color-scheme: dark` block. */
const OS_GUARD = ':root:not([data-theme="light"])';
/** The selector every pinned-dark rule is written under. */
const PINNED_GUARD = ':root[data-theme="dark"]';

/** @param {string} name */
function stylesheet(name) {
  return readFileSync(fileURLToPath(new URL(`../styles/${name}`, import.meta.url)), "utf8");
}

/**
 * Strip comments, so a token mentioned in prose is never mistaken for one that
 * is declared.
 *
 * @param {string} css
 */
function strip(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * The body of the first `@media (prefers-color-scheme: dark)` block, found by
 * counting braces rather than by a regex, because the block contains blocks.
 *
 * @param {string} css
 * @returns {string}
 */
function darkMediaBody(css) {
  const at = css.indexOf("@media (prefers-color-scheme: dark)");
  assert.notEqual(at, -1, "no prefers-color-scheme: dark block");

  const open = css.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error("unterminated prefers-color-scheme: dark block");
}

/**
 * Flat `selector { decls }` rules into a map of one selector per entry, so a
 * rule with a comma in its selector compares the same as two rules that say the
 * same thing.
 *
 * @param {string} css
 * @returns {Map<string, string>}
 */
function rules(css) {
  /** @type {Map<string, string>} */
  const found = new Map();
  const pattern = /([^{}]+)\{([^{}]*)\}/g;

  for (const match of css.matchAll(pattern)) {
    const declarations = match[2]
      .split(";")
      .map((one) => one.trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .sort()
      .join("; ");

    for (const selector of match[1].split(",")) {
      const trimmed = selector.trim().replace(/\s+/g, " ");
      if (trimmed) found.set(trimmed, declarations);
    }
  }

  return found;
}

/**
 * Drop the theme guard off the front of a selector, so the two ways of saying
 * "dark" produce the same key.
 *
 * `:root:not([data-theme="light"]) .chip` and `:root[data-theme="dark"] .chip`
 * both become `.chip`; the two bare guards both become `:root`.
 *
 * @param {string} selector
 * @param {string} guard
 */
function unguard(selector, guard) {
  assert.ok(
    selector === guard || selector.startsWith(`${guard} `),
    `dark rule is not guarded with \`${guard}\`: ${selector}`,
  );
  return selector === guard ? ":root" : selector.slice(guard.length + 1);
}

/**
 * Every rule that pins the dark theme, keyed the same way as the media block.
 *
 * Read off the whole stylesheet minus the media block, so a `[data-theme]`
 * selector that has been left *inside* the media query by accident is not
 * counted here and shows up as a missing pinned rule.
 *
 * @param {string} css
 */
function pinnedRules(css) {
  const outside = css.replace(darkMediaBody(css), "");
  /** @type {Map<string, string>} */
  const found = new Map();

  for (const [selector, declarations] of rules(outside)) {
    if (!selector.includes('[data-theme="dark"]')) continue;
    found.set(unguard(selector, PINNED_GUARD), declarations);
  }

  return found;
}

/** @param {string} css */
function osRules(css) {
  /** @type {Map<string, string>} */
  const found = new Map();

  for (const [selector, declarations] of rules(darkMediaBody(css))) {
    found.set(unguard(selector, OS_GUARD), declarations);
  }

  return found;
}

for (const name of ["global.css", "chip.css"]) {
  test(`${name}: every dark rule is declared for both the OS and a pinned theme`, () => {
    const css = strip(stylesheet(name));
    const os = osRules(css);
    const pinned = pinnedRules(css);

    assert.ok(os.size > 0, `${name} declares no dark rules at all`);

    assert.deepEqual(
      [...pinned.keys()].sort(),
      [...os.keys()].sort(),
      `${name}: the two dark blocks cover different selectors`,
    );

    for (const [selector, declarations] of os) {
      assert.equal(
        pinned.get(selector),
        declarations,
        `${name}: \`${selector}\` differs between the OS block and the pinned block`,
      );
    }
  });
}

test("global.css: the light theme is the base, and it is never guarded", () => {
  const css = strip(stylesheet("global.css"));

  // `:root { ... }` with nothing in front of it: the light theme has to apply
  // with no attribute, no media query and no scripting, or the whole no-flash
  // story rests on a script having run.
  assert.match(css, /(^|\})\s*:root\s*\{/);

  // And nothing anywhere may key off a pinned *light* theme. Light is the base;
  // a `[data-theme="light"]` rule would mean there are two ways to be light.
  const pinnedLight = [...rules(css).keys()].filter(
    (selector) =>
      selector.includes('[data-theme="light"]') && !selector.includes(":not("),
  );
  assert.deepEqual(pinnedLight, []);
});

test("the site has no theme-conditional CSS outside the audited stylesheets", () => {
  // `palette.css` derives everything from tokens and must keep doing so: a
  // media query here is a colour that a pinned theme cannot reach.
  assert.ok(!strip(stylesheet("palette.css")).includes("prefers-color-scheme"));
});
