/**
 * The click-to-play video facade, under test.
 *
 * These are drift tests in the sense `lib/card.test.mjs` and `lib/wide.test.mjs`
 * are: they parse shipped files as text, because there is no runtime to ask
 * what an `.astro` component drew. What they hold is the handful of things
 * about this slice that would go wrong quietly.
 *
 *   - **The facade spreading, or vanishing.** Two surfaces render it and both
 *     are named: the shelf on `/library/kind/video`, keyed on the route rather
 *     than on the data, and the video's own `/library/<slug>` page, where it
 *     arrives without the tile's chrome. A video is a row on every list,
 *     /library included, because there it lines up beside articles.
 *   - **The markup growing a YouTube host.** This is the one that matters, and
 *     it is the `markFor` refusal in `lib/links.test.mjs` pointed at a second
 *     page: an `<iframe src="…youtube…">` in a template is an always-live embed
 *     and it would make /privacy wrong the moment it shipped. The source half
 *     is here; `scripts/validate-schema.mjs` reads the built HTML for the other
 *     half, because a build step is what catches a host arriving from somewhere
 *     this sweep does not look.
 *   - **A second provider.** `PROVIDERS` has one member and the embed origin is
 *     written once, in the facade's own script. Adding Vimeo to the parser
 *     without adding it there would build a YouTube URL out of a Vimeo id.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PROVIDERS, library } from "./library.ts";

const SRC = fileURLToPath(new URL("..", import.meta.url));

const FACADE = "components/VideoFacade.astro";
const ROUTE = "pages/library/kind/[kind].astro";
const DETAIL = "pages/library/[slug].astro";

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

/**
 * Every shipped file under `src/`, tests skipped.
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

/**
 * A URL a browser would fetch a video, or a picture of one, from.
 *
 * Two things are deliberately outside it. `youtube.com/watch` is not a host on
 * this list: a row's title has linked there since the section existed, and a
 * link a reader may choose to follow is not a request the page makes. And the
 * pattern matches a **URL**, not a word, because `/privacy` now names
 * youtube-nocookie.com in a sentence on purpose — the page's whole job is to
 * say which host a press reaches, and a host in prose fetches nothing.
 */
const EMBED_URL =
  /(?:https?:)?\/\/[\w.-]*(?:youtube-nocookie\.com|youtube\.com\/embed|ytimg\.com|googlevideo\.com)/;

/* ---------------------------------------------------------------------------
   The facade is one route's layout
   --------------------------------------------------------------------------- */

