/**
 * `overscroll-behavior: contain` is for modals, and only for modals.
 *
 * The VET-32 lesson, from design.md §4. `contain` stops a scroll at the edge of
 * an element instead of handing it to the page, which is exactly right for the
 * palette results and the mobile nav panel — a modal that scrolls the document
 * underneath itself is a modal that has lost the reader's place.
 *
 * On anything in the normal flow of a page it is a trap, and a quiet one. The
 * /sites details page is the case that shipped: its main content *is* a
 * 12,000px scroller, so a reader who hits the bottom of the screenshot and
 * keeps scrolling to reach the notes below it gets nothing at all until they
 * physically move the pointer off the frame. Nothing looks broken. The page
 * just stops responding to the gesture the whole page is built around.
 *
 * That is not a bug a person finds by reading CSS — `contain` is the more
 * "considerate"-looking of the two values, and it is one word. So the allowlist
 * is a test rather than a paragraph, and adding `contain` to a fourth surface
 * has to be a deliberate act of editing this file.
 *
 * Parsed as text, the same move `theme.test.mjs` makes on the stylesheets:
 * there is no runtime here to ask.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("..", import.meta.url));

/**
 * The only two surfaces allowed to contain a scroll, relative to `src/`.
 *
 * Both are modals: the palette's results list and the mobile nav's sheet. A
 * third entry needs the reasoning written into design.md §4 first — it is the
 * document that makes this list mean something.
 */
const MODALS = ["styles/palette.css", "components/MobileNav.astro"];

/**
 * Every shipped file under `src/`, so a new surface cannot land outside the
 * sweep. Tests are skipped — this file talks about the property it is looking
 * for, and a sweep that reads its own failure message finds itself.
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

/** @returns {{ file: string, line: number, value: string }[]} */
function declarations() {
  return walk(SRC).flatMap((full) =>
    readFileSync(full, "utf8")
      .split("\n")
      .flatMap((text, i) => {
        const match = text.match(/overscroll-behavior(?:-[xy])?:\s*([a-z]+)/);
        return match
          ? [
              {
                file: path.relative(SRC, full).split(path.sep).join("/"),
                line: i + 1,
                value: match[1],
              },
            ]
          : [];
      }),
  );
}

test("every `contain` sits on a modal", () => {
  const offenders = declarations()
    .filter((d) => d.value === "contain")
    .filter((d) => !MODALS.includes(d.file));

  assert.deepEqual(
    offenders,
    [],
    "overscroll-behavior: contain outside the modal allowlist. On a page in normal flow this silently swallows the scroll at the element's edge — design.md §4, the VET-32 lesson. Use `auto`, or add the surface to MODALS here and to §4 if it really is a modal.",
  );
});

test("both modals still contain their scroll", () => {
  const containing = declarations()
    .filter((d) => d.value === "contain")
    .map((d) => d.file);

  for (const modal of MODALS) {
    assert.ok(
      containing.includes(modal),
      `${modal} is in the allowlist but no longer contains its scroll. Either it stopped being a modal, in which case it leaves this list, or the declaration was lost.`,
    );
  }
});

test("the sweep is actually finding declarations", () => {
  // A regex that silently stops matching would make both tests above pass by
  // finding nothing, which is the failure mode a text-parsing test has.
  assert.ok(
    declarations().length >= 3,
    "found fewer overscroll-behavior declarations than the three that are known to exist — the parser has probably stopped matching",
  );
});
