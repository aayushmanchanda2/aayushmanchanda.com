/**
 * The command palette's ranking, under test.
 *
 * The palette is the one surface on this site whose correctness is a *feeling*
 * — typing four letters and having the right row be the highlighted one — and
 * that is exactly the kind of thing nobody notices going wrong. A build that
 * succeeds and a page that renders prove nothing about whether "rare" puts Rare
 * UI first or fourth.
 *
 * So `lib/search.ts` was written with no imports, which is what lets this file
 * exercise it under `node --experimental-strip-types` the way `parse.test.mjs`
 * exercises the data readers. The half that cannot be tested this way — focus,
 * key handling, the DOM — is quarantined in `lib/palette.ts`, and the split is
 * the reason this file can exist at all.
 *
 * The scoring constants are deliberately not asserted on. What is pinned is the
 * *order* two entries come back in, because that is the promise the palette
 * makes to a reader; the weights behind it are free to be retuned.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { RESULT_LIMIT, excerptFor, scoreEntry, search, tokenize } from "./search.ts";

/** @typedef {import("./search.ts").SearchEntry} SearchEntry */

/**
 * A terse entry factory, so a test reads as the case it is about.
 *
 * @param {string} title
 * @param {string} [section]
 * @param {string} [terms]
 * @param {string} [href]
 * @returns {SearchEntry}
 */
function entry(title, section = "Tools", terms = "", href = "/x") {
  return { title, section, href, terms };
}

/**
 * The titles a query returns, in rank order.
 *
 * @param {readonly SearchEntry[]} entries
 * @param {string} query
 * @param {number} [limit]
 * @returns {string[]}
 */
function titles(entries, query, limit) {
  return search(entries, query, limit).map((hit) => hit.entry.title);
}

/* ---------------------------------------------------------------------------
   tokenize — what counts as a query
   --------------------------------------------------------------------------- */

test("a query is lowercased and split on whitespace", () => {
  assert.deepEqual(tokenize("  Rare   UI "), ["rare", "ui"]);
});

test("an empty or blank query has no tokens", () => {
  assert.deepEqual(tokenize(""), []);
  assert.deepEqual(tokenize("   "), []);
});

/* ---------------------------------------------------------------------------
   The empty query — the palette's opening state
   --------------------------------------------------------------------------- */

test("an empty query lists everything, in the order the index gave", () => {
  const entries = [entry("Home", "Pages"), entry("Tools", "Pages"), entry("Astro")];
  assert.deepEqual(titles(entries, ""), ["Home", "Tools", "Astro"]);
});

test("the empty query is still capped", () => {
  const entries = Array.from({ length: 40 }, (_, i) => entry(`Tool ${i}`));
  assert.equal(search(entries, "").length, RESULT_LIMIT);
});

/* ---------------------------------------------------------------------------
   Matching — every word has to land
   --------------------------------------------------------------------------- */

test("a token that matches nothing drops the entry", () => {
  assert.deepEqual(titles([entry("Astro")], "svelte"), []);
});

test("more words narrow the results rather than widening them", () => {
  const entries = [entry("Rare UI", "Sites"), entry("Rare Earth", "Sites")];

  assert.deepEqual(titles(entries, "rare"), ["Rare UI", "Rare Earth"]);
  // Both tokens have to land, so the second word is a filter, not an alternative.
  assert.deepEqual(titles(entries, "rare ui"), ["Rare UI"]);
});

test("matching is case- and whitespace-insensitive on both sides", () => {
  assert.deepEqual(titles([entry("Rare UI", "Sites")], "  RARE  "), ["Rare UI"]);
});

test("a token can land on the terms rather than the title", () => {
  const entries = [entry("Otherkind", "Sites", "otherkind.co gallery")];
  assert.deepEqual(titles(entries, "gallery"), ["Otherkind"]);
});

test("a token can land on the section name", () => {
  assert.deepEqual(titles([entry("Astro", "Tools")], "tools"), ["Astro"]);
});

/* ---------------------------------------------------------------------------
   Ranking — where in the field the token landed
   --------------------------------------------------------------------------- */

test("a title beats the terms it is filed under", () => {
  const entries = [
    entry("Something Else", "Tools", "gallery"),
    entry("Gallery", "Tools", ""),
  ];
  assert.deepEqual(titles(entries, "gallery"), ["Gallery", "Something Else"]);
});

