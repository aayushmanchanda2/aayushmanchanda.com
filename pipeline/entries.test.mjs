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
  PUBLISHED_TAG,
  buildReadingEntry,
  buildSiteEntry,
  buildToolEntry,
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
