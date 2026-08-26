/**
 * The tag-to-collection fold, on its own.
 *
 * `run.test.mjs` proves a tagged bookmark comes out of a whole run as a tagged
 * entry; this file is about the rule itself, where the interesting cases are
 * cheap to write and would each cost a full fake run over there.
 *
 * The rule is the site's entire curation model — a tag typed on a phone becomes
 * a page — so the things worth pinning down are the ones a human typing tags
 * will actually do: shout them, repeat themselves in two spellings, and reach
 * for a word the pipeline has already claimed.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  FAILED_TAG,
  POST_NOTE_MAX,
  POST_TITLE_MAX,
  PUBLISHED_TAG,
  buildReadingEntry,
  buildSiteEntry,
  buildToolEntry,
  clip,
  collectionsFrom,
} from "./entries.mjs";

/**
 * @param {object} [extra]
 * @param {string[]} [extra.tags]
 * @param {string} [extra.title]
 * @param {string} [extra.url]
 * @returns {import("./types.js").Bookmark}
 */
function bookmark({ tags = [], title = "Otherkind", url = "https://otherkind.design" } = {}) {
  return { id: "1", url, title, excerpt: "", domain: "otherkind.design", collection: "sites", tags };
}

test("a tag becomes a collection slug", () => {
  assert.deepEqual(collectionsFrom(["portfolios"]), ["portfolios"]);
});

test("a tag a human typed is folded into a route segment", () => {
  assert.deepEqual(collectionsFrom(["Reference Libraries"]), ["reference-libraries"]);
  assert.deepEqual(collectionsFrom(["  Dark  by   Default  "]), ["dark-by-default"]);
  assert.deepEqual(collectionsFrom(["Pastel Colours!"]), ["pastel-colours"]);
  assert.deepEqual(collectionsFrom(["café design"]), ["cafe-design"], "accents are folded, not dropped");
});

test("the tags the pipeline writes never become collections", () => {
  assert.deepEqual(
    collectionsFrom([PUBLISHED_TAG, "portfolios", FAILED_TAG]),
    ["portfolios"],
    "a published bookmark must not grow a `published` collection",
  );
  assert.deepEqual(collectionsFrom([PUBLISHED_TAG, FAILED_TAG]), []);
});

test("a reserved tag is reserved however it was capitalised", () => {
  // The exclusion runs after slugification for exactly this reason: Raindrop
  // tags are free text, and nobody types them carefully on a phone.
  assert.deepEqual(collectionsFrom(["Published", "PUBLISHED", " failed "]), []);
});

test("two spellings of one tag are one collection", () => {
  assert.deepEqual(collectionsFrom(["Personal Sites", "personal sites", "personal-sites"]), [
    "personal-sites",
  ]);
});

test("a tag with nothing URL-safe in it is dropped, not kept as an empty slug", () => {
  assert.deepEqual(collectionsFrom(["!!!", "", "   ", "portfolios"]), ["portfolios"]);
});

test("collections come out sorted, so re-tagging in another order is not a diff", () => {
  assert.deepEqual(collectionsFrom(["portfolios", "dark-by-default", "personal-sites"]), [
    "dark-by-default",
    "personal-sites",
    "portfolios",
  ]);
  assert.deepEqual(
    collectionsFrom(["personal-sites", "portfolios", "dark-by-default"]),
    collectionsFrom(["dark-by-default", "portfolios", "personal-sites"]),
  );
});

test("no tags is no collections", () => {
  assert.deepEqual(collectionsFrom([]), []);
});

test("a site entry carries its collections", () => {
  const entry = buildSiteEntry({
    bookmark: bookmark({ tags: ["Portfolios", "published"] }),
    slug: "otherkind",
    date: "2026-08-26",
    palette: ["#f8f8f7"],
  });

  assert.deepEqual(entry.collections, ["portfolios"]);
});

/* ---------------------------------------------------------------------------
   Posts
   --------------------------------------------------------------------------- */

const POST_URL = "https://x.com/ephraimakanmu/status/2081234457588056305";

/** @param {string} text @returns {import("./types.js").Post} */
const post = (text) => ({ handle: "ephraimakanmu", text });

/**
 * @param {object} [extra]
 * @param {string} [extra.title]
 * @param {string} [extra.excerpt]
 * @returns {import("./types.js").Bookmark}
 */
function saved({ title = "A post from @ephraimakanmu", excerpt = "" } = {}) {
  return { id: "9", url: POST_URL, title, excerpt, domain: "x.com", collection: "reading", tags: [] };
}

test("a clip that fits is returned whole, ellipsis and all left off", () => {
  assert.equal(clip("Short one.", 80), "Short one.");
  assert.equal(clip("  padded  ", 80), "padded");
});

test("a clip ends on a word, not mid-syllable", () => {
  const clipped = clip("the hard part was never the tokens at all", 20);

  assert.ok(clipped.endsWith("…"));
  assert.ok(clipped.length <= 21, `${clipped} is longer than the budget`);
  assert.equal(clipped, "the hard part was…", "and the trailing space goes with it");
});

test("a clip does not leave punctuation stranded before the ellipsis", () => {
  assert.equal(clip("three weeks, and then some more of it", 13), "three weeks…");
});

