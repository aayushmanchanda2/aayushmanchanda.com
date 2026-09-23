/**
 * The post card and the grid it sits in, under test.
 *
 * Drift tests in the sense `lib/wide.test.mjs` uses: they parse shipped files
 * as text, because there is no runtime to ask what an `.astro` component drew.
 * What they hold:
 *
 *   - **Nothing reaches X.** The card is drawn from the repo (VET-244). No
 *     component names an outside host, no page loads X's script, and every
 *     picture an entry points at is a file under `public/`.
 *   - **The grid belongs to one view**, /library's Posts.
 *   - **The two copies.** `lib/post.ts › clipText` is a copy of
 *     `pipeline/entries.mjs › clip`, and `lib/library.ts › entryHref` is the
 *     markup's half of `lib/schema.ts › libraryRowUrl`.
 *   - **The one door off a row.** A /library row's `source` link is its only
 *     outbound anchor.
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

test("the card draws the fields a post carries", () => {
  const card = code(read("components/PostCard.astro"));
  for (const field of ["author", "handle", "date", "avatar", "links", "media", "quoted", "article", "removed"]) {
    assert.match(card, new RegExp(`\\bpost\\.${field}\\b`), `PostCard.astro no longer draws post.${field}`);
  }
});

test("the card reaches for nothing outside this origin", () => {
  // The parser refuses a remote media path (`readPostFile`); this is the other
  // half: the components must not hard-code a host either. The one host a card
  // names is X's, in the links out, built by `lib/post.ts › originalUrl`.
  for (const name of ["components/PostCard.astro", "components/PostWall.astro"]) {
    assert.ok(
      !/https?:\/\//.test(code(read(name))),
      `${name} names an outside host. /privacy names every outside host, and a post card is not one of them.`,
    );
  }
});

test("no shipped file loads X's widget script or embeds", () => {
  for (const file of walk("")) {
    assert.ok(
      !/platform\.twitter\.com|widgets\.js|twitter-tweet|syndication\.twimg/.test(code(read(file))),
      `${file} talks to X from the reader's browser. Posts are drawn from the repo (VET-244).`,
    );
  }
});

test("every picture a post card would draw is a file in this repository", () => {
  /** @param {import("./library.ts").Post} post @returns {string[]} */
  const files = (post) => [
    ...(post.avatar ? [post.avatar] : []),
    ...(post.article?.cover ? [post.article.cover] : []),
    ...post.media.flatMap((item) => [item.src, item.poster].filter((src) => src !== null)),
    ...(post.quoted ? files(post.quoted) : []),
  ];
  const all = library.flatMap((entry) => (entry.post ? files(entry.post) : []));
  assert.ok(all.length > 0, "no post carries a picture, so this test is checking nothing");

  for (const src of all) {
    assert.ok(
      existsSync(path.join(SRC, "..", "public", src)),
      `${src} is on an entry but there is no such file under public/. Run pipeline/backfill-posts.mjs.`,
    );
  }
});

/* ---------------------------------------------------------------------------
   The wall is one route's layout
   --------------------------------------------------------------------------- */

test("nothing lays content out in columns", () => {
  // The posts wall was the one multi-column box and it is a grid now, so posts
  // read newest first across. A multi-column box reads down-then-across.
  for (const file of walk("")) {
    const source = code(read(file));
    assert.ok(
      !/(^|[;{\s])(column-width|column-count|columns)\s*:/.test(source),
      `${file} lays content out in columns, which reads in the wrong order.`,
    );
  }
});

test("the wall is reached from the Posts view and from nowhere else", () => {
  // The component does not name itself outside its own comments, so the sweep
  // finds callers and nothing else. One caller is the whole point.
  const callers = walk("").filter((file) => code(read(file)).includes("PostWall"));
  assert.deepEqual(callers, ["components/LibraryViews.astro"]);

  assert.match(
    code(read("components/LibraryViews.astro")),
    /<section class="view" data-view="post"[^>]*>[^]*?<PostWall entries=\{of\("post"\)\} \/>[^]*?<\/section>/,
    "the wall left the Posts view. Keyed on the view rather than on the data: `/library/domain/x-com` is all posts too, and a page that changed shape because of what was filed into it is a page nobody can predict.",
  );
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
    "components/PostWall.astro",
    "components/LibraryList.astro",
    "components/LibraryFeed.astro",
    "components/LibraryViews.astro",
  ]) {
    const source = code(read(name));
    assert.match(source, /import \{[^}]*\bentryHref\b[^}]*\}/, `${name} no longer reads the seam`);
    assert.ok(
      !/href=\{`\/library\/\$\{/.test(source),
      `${name} builds a /library URL of its own instead of asking entryHref for one`,
    );
  }
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