test("the start of a title beats the start of a word inside it", () => {
  const entries = [entry("Design Engineer"), entry("Engineer Tools")];
  assert.deepEqual(titles(entries, "engineer"), [
    "Engineer Tools",
    "Design Engineer",
  ]);
});

test("the start of a word beats a match buried mid-word", () => {
  // "art" starts a word in one and sits inside "Smart" in the other.
  const entries = [entry("Smart Bookmarks"), entry("The Art One")];
  assert.deepEqual(titles(entries, "art"), ["The Art One", "Smart Bookmarks"]);
});

test("a dot starts a word, so a domain suffix is not a mid-word match", () => {
  // Both contain "tools". In the first it follows a dot, which is a boundary;
  // in the second it is buried inside a single word.
  const dotted = scoreEntry(entry("designengineer.tools", "Sites"), ["tools"]);
  const buried = scoreEntry(entry("protools", "Sites"), ["tools"]);

  assert.ok(buried > 0, "the buried match should still count as a match");
  assert.ok(dotted > buried, `${dotted} should beat ${buried}`);
});

test("a hyphen starts a word too", () => {
  const spaced = scoreEntry(entry("design engineer", "Sites"), ["engineer"]);
  const hyphened = scoreEntry(entry("design-engineer", "Sites"), ["engineer"]);

  assert.equal(hyphened, spaced);
});

test("repeating a word across title and terms does not double an entry's score", () => {
  const once = scoreEntry(entry("Astro", "Tools", "framework"), ["astro"]);
  const twice = scoreEntry(entry("Astro", "Tools", "astro framework"), ["astro"]);
  assert.equal(once, twice);
});

test("on a tie, the shorter title wins", () => {
  // Both are a start match, so only length separates them — and the bare
  // section page is what someone typing a section name is after.
  const entries = [entry("Tools I Have Tried", "Tools"), entry("Tools", "Pages")];
  assert.deepEqual(titles(entries, "tools"), ["Tools", "Tools I Have Tried"]);
});

/* ---------------------------------------------------------------------------
   One list across sections, and the prose behind a title (VET-247)
   --------------------------------------------------------------------------- */

test("results are one list in rank order, whatever their section", () => {
  const entries = [
    entry("Astro Docs", "Library"),
    entry("Islands of Astro", "Tools"),
    entry("Astro", "Tools"),
  ];
  assert.deepEqual(titles(entries, "astro"), ["Astro", "Astro Docs", "Islands of Astro"]);
});

test("the cap applies to results overall", () => {
  const entries = Array.from({ length: 20 }, (_, i) => entry(`Astro ${i}`));
  assert.equal(search(entries, "astro", 5).length, 5);
});

test("a word only inside a body still finds the entry", () => {
  const post = { ...entry("Welcome", "Library"), body: "a long post about neuroplasticity and habits" };
  assert.deepEqual(titles([entry("Other"), post], "neuroplasticity"), ["Welcome"]);
});

test("title beats lead beats body", () => {
  const entries = [
    { ...entry("Zeta", "Library"), body: "all about gardens" },
    { ...entry("Beta", "Library"), lead: "gardens in a sentence" },
    entry("Gardens"),
  ];
  assert.deepEqual(titles(entries, "gardens"), ["Gardens", "Beta", "Zeta"]);
});

test("an excerpt centres on the word the title lacks and marks every query word", () => {
  const body = `${"filler ".repeat(30)}the habit loop shapes the habit ${"tail ".repeat(30)}`.trim();
  const parts = excerptFor({ ...entry("Loop notes"), body }, ["loop", "habit"]);
  assert.ok(parts);
  assert.equal(parts[0].text, "… ");
  assert.equal(parts[parts.length - 1].text, " …");
  assert.deepEqual(
    parts.filter((part) => part.mark).map((part) => part.text),
    ["habit", "loop", "habit"],
  );
  assert.ok(parts.map((part) => part.text).join("").length < 160);
});

test("no excerpt when the title already holds every word", () => {
  assert.equal(excerptFor({ ...entry("Habit Loop"), body: "habit" }, ["habit"]), null);
});

test("an excerpt keeps angle brackets as text, for the DOM to print", () => {
  const parts = excerptFor({ ...entry("X"), body: "<script>alert(1)</script> find me" }, ["find"]);
  assert.ok(parts);
  assert.equal(parts.map((part) => part.text).join(""), "<script>alert(1)</script> find me");
});