test("a clip never ends on half a character", () => {
  // Counted in code points, not UTF-16 units. A post is a place emoji live, and
  // an odd-indexed cut inside a surrogate pair renders as a replacement glyph.
  const clipped = clip("🧵".repeat(40), 9);

  assert.equal(clipped, "🧵🧵🧵🧵🧵🧵🧵🧵🧵…");
  assert.equal([...clipped].length, 10, "nine whole emoji and the ellipsis");
});

test("a title that clipped down to punctuation is refused in favour of the bookmark's", () => {
  // `clip` can return a bare "…" — 80 characters of punctuation with no space
  // in them strip to nothing and keep the ellipsis. That is not empty, so an
  // emptiness test would publish a row whose entire link text is one character.
  const entry = buildReadingEntry({
    bookmark: saved(),
    slug: "s",
    date: "2026-08-26",
    post: post(`${".".repeat(80)} and then the actual words`),
  });

  assert.equal(entry.title, "A post from @ephraimakanmu");
});

test("one word longer than the whole budget is cut hard rather than lost", () => {
  // Backing off to the last space would return nothing at all here, which is
  // worse than a hard cut: an empty title is a row with no link text.
  assert.equal(clip("Supercalifragilisticexpialidocious", 10), "Supercalif…");
});

test("a post Raindrop could not read supplies the title it could not", () => {
  const text =
    "Been rebuilding the Diadem brand archive for three weeks and the thing nobody tells you " +
    "about design systems is that the hard part was never the tokens.";

  const entry = buildReadingEntry({
    bookmark: saved(),
    slug: "a-post-from-ephraimakanmu",
    date: "2026-08-26",
    post: post(text),
  });

  assert.notEqual(entry.title, "A post from @ephraimakanmu");
  assert.ok(entry.title.length <= POST_TITLE_MAX + 1);
  assert.ok(text.startsWith(String(entry.title).replace("…", "")));
  assert.equal(entry.kind, "post");
});

test("the note quotes the post and says whose it was", () => {
  const text = "a ".repeat(300);

  const entry = buildReadingEntry({
    bookmark: saved(),
    slug: "s",
    date: "2026-08-26",
    post: post(text),
  });

  assert.match(String(entry.note), /^@ephraimakanmu: /, "the handle leads, so it reads as a quote");
  assert.ok(
    String(entry.note).length <= POST_NOTE_MAX + "@ephraimakanmu: ".length + 1,
    "the note stays inside its budget",
  );
});

test("a post short enough to fit in the title is not said twice", () => {
  const entry = buildReadingEntry({
    bookmark: saved(),
    slug: "s",
    date: "2026-08-26",
    post: post("Ship it on a Friday."),
  });

  assert.equal(entry.title, "Ship it on a Friday.");
  assert.equal(entry.note, "@ephraimakanmu", "the attribution is all the title left unsaid");
});

test("the post outranks the excerpt Raindrop scraped off the same post", () => {
  // Learned from the first real x.com save. Raindrop's excerpt for a post is
  // not Aayush writing about it — it is a ragged copy of the same words, raw
  // newlines and no attribution — so deferring to it meant shipping the worse
  // of two copies. His own line goes in `src/data/reading.json`, which nothing
  // here overwrites.
  const entry = buildReadingEntry({
    bookmark: saved({ excerpt: "So I spent the entire night going\n\nthrough my archives." }),
    slug: "s",
    date: "2026-08-26",
    post: post("Something the poster said instead."),
  });

  assert.equal(entry.note, "@ephraimakanmu");
  assert.equal(entry.title, "Something the poster said instead.");
});

test("with no post read, the excerpt is still exactly what the note was", () => {
  const entry = buildReadingEntry({
    bookmark: saved({ excerpt: "Came in over Telegram." }),
    slug: "s",
    date: "2026-08-26",
    post: null,
  });

  assert.equal(entry.note, "Came in over Telegram.");
});

test("no post is exactly the entry the pipeline built before", () => {
  const bookmark = saved({ excerpt: "" });

  assert.deepEqual(
    buildReadingEntry({ bookmark, slug: "s", date: "2026-08-26", post: null }),
    buildReadingEntry({ bookmark, slug: "s", date: "2026-08-26" }),
    "an absent post and a null one are the same answer",
  );
  assert.deepEqual(buildReadingEntry({ bookmark, slug: "s", date: "2026-08-26" }), {
    slug: "s",
    title: "A post from @ephraimakanmu",
    url: POST_URL,
    domain: "x.com",
    saved_date: "2026-08-26",
    kind: "post",
    note: null,
  });
});

test("tools and reading entries carry no collections", () => {
  // The scoping call, asserted rather than only commented: /tools has
  // `category` and /reading has `kind`, and a second taxonomy in those files
  // would be a field no parser reads and no page renders.
  const tagged = bookmark({ tags: ["Portfolios"] });

  const tool = buildToolEntry({ bookmark: tagged, slug: "otherkind", date: "2026-08-26" });
  const reading = buildReadingEntry({ bookmark: tagged, slug: "otherkind", date: "2026-08-26" });

  assert.equal("collections" in tool, false);
  assert.equal("collections" in reading, false);
});
