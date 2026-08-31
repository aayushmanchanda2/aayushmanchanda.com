/**
 * The post card and the wall it sits in, under test.
 *
 * Three of these are drift tests, in the sense `lib/wide.test.mjs` and
 * `lib/overscroll.test.mjs` are: they parse shipped files as text, because
 * there is no runtime to ask what an `.astro` component drew. What they hold is
 * the three things about this slice that would go wrong quietly.
 *
 *   - **A field the card stops rendering.** `Post` has five fields and all five
 *     are required once the object exists, which is the parser's way of saying
 *     a card with no author or no date is a card with a hole in it. A card that
 *     drew four of them would still build, still validate, and still look
 *     fine to whoever wrote it.
 *   - **The wall spreading.** `columns` on a list is a list you cannot read in
 *     order. It belongs to one route, `/library/kind/post`, where every entry
 *     is the same shape, and nowhere else.
 *   - **The two copies.** `lib/post.ts › clipText` is a copy of
 *     `pipeline/entries.mjs › clip`, and `lib/library.ts › entryHref` is the
 *     markup's half of `lib/schema.ts › libraryRowUrl`. Both pairs are
 *     deliberate and both are only safe while something checks them.
 *   - **The one door off the site.** Every /library title points at a page here
 *     since VET-63, so the row's `source` link is the only outbound anchor left
 *     in the list, and the sweep at the foot is what keeps it at exactly one.
 *
 * The clamp itself is tested as a property rather than as a count. "Eleven of
 * twenty-four posts are cut today" is true and would be a test that fails the
 * next time Aayush saves a long post, which is a build broken by the pipeline
 * doing its job.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { clip } from "../../pipeline/entries.mjs";
import { entryHref, library } from "./library.ts";
import { libraryRowUrl } from "./schema.ts";
import { POST_CARD_MAX, clipText, isClipped, monogram } from "./post.ts";

const SRC = fileURLToPath(new URL("..", import.meta.url));

/** @param {string} name @returns {string} */
function read(name) {
  return readFileSync(path.join(SRC, name), "utf8");
}

/**
 * A file with its comments taken out, so a sweep reads what shipped and not
 * what was written about it. Both spellings: `.astro` frontmatter and its
 * scoped CSS use `/* *​/`, and the template uses `{/* *​/}`.
 *
 * @param {string} source
 * @returns {string}
 */
function code(source) {
  return source.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "");
}

/**
 * Every shipped file under `src/`, tests skipped. Same walk `wide.test.mjs`
 * uses, and the return annotation is load-bearing for the same reason: `checkJs`
 * is on and a recursive function inferring its own return type is ts7023.
 *
 * @param {string} dir
 * @returns {string[]} paths relative to `src/`, forward-slashed
 */
function walk(dir) {
  return readdirSync(path.join(SRC, dir)).flatMap((entry) => {
    const rel = dir === "" ? entry : `${dir}/${entry}`;
    if (statSync(path.join(SRC, rel)).isDirectory()) return walk(rel);
    return entry.endsWith(".test.mjs") ? [] : [rel];
  });
}

/* ---------------------------------------------------------------------------
   The card draws the whole post and nothing else
   --------------------------------------------------------------------------- */

test("the card renders every field a Post carries, and no field it does not", () => {
  const boundary = read("lib/library.ts");
  const open = boundary.indexOf("export interface Post {");
  assert.ok(open !== -1, "lib/library.ts no longer declares `export interface Post`");
  const block = boundary.slice(open, boundary.indexOf("\n}", open));

  const declared = [...block.matchAll(/^ {2}(\w+):/gm)].map((match) => match[1]).sort();
  assert.deepEqual(
    declared,
    ["author", "date", "handle", "media", "text"],
    "the Post interface changed shape; this list and the card both move with it",
  );

  const drawn = [
    ...new Set(
      [...code(read("components/TweetCard.astro")).matchAll(/\bpost\.(\w+)\b/g)].map(
        (match) => match[1],
      ),
    ),
  ].sort();

  assert.deepEqual(
    drawn,
    declared,
    "TweetCard.astro and the Post interface disagree about what a post is. A field the parser requires and the card ignores is a field nothing on the site shows; a field the card reads and the parser does not carry is a build error waiting for the first entry without it.",
  );
});

