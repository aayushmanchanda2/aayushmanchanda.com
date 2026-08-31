/**
 * The /library boundary's own readers, under test.
 *
 * `lib/parse.test.mjs` covers the shared floor. This file covers what only
 * /library knows, and it appeared with the four objects an entry can now carry
 * — `tags`, `post`, `video`, `draft` — because those brought a kind of bug the
 * older fields could not have. `note` and `digest` are either there or not.
 * These four are there or not AND belong to one kind of entry or another AND
 * point at files on disk, so there are three ways to write a wrong one and only
 * a parser standing between the wrong one and a rendered page.
 *
 * `parseLibrary` is importable from Node — unlike `lib/library.ts`'s derived
 * exports, which read `src/data/library.json` at module load — so everything
 * here runs against literals rather than against the real file. What the real
 * file is allowed to be is `astro build`'s question.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { KINDS, PROVIDERS, parseLibrary } from "./library.ts";

/**
 * A minimal valid entry. Every test below is this plus one thing wrong.
 *
 * @param {Record<string, unknown>} [extra]
 * @returns {Record<string, unknown>}
 */
function entry(extra = {}) {
  return {
    slug: "a-saved-thing",
    title: "A saved thing",
    url: "https://example.com/a",
    domain: "example.com",
    saved_date: "2026-08-26",
    kind: "article",
    ...extra,
  };
}

/**
 * Asserts that parsing throws, and that the message says where and what.
 *
 * Fragments rather than a whole sentence, the same call `parse.test.mjs` makes:
 * these messages exist so a person can act on them, so what is pinned is the
 * file, the entry and the way out — not the wording around them.
 *
 * @param {Record<string, unknown>} bad
 * @param {...string} fragments
 */
function failsWith(bad, ...fragments) {
  assert.throws(
    () => parseLibrary([bad]),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /src\/data\/library\.json/);
      for (const fragment of fragments) assert.match(error.message, new RegExp(fragment));
      return true;
    },
  );
}

/** @param {Record<string, unknown>} value */
function parseOne(value) {
  const [parsed] = parseLibrary([entry(value)]);
  assert.ok(parsed !== undefined);
  return parsed;
}

test("an entry with none of the optional objects reads as all-nothing", () => {
  const parsed = parseOne({});

  assert.deepEqual(parsed.tags, []);
  assert.equal(parsed.post, null);
  assert.equal(parsed.video, null);
  assert.equal(parsed.draft, null);
  assert.equal(parsed.why, null);
  assert.equal(parsed.digest, null, "and the field that was already optional is unchanged");
});

/* ---------------------------------------------------------------------------
   tags
   --------------------------------------------------------------------------- */

test("tags come through as authored, because the string is the route", () => {
  assert.deepEqual(parseOne({ tags: ["agents", "go-to-market"] }).tags, ["agents", "go-to-market"]);
});

test("a tag that is not already a slug is refused, not folded", () => {
  // Folding "Go To Market" down here would make the file's contents and the
  // site's routes two different strings, and a typo would quietly mint a tag
  // page with one entry on it.
  failsWith(entry({ tags: ["Go To Market"] }), "not a URL-safe slug");
  failsWith(entry({ tags: ["go to market"] }), "not a URL-safe slug");
  failsWith(entry({ tags: ["go--to"] }), "not a URL-safe slug");
  failsWith(entry({ tags: [""] }), "not a URL-safe slug");
  failsWith(entry({ tags: [7] }), "not a URL-safe slug");
});

test("the same tag twice is an error rather than a doubled row", () => {
  failsWith(entry({ tags: ["agents", "agents"] }), 'lists the tag "agents" twice');
});

test("an empty tags array is a half-finished edit, and says so", () => {
  // Absent means none. `[]` means something wrote a blank where it meant to
  // write nothing, which is the same call `readNote` makes about `""`.
  failsWith(entry({ tags: [] }), "empty \"tags\" array");
  assert.deepEqual(parseOne({ tags: null }).tags, [], "an explicit null is still nothing");
});

/* ---------------------------------------------------------------------------
   post
   --------------------------------------------------------------------------- */

const POST = {
  author: "Diadem",
  handle: "EphraimAkanmu",
  date: "2026-07-26",
  text: "A lot of designers have been asking me where I get my inspiration from.",
};

test("a post reads whole, with an absent media array as an empty one", () => {
  const parsed = parseOne({ kind: "post", url: "https://x.com/a/status/1", domain: "x.com", post: POST });

  assert.deepEqual(parsed.post, { ...POST, media: [] });
});

test("a post on anything but a post entry stops the build", () => {
  // Two edits disagreed about what this entry is, and the second one to be
  // written is not necessarily the right one — so neither wins.
  failsWith(entry({ post: POST }), "is a article carrying a \"post\" object");
});

test("a half-read post is refused the way a half-written digest is", () => {
  const asPost = { kind: "post", url: "https://x.com/a/status/1", domain: "x.com" };

  failsWith(entry({ ...asPost, post: { ...POST, author: undefined } }), 'non-empty string "author"');
  failsWith(entry({ ...asPost, post: { ...POST, date: "2026-02-31" } }), "real YYYY-MM-DD date");
  failsWith(entry({ ...asPost, post: { ...POST, text: "" } }), 'non-empty string "text"');
  failsWith(entry({ ...asPost, post: "@someone" }), 'needs "post" to be an object');
});

