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
  DraftError,
  FAILED_TAG,
  POST_NOTE_MAX,
  POST_TITLE_MAX,
  PUBLISHED_TAG,
  buildReadingEntry,
  buildSiteEntry,
  buildToolEntry,
  clip,
  collectionsFrom,
  draftFrom,
  repoFrom,
  shotFilesOf,
  urlKey,
} from "./entries.mjs";

/**
 * @param {object} [extra]
 * @param {string[]} [extra.tags]
 * @param {string} [extra.title]
 * @param {string} [extra.url]
 * @returns {import("./types.js").Bookmark}
 */
function bookmark({ tags = [], title = "Otherkind", url = "https://otherkind.design" } = {}) {
  return {
    id: "1",
    url,
    title,
    excerpt: "",
    note: "",
    domain: "otherkind.design",
    collection: "sites",
    tags,
  };
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
const post = (text) => ({
  author: "Diadem",
  handle: "ephraimakanmu",
  date: "2026-07-26",
  text,
  media: [],
});

/**
 * @param {object} [extra]
 * @param {string} [extra.title]
 * @param {string} [extra.excerpt]
 * @param {string} [extra.note]  The bookmark's PRIVATE note — a draft blob lives here.
 * @param {string[]} [extra.tags]
 * @param {string} [extra.url]
 * @returns {import("./types.js").Bookmark}
 */
function saved({
  title = "A post from @ephraimakanmu",
  excerpt = "",
  note = "",
  tags = [],
  url = POST_URL,
} = {}) {
  return {
    id: "9",
    url,
    title,
    excerpt,
    note,
    domain: new URL(url).hostname,
    collection: "reading",
    tags,
  };
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
  // of two copies. His own line goes in `src/data/library.json`, which nothing
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

/* ---------------------------------------------------------------------------
   A saved link is a product site or a repository, never both at once
   --------------------------------------------------------------------------- */

test("a tool saved from GitHub is filed as a repo, with no url", () => {
  const entry = buildToolEntry({
    bookmark: bookmark({ title: "Buzz", url: "https://github.com/block/buzz" }),
    slug: "buzz",
    date: "2026-08-26",
  });

  assert.equal(entry.url, null, "a repository is not the product's own site");
  assert.equal(entry.repo, "https://github.com/block/buzz");
});

test("a tool saved from anywhere else keeps its url and gets no repo", () => {
  const entry = buildToolEntry({
    bookmark: bookmark({ title: "Eve", url: "https://eve.dev" }),
    slug: "eve",
    date: "2026-08-26",
  });

  assert.equal(entry.url, "https://eve.dev");
  assert.equal("repo" in entry, false, "absent, not null, like every other optional field");
});

test("the pipeline never invents a product site it was not given", () => {
  /*
   * The failure this guards against is the tidy-looking one: filling `url` in
   * with the repository so the field is not empty. That is exactly what put a
   * column of identical GitHub logos on /tools and hid the real site of every
   * tool that had one. A null here is a question for a human, not a gap.
   */
  const entry = buildToolEntry({
    bookmark: bookmark({ title: "Papercuts", url: "https://github.com/treygoff24/papercuts" }),
    slug: "papercuts",
    date: "2026-08-26",
  });

  assert.equal(entry.url, null);
  assert.notEqual(entry.repo, entry.url);
});

test("a deep link is folded back to the repository it is inside", () => {
  // Somebody saving a project from its README on a phone saves the README.
  assert.equal(
    repoFrom("https://github.com/block/buzz/blob/main/README.md"),
    "https://github.com/block/buzz",
  );
  assert.equal(repoFrom("https://github.com/block/buzz/issues/7"), "https://github.com/block/buzz");
  assert.equal(repoFrom("https://github.com/block/buzz.git"), "https://github.com/block/buzz");
  assert.equal(repoFrom("https://www.github.com/block/buzz/"), "https://github.com/block/buzz");
});

test("a profile is not a repository, so it stays a url", () => {
  assert.equal(repoFrom("https://github.com/block"), null);
  assert.equal(repoFrom("https://gist.github.com/block/abc123"), null);
  assert.equal(repoFrom("https://eve.dev"), null);
  assert.equal(repoFrom("not a url"), null, "survives anything a person typed");

  const entry = buildToolEntry({
    bookmark: bookmark({ title: "block", url: "https://github.com/block" }),
    slug: "block",
    date: "2026-08-26",
  });
  assert.equal(entry.url, "https://github.com/block");
});

/* ---------------------------------------------------------------------------
   The dedupe key
   --------------------------------------------------------------------------- */

test("a query parameter that is the link's identity is part of the key", () => {
  // The reason `urlKey` denylists instead of stripping. A YouTube URL says which
  // video it is in `?v=` and nowhere else, so a wholesale strip would give every
  // video the site has ever saved the same key and dedupe them into the first.
  assert.notEqual(
    urlKey("https://youtube.com/watch?v=abc123"),
    urlKey("https://youtube.com/watch?v=xyz789"),
  );
});

test("campaign junk on a video does not make it a second video", () => {
  assert.equal(
    urlKey("https://youtube.com/watch?v=abc123"),
    urlKey("https://www.youtube.com/watch?v=abc123&si=Kf9dQ2wR&utm_source=newsletter"),
  );
});

test("a link saved twice, once from a campaign, is one entry", () => {
  // The failure this exists for: the same page saved off a phone and out of a
  // mailing list, arriving as two bookmarks and publishing as two rows.
  assert.equal(
    urlKey("https://otherkind.design/writing"),
    urlKey("https://otherkind.design/writing?utm_source=twitter&utm_medium=social&utm_campaign=aug"),
  );
});

test("every parameter on the denylist goes, however it was capitalised", () => {
  const bare = urlKey("https://otherkind.design/writing");

  for (const junk of [
    "utm_source=nl",
    "utm_medium=email",
    "utm_campaign=august",
    "utm_term=design",
    "utm_content=hero",
    "UTM_Source=nl",
    "fbclid=IwAR0abc",
    "gclid=Cj0KCQ",
    "ref=producthunt",
    "ref_src=twsrc%5Etfw",
    "si=Kf9dQ2wR",
    "igshid=MzRlODBi",
  ]) {
    assert.equal(urlKey(`https://otherkind.design/writing?${junk}`), bare, `${junk} survived`);
  }
});

test("a tracked parameter goes and the one beside it stays", () => {
  assert.equal(
    urlKey("https://otherkind.design/search?q=archive&utm_source=newsletter"),
    urlKey("https://otherkind.design/search?q=archive"),
  );
  assert.equal(
    urlKey("https://otherkind.design/search?q=archive&fbclid=IwAR0"),
    "otherkind.design/search?q=archive",
  );
});

test("a tool entry still carries no taxonomy but its category", () => {
  // The scoping call, asserted rather than only commented. /tools has
  // `category`, single-valued, and every page and route over there is built
  // around exactly one answer per tool; a second, many-to-many one would be two
  // things to maintain and two ways to disagree about where a tool belongs.
  const tool = buildToolEntry({
    bookmark: bookmark({ tags: ["Portfolios"] }),
    slug: "otherkind",
    date: "2026-08-26",
  });

  assert.equal("collections" in tool, false);
  assert.equal("tags" in tool, false);
});

/* ---------------------------------------------------------------------------
   What a reading entry carries beyond the bookmark
   --------------------------------------------------------------------------- */

test("a reading entry carries its tags, under its own field name", () => {
  // A deliberate reversal of "only /sites gets a tag taxonomy". `kind` sorts a
  // saved link into article, post or video, which says what it is and nothing
  // about what it is about — so the tags typed on the phone get their own field
  // and their own routes, folded by the same rule /sites folds its collections.
  const entry = buildReadingEntry({
    bookmark: saved({ tags: ["Go To Market", "published", "go-to-market", "agents"] }),
    slug: "s",
    date: "2026-08-26",
  });

  assert.deepEqual(entry.tags, ["agents", "go-to-market"], "folded, deduped, sorted, reserved out");
  assert.equal("collections" in entry, false, "that name belongs to /sites");
});

test("no tags is no key at all", () => {
  // `library.ts` refuses a present-but-empty array, so writing `"tags": []`
  // would be a line of noise the parser turns down anyway.
  const entry = buildReadingEntry({ bookmark: saved(), slug: "s", date: "2026-08-26" });

  assert.equal("tags" in entry, false);
});

test("the post object is the whole card, minus the media there is none of", () => {
  const entry = buildReadingEntry({
    bookmark: saved(),
    slug: "s",
    date: "2026-08-26",
    post: post("Ship it on a Friday."),
  });

  assert.deepEqual(entry.post, {
    author: "Diadem",
    handle: "ephraimakanmu",
    date: "2026-07-26",
    text: "Ship it on a Friday.",
  });
  assert.equal(
    "media" in Object(entry.post),
    false,
    "an empty media array is the key not being there",
  );
});

test("a post that did carry media keeps it", () => {
  const entry = buildReadingEntry({
    bookmark: saved(),
    slug: "s",
    date: "2026-08-26",
    post: { ...post("With a picture."), media: ["/shots/s-media-1.webp"] },
  });

  assert.deepEqual(Object(entry.post).media, ["/shots/s-media-1.webp"]);
});

test("a video entry names its provider, its id and the thumb path", () => {
  const entry = buildReadingEntry({
    bookmark: saved({ url: "https://www.youtube.com/watch?v=vJEy3nP2_C8" }),
    slug: "managing-agents",
    date: "2026-08-26",
    video: { provider: "youtube", id: "vJEy3nP2_C8" },
  });

  assert.deepEqual(entry.video, {
    provider: "youtube",
    id: "vJEy3nP2_C8",
    thumb: "/shots/managing-agents-thumb.webp",
  });
  assert.equal(entry.kind, "video");
});

test("no video is no key, so an article never grows an empty one", () => {
  const entry = buildReadingEntry({ bookmark: saved(), slug: "s", date: "2026-08-26" });

  assert.equal("video" in entry, false);
  assert.equal("post" in entry, false);
  assert.equal("draft" in entry, false);
  assert.equal("why" in entry, false);
});

/* ---------------------------------------------------------------------------
   The draft, out of the private note
   --------------------------------------------------------------------------- */

const RUN_DATE = "2026-08-31";

test("a private note that is a person's sentence is not a draft", () => {
  // The quiet case. The note field is his, and typing in it must not be an
  // error — it just is not a blob, so there is nothing to read out of it.
  assert.deepEqual(draftFrom("Read this before the Orbis call.", RUN_DATE), {
    draft: null,
    why: null,
  });
  assert.deepEqual(draftFrom("", RUN_DATE), { draft: null, why: null });
});

test("a draft blob becomes bullets, a why and a date", () => {
  const blob = JSON.stringify({
    bullets: ["The loop in one line.", "The jobs are real."],
    why: "Saved because it covers the harness ladder.",
    drafted: "2026-08-30",
  });

  assert.deepEqual(draftFrom(blob, RUN_DATE), {
    draft: {
      bullets: ["The loop in one line.", "The jobs are real."],
      why: "Saved because it covers the harness ladder.",
      drafted: "2026-08-30",
    },
    why: null,
  });
});

test("a blob with no date of its own is dated the day it reached the site", () => {
  const blob = JSON.stringify({ why: "Saved because it covers the harness ladder." });

  assert.equal(Object(draftFrom(blob, RUN_DATE).draft).drafted, RUN_DATE);
});

test("his why is moved out of the draft, not flagged inside it", () => {
  // The whole register rule in one assertion. Once `whyAuthor` says aayush, the
  // sentence stops being a draft and becomes the entry's own `why`, where the
  // field name — not a flag a renderer could drop — is what says whose voice it
  // is. Bullets are Hermes' either way, so they stay behind.
  const blob = JSON.stringify({
    bullets: ["The loop in one line."],
    why: "This is the setup my own agents already half-run.",
    whyAuthor: "aayush",
    drafted: "2026-08-30",
  });

  assert.deepEqual(draftFrom(blob, RUN_DATE), {
    draft: { bullets: ["The loop in one line."], why: null, drafted: "2026-08-30" },
    why: "This is the setup my own agents already half-run.",
  });
});

test("promoting the only sentence in a draft leaves no draft behind", () => {
  const blob = JSON.stringify({ why: "Worth the hour.", whyAuthor: "aayush" });

  assert.deepEqual(draftFrom(blob, RUN_DATE), { draft: null, why: "Worth the hour." });
});

test("a blob that opens with a brace and is broken stops the item, loudly", () => {
  // The loud half of the rule, and the reason it is loud. Only a machine writes
  // `{` into that field, so a broken one is a sweep bug — and the two ways to
  // survive it are both worse than stopping. Publishing without the draft loses
  // an opinion nobody will notice is missing; publishing a half-parsed one puts
  // machine noise on the page under a label saying his agent wrote it.
  assert.throws(() => draftFrom("{not json", RUN_DATE), DraftError);
  assert.throws(() => draftFrom("{}", RUN_DATE), /neither "bullets" nor a "why"/);
  assert.throws(() => draftFrom('{"bullets":[]}', RUN_DATE), /non-empty array/);
  assert.throws(() => draftFrom('{"bullets":["a\\nb"]}', RUN_DATE), /one non-empty line/);
  assert.throws(() => draftFrom('{"why":"   "}', RUN_DATE), /not a sentence/);
  assert.throws(() => draftFrom('{"why":"a","whyAuthor":"claude"}', RUN_DATE), /whyAuthor/);
  assert.throws(() => draftFrom('{"why":"a","drafted":"2026-02-31"}', RUN_DATE), /YYYY-MM-DD/);
});

/* ---------------------------------------------------------------------------
   The orphan sweep's view of an entry
   --------------------------------------------------------------------------- */

test("every picture an entry points at is one the sweep can see", () => {
  // `state.mjs` deletes anything in `public/shots` that no entry claims, so a
  // field holding a picture and not read here is a picture the very next run
  // throws away — leaving an entry pointing at nothing.
  assert.deepEqual(shotFilesOf({ shot: "/shots/otherkind.webp" }), ["otherkind.webp"]);
  assert.deepEqual(shotFilesOf({ video: { thumb: "/shots/a-thumb.webp" } }), ["a-thumb.webp"]);
  assert.deepEqual(shotFilesOf({ post: { media: ["/shots/a-1.webp", "/shots/a-2.webp"] } }), [
    "a-1.webp",
    "a-2.webp",
  ]);
  assert.deepEqual(shotFilesOf({ slug: "s" }), [], "an entry with no pictures claims none");
  assert.deepEqual(shotFilesOf({ shot: "", video: { thumb: 4 }, post: { media: [null] } }), []);
});
