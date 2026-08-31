/**
 * The /library detail pages, under test.
 *
 * VET-63 turned one route from a page two entries had into a page all
 * forty-two have, and the four things below are what would go wrong quietly
 * afterwards. They are drift tests in the sense `lib/card.test.mjs` and
 * `lib/video.test.mjs` are: the route is an `.astro` file with no runtime to
 * ask, so what shipped is read as text.
 *
 *   - **The route table falling behind the data.** `getStaticPaths` builds from
 *     `library` now. If it ever narrows again — to `digested`, to a kind, to
 *     anything — the rows it stops covering keep pointing at their page and the
 *     page 404s. Nothing else on the site would notice: the row renders, the
 *     graph validates, and the link is dead.
 *   - **A block rendering where it should not.** A digest is his judgement and a
 *     draft is his pipeline's placeholder, and the whole design of the draft is
 *     that a reader can tell. Two failures matter and they are opposite: a
 *     draft rendering through the component that draws his own sentences, and
 *     the loud label going quiet.
 *   - **The palette pointing at the old anchors.** `/library#slug` was the
 *     fallback for a row with no page. Every row has one, so every palette row
 *     must name it.
 *   - **The page holding less than the card that points at it.** The post card
 *     cuts at 700 code points and says the rest is one press away. This is
 *     where the rest has to be.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { entryHref, library } from "./library.ts";

const SRC = fileURLToPath(new URL("..", import.meta.url));

const ROUTE = "pages/library/[slug].astro";
const DRAFT = "components/DraftBlock.astro";
const POST_BODY = "components/PostBody.astro";
const LIST = "components/LibraryList.astro";
const INDEX = "lib/search-index.ts";

/** @param {string} name @returns {string} */
function read(name) {
  return readFileSync(path.join(SRC, name), "utf8");
}

/**
 * A file with its comments taken out, so a sweep reads what shipped and not
 * what was written about it. Both spellings, as `card.test.mjs` explains.
 *
 * @param {string} source
 * @returns {string}
 */
function code(source) {
  return source.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "");
}

/* ---------------------------------------------------------------------------
   Every entry has a page
   --------------------------------------------------------------------------- */

test("the route table is the whole library, and the seam agrees with it", () => {
  const route = code(read(ROUTE));

  assert.match(
    route,
    /export const getStaticPaths = \(\(\) =>\s*library\.map\(/,
    "the detail route no longer builds from `library`. Narrowing it is what leaves rows pointing at a 404, and nothing else on the site would notice: the row renders, the graph validates, and the link is dead.",
  );
  assert.ok(
    !/import \{[^}]*\bdigested\b[^}]*\} from "\.\.\/\.\.\/lib\/library"/.test(route),
    "the detail route imports `digested` again. That export is the gate on the Review node and on /library.md, and the day it gates this route the section is back to two pages.",
  );

  // The seam and the route have to agree entry by entry, which is the check the
  // regex above cannot make: every href a row renders must be a path this route
  // actually builds.
  const built = new Set(library.map((entry) => `/library/${entry.slug}`));
  for (const entry of library) {
    assert.ok(
      built.has(entryHref(entry)),
      `${entry.slug}: the row points at ${entryHref(entry)} and the route builds no such page`,
    );
  }
  assert.equal(built.size, library.length, "two entries share a slug, so one page is missing");
});

test("the keyboard ring walks every page, not the digested few", () => {
  const route = code(read(ROUTE));
  assert.match(
    route,
    /library\[\(index \+ offset \+ library\.length\) % library\.length\]/,
    "the entry-page ring is not the library. A ring around forty of forty-two pages is a walk that silently skips most of the section.",
  );
});

test("every palette row lands on a real page rather than an anchor into the list", () => {
  const index = code(read(INDEX));

  assert.ok(
    !index.includes("/library#"),
    "`/library#slug` is back in the search index. It was the fallback for a row with no page, and every row has one.",
  );
  assert.match(
    index,
    /href: entryHref\(entry\),/,
    "the search index builds its own /library URL instead of reading the seam",
  );
});

/* ---------------------------------------------------------------------------
   What the page shows, and what it refuses to
   --------------------------------------------------------------------------- */

test("every optional block is gated on the field it draws", () => {
  const route = code(read(ROUTE));

  for (const [field, block] of [
    ["entry.post", "<PostBody"],
    ["entry.video", "<VideoFacade"],
    ["entry.digest", "<DigestBlocks"],
    ["entry.draft", "<DraftBlock"],
  ]) {
    assert.match(
      route,
      new RegExp(`\\{${field.replace(".", "\\.")} && ${block}`),
      `${block} is no longer gated on ${field}. An empty labelled box reads as a page that failed rather than an entry he has not written up (design.md §6).`,
    );
  }
});

test("a drafted opinion never reaches the component that draws his own sentences", () => {
  const route = code(read(ROUTE));

  // `VoiceBlocks` is the /tools and /sites idiom for a sentence he wrote. The
  // top-level `why` is his; `draft.why` is his pipeline's, in the third person,
  // and the two are separate fields precisely so no rendering bug can swap them.
  assert.match(
    route,
    /<VoiceBlocks why=\{entry\.why\} \/>/,
    "the entry page hands VoiceBlocks something other than the entry's own `why`",
  );
  assert.ok(
    !/VoiceBlocks[^>]*draft/.test(route),
    "a drafted why reaches VoiceBlocks, which would print his pipeline's sentence in the register the site reserves for his",
  );
  assert.ok(
    !/DraftBlock[^>]*entry\.why/.test(route),
    "the entry's own `why` reaches DraftBlock, which would label a sentence he wrote as one he did not",
  );
});

