/**
 * The section list, and the one copy of it that lives outside the build.
 *
 * `lib/sections.ts › SECTION_HREFS` and `CATALOGUE` are the manifest: the menu
 * panel and the home index both read it, so those two cannot disagree with
 * each other by construction. The social card can. `scripts/og.mjs` runs under
 * plain node to lay its text out in a real browser, and `sections.ts` imports
 * `astro:content`, which only resolves inside a build — so the card keeps a
 * hand-written copy of the list and there is no import that would keep it
 * honest.
 *
 * It went stale exactly the way a copy does. Reading was renamed to Library and
 * every surface that reads the manifest moved with it; the card, which reads
 * nothing, kept saying `tools · sites · notes · experiments`. Four sections
 * instead of five, on every link anyone shared, for as long as the rename has
 * been live. Nothing surfaced it because a social card is the one asset that is
 * never looked at from the site it belongs to — `design.md` §3's lesson about
 * `favicon.svg`, a second time, on a second file.
 *
 * So the two lists are compared here as text. Parsing rather than importing is
 * the same move `theme.test.mjs` makes on the stylesheets and `mark.test.mjs`
 * makes on the mark: when a value cannot be shared at runtime, the test is what
 * shares it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** @param {string} relative */
const read = (relative) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const SECTIONS_TS = read("./sections.ts");
const OG = read("../../scripts/og.mjs");

/**
 * `SECTION_HREFS`, in source order, with the leading slash dropped. That array
 * is the manifest's order: `getSections` maps it and `CATALOGUE` is keyed off it.
 */
function catalogueSections() {
  const block = SECTIONS_TS.match(/const SECTION_HREFS = \[([\s\S]*?)\]/);
  assert.ok(
    block,
    "could not find the SECTION_HREFS array in sections.ts — if it was renamed or reshaped, this test has to learn the new shape",
  );

  return [...block[1].matchAll(/"\/([a-z-]+)"/g)].map((m) => m[1]);
}

/** The card's hand-kept copy, `scripts/og.mjs › SECTIONS`. */
function cardSections() {
  const block = OG.match(/const SECTIONS = \[([^\]]*)\]/);
  assert.ok(
    block,
    "could not find SECTIONS in scripts/og.mjs — the card's section list has to stay a named array so this test can read it",
  );

  return [...block[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
}

test("the manifest still parses to the five sections the site has", () => {
  assert.deepEqual(catalogueSections(), [
    "tools",
    "sites",
    "library",
    "notes",
    "experiments",
  ]);
});

test("the social card names every section, in the manifest's order", () => {
  assert.deepEqual(
    cardSections(),
    catalogueSections(),
    "scripts/og.mjs and lib/sections.ts disagree about the sections. Fix og.mjs, then `npm run og` and commit public/og.png — the card is generated, so editing the source alone changes nothing anyone sees.",
  );
});

test("the card renders that list rather than a second hand-typed one", () => {
  // The bug this file exists for was a literal string in the markup. Reading
  // the array and then typing the words out again below it would restore it.
  assert.match(
    OG,
    /class="sections">\$\{SECTIONS\.join\(/,
    "the .sections paragraph must interpolate SECTIONS, not spell the sections out",
  );
});

test("the retired /computer section 308s into /notes", () => {
  /** @type {{ routes: { src: string, status?: number, headers?: Record<string, string> }[] }} */
  const { routes } = JSON.parse(read("../../vercel.json"));
  const to = (/** @type {string} */ path) => {
    for (const route of routes) {
      const hit = new RegExp(route.src).exec(path);
      if (hit && route.status === 308) return route.headers?.Location?.replace("$1", hit[1] ?? "");
    }
    return undefined;
  };
  assert.equal(to("/computer"), "/notes");
  assert.equal(to("/computer/"), "/notes");
  assert.equal(to("/computer.md"), "/notes.md");
  assert.equal(to("/computer/save-a-link"), "/notes/save-a-link");
});

test("a slashed URL 308s to the one spelling every link and canonical uses (VET-281)", () => {
  /** @type {{ routes: { src: string, status?: number, headers?: Record<string, string>, handle?: string }[] }} */
  const { routes } = JSON.parse(read("../../vercel.json"));
  const before = routes.slice(0, routes.findIndex((route) => route.handle === "filesystem"));
  const to = (/** @type {string} */ path) => {
    for (const route of before) {
      const hit = route.src && new RegExp(route.src).exec(path);
      if (hit && route.status === 308) return route.headers?.Location?.replace("$1", hit[1] ?? "");
    }
    return undefined;
  };
  assert.equal(to("/tools/agent-browser/"), "/tools/agent-browser");
  assert.equal(to("/library/"), "/library");
  assert.equal(to("/tools/agent-browser"), undefined, "the unslashed page is served, not redirected");
  assert.equal(to("/"), undefined, "home keeps its slash");
});