test("the facade is reached from the video kind and the entry's own page, and nowhere else", () => {
  const callers = walk("").filter(
    (file) => file !== FACADE && code(read(file)).includes("VideoFacade"),
  );
  assert.deepEqual(
    callers.sort(),
    [DETAIL, ROUTE].sort(),
    "something other than the video kind page and a video's own page renders the facade. A video is a row on every list, /library included, where it has to line up beside articles.",
  );

  assert.match(
    code(read(ROUTE)),
    /kind === "video" \? \(\s*<ul class="shelf">/,
    "the kind route no longer gates the shelf on the video kind. Keyed on the route rather than on the data: `/library/domain/youtube-com` is all videos too.",
  );

  assert.ok(
    !code(read("pages/library.astro")).includes("VideoFacade"),
    "/library renders every kind at once, so it must stay a list",
  );
});

test("a detail page takes the poster and leaves the tile's chrome behind", () => {
  /*
   * The second caller is the reason `chrome` exists. A `/library/<slug>` page
   * has the title as its `h1`, the note as its standfirst and the saved date in
   * its strip, so a tile there would say all three a second time and one of
   * them as a link to the page the reader is already on.
   */
  assert.match(
    code(read(DETAIL)),
    /<VideoFacade entry=\{\{ \.\.\.entry, video: entry\.video \}\} chrome=\{false\} \/>/,
    "the entry page renders the whole tile, so its title, note and date land on the page twice",
  );
  assert.match(
    code(read(ROUTE)),
    /<VideoFacade entry=\{entry\} \/>/,
    "the shelf stopped rendering the tile's title, note and date, which are the only things on a poster shelf that say what a video is",
  );

  // The wrapper moves with the chrome: an `<li>` outside a list is markup a
  // parser has to guess at.
  assert.match(
    code(read(FACADE)),
    /const Wrapper = chrome \? "li" : "div";/,
    "the facade's root element no longer follows `chrome`",
  );
});

test("only an entry carrying a video gets a facade", () => {
  assert.match(
    code(read(ROUTE)),
    /entry is LibraryEntry & \{ video: Video \}/,
    "the video page no longer filters out an entry with no video object. There would be no still to show and no id to play.",
  );
  assert.match(
    code(read(FACADE)),
    /entry: LibraryEntry & \{ video: Video \}/,
    "the facade's Props no longer require a video, so a caller could hand it an entry with none",
  );
});

test("every video entry's poster is a file in this repository", () => {
  const videos = library.flatMap((entry) => (entry.video === null ? [] : [entry.video]));
  assert.ok(videos.length > 0, "no entry carries a video, so this test is checking nothing");

  for (const video of videos) {
    assert.ok(
      existsSync(path.join(SRC, "..", "public", video.thumb)),
      `${video.thumb} is on an entry but there is no such file under public/. The facade would draw a broken image where the poster goes.`,
    );
  }
});

/* ---------------------------------------------------------------------------
   Nothing loads from YouTube until a press
   --------------------------------------------------------------------------- */

test("no template on this site names a URL a video would load from", () => {
  /** @type {string[]} */
  const named = [];

  for (const file of walk("")) {
    const source = code(read(file));

    assert.ok(
      !/<iframe/i.test(source),
      `${file} ships an iframe in its markup. The facade builds one on a press and only on a press; an iframe in a template is a request every reader makes on load, and /privacy is built on that not happening.`,
    );

    if (!EMBED_URL.test(source)) continue;
    named.push(file);

    const script = source.indexOf("<script>");
    assert.notEqual(script, -1, `${file} holds an embed URL and has no script to justify it`);
    assert.ok(
      !EMBED_URL.test(source.slice(0, script)),
      `${file} holds an embed URL in its markup rather than in its script. It has to be built at press time, or the built HTML carries it and the facade is a facade in name only.`,
    );
  }

  assert.deepEqual(
    named,
    [FACADE],
    "the embed origin has moved, or a second file has grown one. It is written once, in the facade's own script.",
  );
});

test("a second provider needs a second embed origin, and this is where it goes", () => {
  assert.deepEqual(
    [...PROVIDERS],
    ["youtube"],
    "`lib/library.ts › PROVIDERS` has grown a member. The facade's script builds a youtube-nocookie URL for whatever id it is given, so a second provider is a branch there and a branch here, in the same commit.",
  );

  const origins = code(read(FACADE)).match(/https:\/\/www\.youtube-nocookie\.com\/embed\//g) ?? [];
  assert.equal(origins.length, 1, "the embed origin is written once and read from one const");
});

/* ---------------------------------------------------------------------------
   The two controls on a tile
   --------------------------------------------------------------------------- */

test("the play control is a link to the video, named for the video", () => {
  const source = code(read(FACADE));

  assert.match(
    source,
    /<span class="visually-hidden">Play video: \{entry\.title\}<\/span>/,
    "the play control has lost its accessible name. Everything visible inside it is a decorative glyph, so without this it announces as a link with no text.",
  );
  assert.match(
    source,
    /href=\{entry\.url\}/,
    "the play control no longer points at the video itself. It is an anchor so that pressing it works with scripting off, and `entryHref` is the wrong answer here: that is where the tile's *title* goes, which is the entry's own page.",
  );
  assert.match(source, /rel="noopener nofollow"/);
  assert.match(source, /target="_blank"/);
  assert.ok(
    !/<button/.test(source),
    "the play control has become a button, which does nothing at all without JavaScript on a tile whose whole subject is a video",
  );
});

test("the tile's title reads the same seam the row and the card do, and stays here", () => {
  const source = code(read(FACADE));

  assert.match(source, /import \{ entryHref \}/);
  assert.ok(
    !/href=\{`\/library\/\$\{/.test(source),
    "the facade builds a /library URL of its own instead of asking entryHref for one",
  );

  /*
   * The title link carries no `rel` and no `target`, because since VET-63 it
   * does not leave: it goes to the entry's own page. The two outbound
   * attributes in this file both belong to the play control above it, which is
   * off-site for every video there has ever been.
   */
  assert.equal(
    [...source.matchAll(/rel="noopener nofollow"/g)].length,
    1,
    "the tile has grown a second outbound anchor. The play control leaves; the title does not.",
  );
  assert.match(source, /<a class="tile__link" href=\{href\}>/, "the title link took on attributes");
});