test("the draft block says what it is, at full ink, and dates itself", () => {
  const source = read(DRAFT);
  const drawn = code(source);

  assert.match(
    drawn,
    /<h2 class="draft__label mono">Drafted, not read<\/h2>/,
    "the draft's label has gone quiet. It is the one thing stopping a reader taking the box under it as his verdict.",
  );
  assert.match(
    drawn,
    /I haven’t read it yet/,
    "the sentence that says whose words these are has gone",
  );
  assert.match(
    source,
    /\.draft__label \{[^}]*color: var\(--fg\)/,
    "the draft's label dropped to a metadata colour. Every other label on an entry page is `--faint`; this one is louder on purpose.",
  );
  assert.match(
    source,
    /border: 1px solid var\(--hairline-strong\)/,
    "the draft block lost its border, which is what says the words in it are quoted rather than said",
  );
  assert.match(drawn, /Drafted \{draft\.drafted\}/, "the draft stopped printing its own date");
});

/* ---------------------------------------------------------------------------
   The whole post lives here
   --------------------------------------------------------------------------- */

test("the page holds the whole post, at a measure somebody can read", () => {
  const source = read(POST_BODY);

  assert.match(
    code(source),
    /<p class="post__text">\{post\.text\}<\/p>/,
    "the page clips the post. The card already cut it at 700 code points and pointed here for the rest; a second cut leaves the whole thing nowhere.",
  );
  assert.ok(
    !/clipText|POST_CARD_MAX|line-clamp/.test(source),
    "a budget or a clamp reached the detail page. Both are the card's answer to a card's problem.",
  );
  assert.match(
    source,
    /max-width: 65ch/,
    "the post lost its reading measure. Thirty-one thousand characters across a full column is a line nobody tracks.",
  );

  // Named by size rather than by slug, so this keeps meaning something as the
  // library grows: the long posts are the reason this page has to hold them.
  const longest = library
    .flatMap((entry) => (entry.post === null ? [] : [entry.post.text]))
    .reduce((a, b) => ([...a].length > [...b].length ? a : b), "");
  assert.ok(
    [...longest].length > 10_000,
    "the long-form posts have gone; check the detail page still earns its long-form treatment",
  );
});

test("the post's page names its author and draws no face for them", () => {
  /*
   * **VET-114, and the probe is why it landed this way.** Aayush's review of a
   * post's page: "the letter instead of the profile photo looks kinda odd". The
   * two answers were to fetch the real avatar or to drop the stand-in, and the
   * ticket asked for a probe before choosing.
   *
   * Probed live against Firecrawl, twice on saved posts plus a schema-guided
   * extraction: **an x.com post response carries no avatar at all** — author,
   * handle, date, text and `pbs.twimg.com/media/` photos, and nothing else.
   * Only the *profile* page carries `Profile Picture: …/profile_images/…`,
   * which is a second scrape of a different URL for every author, a committed
   * copy of somebody's face with no honest date on it (design.md §6), and a new
   * class of rehosted image for /privacy to name.
   *
   * So the monogram left this page and nothing replaced it. It stays on
   * `TweetCard.astro`, and the asymmetry is the point rather than an oversight:
   * that is a fallback imitating a tweet, where the avatar slot is part of what
   * is being imitated, and this is the uncut post set to be read (design.md §3,
   * "a different rendering rather than a smaller one"). A reading page's head
   * is a name, a handle and a date.
   *
   * Both halves are held, because either one drifting alone is the failure: a
   * monogram coming back here, or the card losing its.
   */
  // Comments stripped on both sides: this file says "monogram" a dozen times
  // explaining why there is not one, and prose has to be free to name the thing
  // it is arguing about.
  const body = code(read(POST_BODY));
  assert.ok(
    !/monogram/.test(body),
    "a monogram is back on the post's page. It is the avatar slot with a letter in it, and this page has no avatar slot — the name, the handle and the date carry who wrote it.",
  );
  assert.ok(
    !/hueSlot/.test(body),
    "the page reads the identity palette again, which is the monogram arriving under another name",
  );
  assert.match(
    body,
    /<span class="post__author">\{post\.author\}<\/span>/,
    "the page stopped naming the author, which is the one thing the monogram was standing beside",
  );
  assert.match(
    body,
    /<span class="post__handle">@\{post\.handle\}<\/span>/,
    "the page stopped printing the handle",
  );

  assert.match(
    code(read("components/TweetCard.astro")),
    /class="monogram"/,
    "the card's fallback lost its monogram too. That one is imitating a tweet and a tweet opens with a face — design.md §1 carries the slot and why it holds a letter.",
  );
});

/* ---------------------------------------------------------------------------
   The row keeps its way out
   --------------------------------------------------------------------------- */

test("a row offers the page and the thing, and the domain link survives both", () => {
  const list = code(read(LIST));

  assert.match(
    list,
    /href=\{`\/library\/domain\/\$\{routeSlug\(entry\.domain\)\}`\}/,
    "the row's hostname stopped pointing at the domain filter page, which is the only entrance to those routes from a list",
  );
  assert.match(
    list,
    /<a class="row__link" href=\{entryHref\(entry\)\}>/,
    "the row's title no longer goes to the entry's page",
  );
  assert.match(
    list,
    /source<span class="visually-hidden">: \{entry\.title\}<\/span>/,
    "the `source` link lost the title only a screen reader hears. Forty links reading `source` and nothing else is a list nobody can navigate by name.",
  );
});
