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

const PAGE = "pages/library/[slug].astro";
/** The entry detail, lifted out of `PAGE` in VET-258. */
const ROUTE = "components/EntryDetail.astro";
const DRAFT = "components/DraftBlock.astro";
const POST_CARD = "components/PostCard.astro";
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
  const route = code(read(PAGE));

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
  const route = code(read(PAGE));
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
    /\.draft__label \{[^}]*color: var\(--text-primary\)/,
    "the draft's label dropped to a metadata colour. Every other label on an entry page is `--text-tertiary`; this one is louder on purpose.",
  );
  assert.match(
    source,
    /border: 1px solid var\(--hairline-strong\)/,
    "the draft block lost its border, which is what says the words in it are quoted rather than said",
  );
  assert.match(
    drawn,
    /Drafted <time datetime=\{draft\.drafted\}>\{formatDay\(draft\.drafted\)\}<\/time>/,
    "the draft stopped printing its own date, or stopped printing it as a `<time>` (design.md §2)",
  );
});

/* ---------------------------------------------------------------------------
   The whole post lives here
   --------------------------------------------------------------------------- */

test("the page holds the whole post, drawn from the repo, at a reading measure", () => {
  const route = code(read(ROUTE));
  const card = code(read(POST_CARD));

  assert.match(
    route,
    /\{\s*entry\.post && \(\s*<div class="thing">\s*<PostCard post=\{entry\.post\} url=\{entry\.url\} mode="page" keyline=\{entry\.keyline\} \/>/,
    "the post's page no longer draws the post in page mode, gated on the entry having one",
  );
  assert.match(route, /\.thing \{[^}]*max-width: 40rem;/, "the post lost its reading measure");
  assert.match(
    card,
    /const text = grid \? clipText\(post\.text, POST_CARD_MAX\) : post\.text;/,
    "page mode clips the post. The grid card cut it and pointed here for the rest.",
  );
  assert.match(
    route,
    /\{entry\.note && !entry\.post && <p class="standfirst note">/,
    "a readable post shows its note as the standfirst again. For a post the note is a copy of its words.",
  );

  const longest = library
    .flatMap((entry) => (entry.post === null ? [] : [entry.post.text]))
    .reduce((a, b) => ([...a].length > [...b].length ? a : b), "");
  assert.ok([...longest].length > 10_000, "the long-form posts have gone");
});

test("the post card shows a face when there is one, and a letter when there is not", () => {
  const card = code(read(POST_CARD));
  assert.match(card, /<img class="pc__avatar" src=\{post\.avatar\}/, "the avatar is gone");
  assert.match(card, /class="pc__avatar monogram"/, "the monogram fallback is gone");
  assert.match(card, /\{post\.author\}/);
  assert.match(card, /@\{post\.handle\}/);
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
    /Source<span class="visually-hidden">: \{entry\.title\}<\/span>/,
    "the `source` link lost the title only a screen reader hears. Forty links reading `source` and nothing else is a list nobody can navigate by name.",
  );
});

test("an article reads TLDR, highlights, excerpt, note, digest, then the way out (VET-246)", () => {
  const detail = read(ROUTE);
  const order = [
    '<p class="lead">{entry.tldr}',
    "<ReaderBlocks highlights={entry.highlights}",
    '<p class="standfirst note">',
    "<DigestBlocks",
    'entry.kind === "article"',
  ].map((marker) => detail.indexOf(marker));

  assert.ok(order.every((at) => at > -1), `a block is missing: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, "the reader blocks are out of order");

  const reader = read("components/ReaderBlocks.astro");
  assert.match(reader, /prefers-reduced-motion: reduce/, "the sweep must not run under reduced motion");
  const marks = read("styles/prose.css");
  assert.match(marks, /@media screen and \(prefers-reduced-motion: no-preference\)/, "print and reduced motion keep the mark whole");
  assert.match(marks, /\.hl:not\(\.hl--on, \[data-static\]\)/, "a grid's static mark must never be armed");
});