test("the card reaches for nothing outside this origin", () => {
  // The parser already refuses a remote media path (`readShotPath`), so this is
  // the other half: the component itself must not hard-code a host either.
  //
  // Still true after VET-67, and worth being precise about why. The card is X's
  // embed now, but nothing in *this* file fetches: the permalink is
  // `entry.url`, an expression, and the one host in the build is in
  // `XEmbeds.astro`, which the test below holds to that one file. What these
  // three may never grow is a host of their own — an avatar CDN, a
  // `pbs.twimg.com`, a second script.
  for (const name of [
    "components/TweetCard.astro",
    "components/PostWall.astro",
    "components/PostBody.astro",
  ]) {
    assert.ok(
      !/https?:\/\//.test(code(read(name))),
      `${name} names an outside host. /privacy is built on there being one, and it is logo.dev.`,
    );
  }
});

test("every picture a post card would draw is a file in this repository", () => {
  const media = library.flatMap((entry) => entry.post?.media ?? []);
  assert.ok(media.length > 0, "no post carries media, so this test is checking nothing");

  for (const src of media) {
    assert.ok(
      existsSync(path.join(SRC, "..", "public", src)),
      `${src} is on an entry but there is no such file under public/. The card would draw a broken image and the sweep in pipeline/state.mjs would not know to fetch it.`,
    );
  }
});

/* ---------------------------------------------------------------------------
   The wall is one route's layout
   --------------------------------------------------------------------------- */