test("a remote media URL cannot be carried, so no page can render one", () => {
  // The privacy rule made structural rather than remembered. A pbs.twimg.com
  // URL in this field would render as an `<img>` pointed at x.com's CDN and
  // hand every reader of the page to a third party. There is no flag that turns
  // that on, because the parser will not hold the value.
  const asPost = { kind: "post", url: "https://x.com/a/status/1", domain: "x.com" };

  failsWith(
    entry({ ...asPost, post: { ...POST, media: ["https://pbs.twimg.com/media/a.jpg"] } }),
    "never a remote URL",
  );
  failsWith(entry({ ...asPost, post: { ...POST, media: ["/shots/../secret.webp"] } }), "never a remote URL");
  failsWith(entry({ ...asPost, post: { ...POST, media: ["/shots/a.jpg"] } }), "never a remote URL");
  failsWith(entry({ ...asPost, post: { ...POST, media: [] } }), "non-empty array of /shots paths");

  const ok = parseOne({ ...asPost, post: { ...POST, media: ["/shots/a-1.webp"] } });
  assert.deepEqual(Object(ok.post).media, ["/shots/a-1.webp"]);
});

/* ---------------------------------------------------------------------------
   video
   --------------------------------------------------------------------------- */

const AS_VIDEO = {
  kind: "video",
  url: "https://www.youtube.com/watch?v=vJEy3nP2_C8",
  domain: "youtube.com",
};

test("a video names a provider from the list, an id and a committed still", () => {
  const parsed = parseOne({
    ...AS_VIDEO,
    video: { provider: "youtube", id: "vJEy3nP2_C8", thumb: "/shots/a-thumb.webp" },
  });

  assert.deepEqual(parsed.video, {
    provider: "youtube",
    id: "vJEy3nP2_C8",
    thumb: "/shots/a-thumb.webp",
  });
});

test("a provider nobody has taught this repo about is refused by name", () => {
  // Adding one is a decision — a URL shape `thumb.mjs` can read and a host this
  // repo will fetch from — so it cannot arrive as a string in a data file.
  failsWith(
    entry({ ...AS_VIDEO, video: { provider: "vimeo", id: "12345", thumb: "/shots/a-thumb.webp" } }),
    'needs "video.provider" to be one of youtube',
  );
  assert.deepEqual([...PROVIDERS], ["youtube"], "and the list is the one place that changes");
});

test("a video's thumb obeys the same /shots rule the media does", () => {
  failsWith(
    entry({
      ...AS_VIDEO,
      video: { provider: "youtube", id: "a", thumb: "https://i.ytimg.com/vi/a/hq.jpg" },
    }),
    "never a remote URL",
  );
});

test("a video object on a post or an article stops the build", () => {
  failsWith(
    entry({ video: { provider: "youtube", id: "a", thumb: "/shots/a-thumb.webp" } }),
    "is a article carrying a \"video\" object",
  );
});

/* ---------------------------------------------------------------------------
   draft, and the why that is not one
   --------------------------------------------------------------------------- */

test("a draft may carry bullets, or a why, or both", () => {
  assert.deepEqual(parseOne({ draft: { bullets: ["One line."], drafted: "2026-08-30" } }).draft, {
    bullets: ["One line."],
    why: null,
    drafted: "2026-08-30",
  });
  assert.deepEqual(parseOne({ draft: { why: "Saved because it covers X.", drafted: "2026-08-30" } }).draft, {
    bullets: null,
    why: "Saved because it covers X.",
    drafted: "2026-08-30",
  });
});

test("a draft with neither is not an empty draft, it is no draft", () => {
  // Which is what makes the why-promotion a field move with no cleanup step:
  // moving the last sentence out of a draft leaves nothing, and nothing is null.
  failsWith(entry({ draft: { drafted: "2026-08-30" } }), "neither bullets nor a why");
  failsWith(entry({ draft: { bullets: ["One."] } }), 'non-empty string "drafted"');
  failsWith(entry({ draft: { bullets: [], why: "x", drafted: "2026-08-30" } }), "non-empty array");
  failsWith(
    entry({ draft: { bullets: ["two\nlines"], drafted: "2026-08-30" } }),
    "one non-empty line",
  );
});

test("the digest keeps its all-four-or-none rule, unchanged", () => {
  // The reason `Draft` is a separate type rather than a looser `Digest`. A
  // digest is a judgement and half of one is a summary; a draft is a
  // placeholder and half of one is still useful.
  failsWith(
    entry({ digest: { bullets: ["One."], why: "x", digested: "2026-08-30" } }),
    'non-empty string "verdict"',
  );
});

test("his why and a drafted why are different fields, and both can be there", () => {
  const parsed = parseOne({
    why: "Two rules are worth stealing straight into my stack.",
    draft: { bullets: ["One line."], drafted: "2026-08-30" },
  });

  assert.equal(parsed.why, "Two rules are worth stealing straight into my stack.");
  assert.equal(Object(parsed.draft).why, null);
});

test("an empty why is a half-finished edit, like every other optional sentence", () => {
  failsWith(entry({ why: "" }), "Leave the key out to say nothing");
});

/* ---------------------------------------------------------------------------
   What did not change
   --------------------------------------------------------------------------- */

test("the kind vocabulary is still three words", () => {
  assert.deepEqual([...KINDS], ["article", "post", "video"]);
});

test("the rules the new fields sit beside still hold", () => {
  failsWith(entry({ domain: "elsewhere.com" }), "but its url points at");
  failsWith(entry({ note: "" }), 'needs "note" to be a non-empty string');
  assert.throws(
    () => parseLibrary([entry(), entry()]),
    /repeats the slug/,
    "slugs are the pipeline's key",
  );
});