test("only the wall lays anything out in columns", () => {
  /** @type {Record<string, string[]>} */
  const found = { "column-width": [], "break-inside": [], "column-count": [] };

  for (const file of walk("")) {
    const source = code(read(file));
    for (const property of Object.keys(found)) {
      if (new RegExp(`(^|[;{\\s])${property}\\s*:`).test(source)) found[property].push(file);
    }
    assert.ok(
      !/(^|[;{\s])columns\s*:/.test(source),
      `${file} uses the \`columns\` shorthand. Spell the width and the gap separately: the shorthand's second value is a count, and a count is the one thing this layout must not fix.`,
    );
  }

  assert.deepEqual(
    found["column-width"],
    ["components/PostWall.astro"],
    "something other than the posts wall is laying content out in columns. A multi-column box reads top-to-bottom-then-across, so a list in one is a list in the wrong order.",
  );
  assert.deepEqual(found["break-inside"], ["components/TweetCard.astro"]);
  assert.deepEqual(found["column-count"], []);
});

test("the wall is reached from the post kind and from nowhere else", () => {
  // The component does not name itself outside its own comments, so the sweep
  // finds callers and nothing else. One caller is the whole point.
  const callers = walk("").filter((file) => code(read(file)).includes("PostWall"));
  assert.deepEqual(callers, ["pages/library/kind/[kind].astro"]);

  const route = code(read("pages/library/kind/[kind].astro"));
  assert.match(
    route,
    /kind === "post" \? \(\s*<PostWall/,
    "the kind route no longer gates the wall on the post kind. Keyed on the route rather than on the data: `/library/domain/x-com` is all posts too, and a page that changed shape because of what was filed into it is a page nobody can predict.",
  );

  // /library itself renders every kind at once, so it must stay a list.
  assert.ok(!code(read("pages/library.astro")).includes("PostWall"));
});

/* ---------------------------------------------------------------------------
   The clamp
   --------------------------------------------------------------------------- */

test("the two clips answer the same, so the second copy is a copy", () => {
  const cases = [
    "",
    "short",
    "a".repeat(40),
    "word ".repeat(300),
    "x".repeat(900),
    "  padded  ",
    "ends on a comma, and then some more words to push it over the line",
    `${"a".repeat(60)} tail`,
    "🙂".repeat(500),
    ...library.flatMap((entry) => (entry.post === null ? [] : [entry.post.text])),
  ];

  for (const max of [1, 12, 80, 280, POST_CARD_MAX]) {
    for (const text of cases) {
      assert.equal(
        clipText(text, max),
        clip(text, max),
        `lib/post.ts and pipeline/entries.mjs cut differently at ${max}. They are two copies of one rule and this is the thing that makes that safe.`,
      );
    }
  }
});

test("the cut happens at the budget and not before it", () => {
  const exact = "a ".repeat(POST_CARD_MAX / 2).trim();
  assert.equal([...exact].length, POST_CARD_MAX - 1);
  assert.equal(clipText(exact, POST_CARD_MAX), exact, "a post at the budget is shown whole");
  assert.equal(isClipped(exact), false);

  const over = `${exact} bb`;
  assert.equal([...over].length, POST_CARD_MAX + 2);
  assert.equal(isClipped(over), true);
  assert.ok(clipText(over, POST_CARD_MAX).endsWith("…"), "a cut post says it was cut");
  assert.ok([...clipText(over, POST_CARD_MAX)].length <= POST_CARD_MAX + 1);
});

test("the card is worth opening over the row it replaces", () => {
  // 280 is what a row's note carries (`pipeline/entries.mjs › POST_NOTE_MAX`),
  // and a card showing the same words as the row is a card doing no work.
  assert.ok(POST_CARD_MAX > 280 * 2);
});

test("no card runs past the budget, and no short post is touched", () => {
  const posts = library.flatMap((entry) => (entry.post === null ? [] : [entry.post]));
  assert.ok(posts.length > 0, "no post carries a `post` object, so this test is checking nothing");

  for (const post of posts) {
    const body = clipText(post.text, POST_CARD_MAX);
    assert.ok(
      [...body].length <= POST_CARD_MAX + 1,
      `the card for @${post.handle} would run to ${[...body].length} characters`,
    );
    assert.equal(
      body === post.text.trim(),
      !isClipped(post.text),
      `@${post.handle}: the card and \`isClipped\` disagree about whether the post was cut`,
    );
  }

  // The two long-form posts are the reason the budget exists. Named by length
  // rather than by slug, so this keeps meaning something as the library grows.
  const longest = posts.reduce((a, b) => ([...a.text].length > [...b.text].length ? a : b));
  assert.ok(
    [...longest.text].length > 10_000,
    "the long-form posts have gone; check the budget still earns itself",
  );
  assert.ok(isClipped(longest.text));
});

/* ---------------------------------------------------------------------------
   The monogram
   --------------------------------------------------------------------------- */

test("the monogram is the first letter of the name, and never a mystery glyph", () => {
  assert.equal(monogram("Ben Lang"), "B");
  assert.equal(monogram("  alphaXiv "), "A");
  assert.equal(monogram("_alejandro"), "A");
  assert.equal(monogram("🤗 Alejandro"), "A");
  assert.equal(monogram("第二"), "第");
  assert.equal(monogram("3Blue1Brown"), "3");
  assert.equal(monogram("🤗"), "", "a name with no letter in it draws no circle at all");
  assert.equal(monogram("  "), "");

  for (const entry of library) {
    if (entry.post === null) continue;
    assert.match(
      monogram(entry.post.author),
      /^[\p{L}\p{N}]$/u,
      `"${entry.post.author}" would put something other than one letter in a coloured circle`,
    );
  }
});

/* ---------------------------------------------------------------------------
   The seam
   --------------------------------------------------------------------------- */

test("the row, the card, the tile and the graph send a reader to the same place", () => {
  for (const entry of library) {
    const href = entryHref(entry);
    const claimed = libraryRowUrl(entry);

    assert.equal(href, `/library/${entry.slug}`);
    assert.ok(
      claimed.endsWith(`${href}/`),
      `${entry.slug}: the graph claims ${claimed} where the markup points at ${href}`,
    );
  }
});

test("nothing builds a /library URL of its own", () => {
  // The seam is one function so three surfaces cannot drift. A template
  // literal in a component is how one of them ends up pointing somewhere the
  // other two stopped.
  for (const name of [
    "components/TweetCard.astro",
    "components/LibraryList.astro",
    "components/VideoFacade.astro",
  ]) {
    const source = code(read(name));
    assert.match(source, /import \{ entryHref \}/, `${name} no longer reads the seam`);
    assert.ok(
      !/href=\{`\/library\/\$\{/.test(source),
      `${name} builds a /library URL of its own instead of asking entryHref for one`,
    );
  }
});

test("the card has exactly one door out and exactly one door in", () => {
  /*
   * **This is the reverse of the assertion it replaces, and the reversal is
   * VET-67.** It used to read "the card stays on this site": the card was one
   * anchor to `/library/<slug>` wearing no `rel`, no `target` and no arrow,
   * because a press anywhere on it went to one place and so could never be a
   * coin toss.
   *
   * The card is X's own embed now and that argument cannot survive it — every
   * link inside their iframe goes to X and none of them is ours to point
   * elsewhere. So the destination this site owns moved *outside* the embed,
   * into the `notes` bar under it, and the blockquote's permalink, which is
   * also what X's factory reads the post's id out of, is the one anchor here
   * that ends the visit and wears the arrow for saying so.
   *
   * The shape is what is still held: one way out, one way in, neither of them
   * ambiguous. Two outbound anchors in the fallback, or none, are both defects
   * and both would build.
   */
  const card = code(read("components/TweetCard.astro"));

  const doors = [...card.matchAll(/rel="noopener nofollow"/g)];
  assert.equal(
    doors.length,
    1,
    "the post card has one anchor that leaves and it is the post's own permalink. X's factory reads the id out of it, so losing it loses the embed as well as the door.",
  );
  assert.match(card, /class="card__source mono ext"/, "the one link that leaves wears the arrow");
  assert.match(card, /href=\{entry\.url\}/, "the permalink points at the post itself");
  assert.match(card, /target="_blank"/);
  assert.match(
    card,
    /class="card__link mono" href=\{href\}/,
    "the card has no `notes` link outside the embed, which would leave a wall of other people's frames with no way back into this site",
  );
});

test("the card is one box, and everything in it but the embed is the way in", () => {
  /*
   * **VET-114, and it is a grouping rather than a new destination.** The border
   * sat on the fallback and the `notes` bar carried a second one of its own, so
   * a hydrated card was X's rounded frame with an unrelated bordered strip
   * under it: two objects that happened to be stacked. Aayush's review of the
   * shipped wall asked for one container, and for a press anywhere in it that
   * is not the embed to open the entry's page.
   *
   * Five things make that true and every one of them fails silently:
   *
   *   - the border on `.card`, so the box is a box;
   *   - `position: relative` on `.card`, because the stretched overlay resolves
   *     `inset: 0` against the nearest positioned ancestor and would otherwise
   *     shrink to the bar it lives in;
   *   - the overlay itself, on the anchor, which is what makes the ring of card
   *     around the embed pressable at all;
   *   - `.card__embed`'s own layer, which is the *only* thing keeping X's links
   *     out from under it. Lose that one and every link in somebody else's post
   *     quietly becomes a link to /library — the page would look right and be
   *     wrong, which is why this is a test and not a comment;
   *   - and the embed's inset being a margin. As a padding it belonged to the
   *     embed's box, and a press 3px inside the card's own border landed on
   *     nothing. Measured on the dev server before it changed.
   */
  const card = code(read("components/TweetCard.astro"));

  assert.match(
    card,
    /\.card \{[^}]*position: relative;/,
    "`.card` stopped being the positioned ancestor, so the stretched link now measures itself against the notes bar and the rest of the card is dead to a press",
  );
  assert.match(
    card,
    /\.card \{[^}]*border: 1px solid var\(--card-line\);/,
    "the card is not one bordered box. VET-114 is the grouping: the embed and the bar under it have to read as one thing.",
  );
  assert.match(
    card,
    /\.card__link::before \{[^}]*position: absolute;\s*inset: 0;/,
    "the `notes` anchor no longer stretches, so only the bar itself opens the entry page and the rest of the card does nothing",
  );
  assert.match(
    card,
    /\.card__embed \{[^}]*position: relative;\s*z-index: 1;/,
    "the embed lost its layer and is now under the stretched link. Every link inside X's iframe would be swallowed by ours, which is the one thing an embed may not lose.",
  );
  assert.match(
    card,
    /\.card__embed \{[^}]*margin: /,
    "the embed's inset became a padding, so the ring of card around X's frame stopped being pressable — which is most of what 'anywhere that is not the embed' means",
  );

  // The bar is the real anchor and the overlay is a pseudo, so there is one tab
  // stop for the one destination. A focusable overlay would put the same page
  // in the tab order twice.
  assert.equal(
    [...card.matchAll(/<a\b/g)].length,
    2,
    "the card has a number of anchors other than two: the fallback's permalink out, and the `notes` link in",
  );

  // The wrapper is what puts a box round X's widget as well as round the
  // blockquote, and `XEmbeds.astro` still finds their widget as the
  // blockquote's previous sibling because their factory inserts it in place.
  assert.match(
    card,
    /<div class="card__embed">\s*\{?\/?\*?[\s\S]{0,600}?<blockquote class="card__quote twitter-tweet"/,
    "the blockquote is no longer inside `.card__embed`, so whichever of the fallback and the embed is on screen is no longer the thing being lifted above the stretched link",
  );
});

test("the embed is X's, the loader is ours, and the loader is in one file", () => {
  // `scripts/validate-schema.mjs` holds the other half of this — which built
  // pages may carry the host — and this holds the source half, so a second
  // component cannot start fetching from X without moving both.
  const loaders = walk("").filter((file) => /platform\.twitter\.com/.test(read(file)));
  assert.deepEqual(
    loaders,
    ["components/XEmbeds.astro"],
    "something other than XEmbeds.astro names X's widget host. /privacy is written around exactly one page loading it, and the dist guard is scoped to that page.",
  );

  const callers = walk("").filter((file) => code(read(file)).includes("<XEmbeds"));
  assert.deepEqual(
    callers,
    ["components/PostWall.astro"],
    "the widget factory is rendered somewhere other than the posts wall",
  );

  // Once per page and not once per card: twenty-four copies of that script
  // would be twenty-four appended tags.
  assert.ok(
    !code(read("components/TweetCard.astro")).includes("<XEmbeds"),
    "the card renders the loader, so a wall of them would load the factory once per card",
  );

  // The fallback is what a reader gets with scripting off and what holds the
  // masonry column open until the factory lands. A blockquote X cannot find,
  // or one with nothing in it, is a page that looks broken in both states.
  const card = code(read("components/TweetCard.astro"));
  assert.match(card, /class="card__quote twitter-tweet"/, "X's factory finds nothing to swap");
  assert.match(card, /data-dnt="true"/, "the embed does not ask X to leave the visit alone");
  assert.match(card, /min-height:/, "the fallback reserves no height, so the wall jumps on load");
});

test("the row keeps exactly one door off the site", () => {
  /*
   * The rewrite VET-63 made, held as a test. `entryHref` used to return
   * `{ href, external }` and three components spent that flag on a `rel`, a
   * `target` and an arrow; every entry has a page now, the flag would be false
   * everywhere, and a ternary that can only take one branch is not a decision.
   *
   * What replaces it is one unconditional outbound anchor per row. The row is
   * a directory entry and scanning a directory and pressing straight through
   * to the thing is how one is read, so `source` is that press, and it names
   * its own attributes because it is off-site for every entry rather than for
   * some of them.
   */
  const row = code(read("components/LibraryList.astro"));
  const outbound = [...row.matchAll(/rel="noopener nofollow"/g)];
  assert.equal(
    outbound.length,
    1,
    "a /library row has one way off the site and it is the `source` link. Two would make the row a coin toss; none would make the detail page a toll gate.",
  );
  assert.match(row, /class="row__source mono ext"/, "the one link that leaves wears the arrow");
  assert.match(row, /href=\{entry\.url\}/, "the source link points at the thing itself");
  assert.match(row, /target="_blank"/);
});

test("the fallback stands down on a height, never on a class name", () => {
  /*
   * The failure this exists to stop is the one that shipped. The hide was
   * `:global(.twitter-tweet-rendered) + .card__quote`, and X inserts that
   * container long before its iframe has a size — so the readable fallback was
   * thrown away the moment the class appeared and the wall showed a column of
   * `notes` bars with nothing above them. Measured live: twenty-four widgets at
   * zero height, the document down from 6311px to 1835px, and no recovery at
   * all on a load where X never sizes them.
   *
   * design.md §3 is unambiguous about what this dependency owes: visible and
   * wrong beats silent and wrong. A class is not evidence that an embed
   * rendered; a height is.
   */
  const card = code(read("components/TweetCard.astro"));
  const embeds = code(read("components/XEmbeds.astro"));

  assert.match(
    card,
    /\.card__quote\[data-embedded\]\s*\{\s*display:\s*none;/,
    "the fallback is hidden by something other than `data-embedded`. Whatever that is, it has to be evidence the embed actually rendered — see design.md §3.",
  );
  assert.ok(
    !/twitter-tweet-rendered/.test(card),
    "the card is keyed on X's widget class again. That class arrives before their iframe has a height, which is how the wall went blank the first time.",
  );

  assert.match(
    embeds,
    /getBoundingClientRect\(\)\.height>\$\{MIN_EMBED\}/,
    "the watcher stopped measuring the widget's height, which is the only evidence there is that an embed is really there",
  );
  assert.match(
    embeds,
    /setAttribute\("data-embedded",""\)/,
    "nothing marks the blockquote, so the fallback can never stand down and every card would draw twice",
  );
  assert.match(
    embeds,
    /removeAttribute\("data-embedded"\)/,
    "the mark is never taken off, so an embed that collapses after it loaded leaves an empty column with no fallback under it",
  );
  assert.match(
    embeds,
    /clearInterval\(t\)/,
    "the watch never stops. On a page where X does not answer it would poll for the whole visit.",
  );
});
