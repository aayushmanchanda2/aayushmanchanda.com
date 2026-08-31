/**
 * The decisions, tested as decisions.
 *
 * `plan()` does no I/O, which is the point: dedupe, the retry cap and the x.com
 * short-circuit are the rules most likely to rot, and here they are assertions
 * about a data structure rather than about a directory. The last section covers
 * the other half of `publish.mjs`'s own surface — the ways a run refuses to
 * start. Runs that actually do something live next door in `run.test.mjs`.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { deriveKind, uniqueSlug } from "./entries.mjs";
import { NESTED, collection, makeRepo, raindropServer, recorder } from "./fixtures.mjs";
import { COLLECTION_NAMES, isTweetHost, plan, run } from "./publish.mjs";
import { RaindropError, createClient, resolveCollections } from "./raindrop.mjs";
import { MAX_ATTEMPTS } from "./state.mjs";

/**
 * A parsed bookmark — what `plan()` sees after the Raindrop boundary.
 *
 * @param {string} id
 * @param {string} url
 * @param {import("./types.js").Section} section
 * @param {{ title?: string, excerpt?: string, note?: string, tags?: string[] }} [extra]
 * @returns {import("./types.js").Bookmark}
 */
function mark(id, url, section, extra = {}) {
  return {
    id,
    url,
    title: extra.title ?? "",
    excerpt: extra.excerpt ?? "",
    note: extra.note ?? "",
    domain: "",
    collection: section,
    tags: extra.tags ?? [],
  };
}

const EMPTY = { sites: [], tools: [], reading: [] };

/* ---------------------------------------------------------------------------
   Dedupe, the retry cap, the short-circuit
   --------------------------------------------------------------------------- */

test("plan: a settled state row means the bookmark is never looked at again", () => {
  const bookmarks = [
    mark("1", "https://a.example", "sites"),
    mark("2", "https://b.example", "sites"),
  ];
  /** @type {import("./types.js").StateMap} */
  const state = {
    1: { kind: "published", slug: "a", section: "sites", at: "2026-08-26T10:00:00.000Z" },
    2: { kind: "failed", attempts: 3, lastError: "bot-blocked", at: "2026-08-26T10:00:00.000Z" },
  };

  const { work, skipped } = plan({ bookmarks, state, gallery: EMPTY });

  assert.deepEqual(work, []);
  assert.equal(skipped, 2);
});

test("plan: a pending row is retried until the cap, then dead-lettered", () => {
  const bookmarks = [mark("7", "https://slow.example", "sites")];

  const retrying = plan({ bookmarks, state: { 7: { kind: "pending", attempts: 2 } }, gallery: EMPTY });
  assert.equal(retrying.work[0].kind, "capture");
  assert.equal(retrying.work[0].attempts, 2);

  const capped = plan({
    bookmarks,
    state: { 7: { kind: "pending", attempts: MAX_ATTEMPTS, lastError: "timeout" } },
    gallery: EMPTY,
  });
  assert.equal(capped.work[0].kind, "dead-letter");
  assert.equal(capped.work[0].lastError, "timeout");
});

test("plan: x.com and twitter.com are rejected before a browser is opened", () => {
  const bookmarks = [
    mark("1", "https://x.com/brian_lovin/status/2091209219609628826", "sites"),
    mark("2", "https://mobile.twitter.com/someone/status/1", "sites"),
    mark("3", "https://linear.app", "sites"),
  ];

  const { work } = plan({ bookmarks, state: {}, gallery: EMPTY });

  assert.deepEqual(
    work.map((item) => item.kind),
    ["reject", "reject", "capture"],
  );

  // Narrowed by hand: `reason` belongs to one arm of `PlannedItem`, and
  // `assert.fail` returns `never`, so the line below reads as a rejection.
  const [first] = work;
  if (first?.kind !== "reject") assert.fail(`expected a reject, got ${first?.kind}`);
  assert.match(first.reason, /save the product's URL/);
});

test("plan: x.com is allowed into /library, where a post is the point", () => {
  const bookmarks = [
    mark("1", "https://x.com/benln/status/2006057848430604705", "reading"),
    mark("2", "https://mobile.twitter.com/someone/status/1", "reading"),
    mark("3", "https://www.thealgorithmicbridge.com/p/something", "reading"),
  ];

  const { work } = plan({ bookmarks, state: {}, gallery: EMPTY });

  assert.deepEqual(
    work.map((item) => item.kind),
    ["capture", "capture", "capture"],
    "the screenshot rule does not follow the link into a section that takes no screenshots",
  );
});

test("plan: the same tweet is still rejected from /sites and /tools", () => {
  const url = "https://x.com/someone/status/1";
  const both = ["sites", "tools"].map((section) =>
    plan({
      bookmarks: [mark("1", url, /** @type {import("./types.js").Section} */ (section))],
      state: {},
      gallery: EMPTY,
    }),
  );

  assert.deepEqual(
    both.map((result) => result.work[0]?.kind),
    ["reject", "reject"],
  );
});

test("deriveKind: the two hosts the site is sure about, and the fallback", () => {
  assert.equal(deriveKind("https://x.com/a/status/1"), "post");
  assert.equal(deriveKind("https://www.twitter.com/a/status/1"), "post");
  assert.equal(deriveKind("https://mobile.twitter.com/a"), "post");
  assert.equal(deriveKind("https://www.youtube.com/watch?v=xoE_pE26yDQ"), "video");
  assert.equal(deriveKind("https://youtu.be/xoE_pE26yDQ"), "video");
  assert.equal(deriveKind("https://m.youtube.com/watch?v=x"), "video");

  // Everything else is words on a page until a human says otherwise.
  assert.equal(deriveKind("https://www.thealgorithmicbridge.com/p/google"), "article");
  assert.equal(deriveKind("https://gumclaw.github.io/how-i-work/"), "article");

  // The lookalikes `isTweetHost` already refuses, asked the other way round.
  assert.equal(deriveKind("https://x.company/a"), "article");
  assert.equal(deriveKind("https://notyoutube.com/watch"), "article");
  assert.equal(deriveKind("not a url"), "article");
});

test("isTweetHost: subdomains count, lookalikes do not", () => {
  assert.equal(isTweetHost("https://x.com/a/status/1"), true);
  assert.equal(isTweetHost("https://www.twitter.com/a"), true);
  assert.equal(isTweetHost("https://mobile.twitter.com/a"), true);
  assert.equal(isTweetHost("https://x.company/a"), false);
  assert.equal(isTweetHost("https://notx.com/a"), false);
  assert.equal(isTweetHost("not a url"), false);
});

test("plan: a link the gallery already holds is adopted, not re-published", () => {
  const gallery = { sites: [{ slug: "linear", url: "https://linear.app/" }], tools: [], reading: [] };
  // The same link, spelled differently: www, no trailing slash.
  const { work } = plan({ bookmarks: [mark("9", "https://www.linear.app", "sites")], state: {}, gallery });

  assert.equal(work[0].kind, "adopt");
  assert.equal(work[0].slug, "linear");
});

test("plan: the same URL in the other gallery is not a match", () => {
  const gallery = { sites: [{ slug: "linear", url: "https://linear.app" }], tools: [], reading: [] };
  const { work } = plan({ bookmarks: [mark("9", "https://linear.app", "tools")], state: {}, gallery });

  assert.equal(work[0].kind, "capture", "a site and a tool are different pages");
});

test("plan: a tool already on the page as a repo is adopted, not published twice", () => {
  /*
   * A /tools entry saved from GitHub stores the link in `repo` and leaves `url`
   * null, so an index built from `url` alone would not contain it — and saving
   * the same project again would quietly publish a second copy of the row. Both
   * fields go into the index for exactly this.
   */
  const gallery = {
    sites: [],
    tools: [{ slug: "buzz", url: null, repo: "https://github.com/block/buzz" }],
    reading: [],
  };

  const { work } = plan({
    bookmarks: [mark("9", "https://github.com/block/buzz", "tools")],
    state: {},
    gallery,
  });

  assert.equal(work[0].kind, "adopt");
  assert.equal(work[0].slug, "buzz");
});

test("plan: a deep link into a repo already on the page is the same tool", () => {
  const gallery = {
    sites: [],
    tools: [{ slug: "buzz", url: null, repo: "https://github.com/block/buzz" }],
    reading: [],
  };

  const { work } = plan({
    bookmarks: [mark("9", "https://github.com/block/buzz/blob/main/README.md", "tools")],
    state: {},
    gallery,
  });

  assert.equal(work[0].kind, "adopt", "the README of a tool is that tool");
  assert.equal(work[0].slug, "buzz");
});

test("plan: /library does not fold two files in one repo into one entry", () => {
  // The fold is a /tools rule. Two pages in a repository are two things to read.
  const gallery = {
    sites: [],
    tools: [],
    reading: [{ slug: "buzz-readme", url: "https://github.com/block/buzz/blob/main/README.md" }],
  };

  const { work } = plan({
    bookmarks: [mark("9", "https://github.com/block/buzz/blob/main/VISION.md", "reading")],
    state: {},
    gallery,
  });

  assert.equal(work[0].kind, "capture");
});

/* ---------------------------------------------------------------------------
   Collections, resolved by name
   --------------------------------------------------------------------------- */

test("resolveCollections: finds all three nested under a Publish parent", async () => {
  const server = raindropServer(NESTED);
  const ids = await resolveCollections(
    createClient({ token: "t", fetch: server.fetch }),
    COLLECTION_NAMES,
  );
  assert.deepEqual(ids, { tools: 11, sites: 12, reading: 13 });
});

test("resolveCollections: finds collections literally titled 'Publish/Tools'", async () => {
  const server = raindropServer({
    roots: [
      collection(31, "publish / tools"),
      collection(32, "Publish/Sites"),
      collection(33, "PUBLISH/Reading"),
    ],
  });
  const ids = await resolveCollections(
    createClient({ token: "t", fetch: server.fetch }),
    COLLECTION_NAMES,
  );
  assert.deepEqual(
    ids,
    { tools: 31, sites: 32, reading: 33 },
    "case and spacing are not the user's problem",
  );
});

test("resolveCollections: a missing collection names itself and the alternatives", async () => {
  // A bare `Reading` is not `Publish/Reading`, which is the point: the pipeline
  // must never read a collection the user did not put under Publish.
  const server = raindropServer({ roots: [collection(5, "Reading")] });
  const client = createClient({ token: "t", fetch: server.fetch });

  await assert.rejects(
    () => resolveCollections(client, COLLECTION_NAMES),
    (error) => {
      assert.ok(error instanceof RaindropError);
      assert.match(error.message, /"Publish\/Tools" not found/);
      assert.match(error.message, /Reading/);
      return true;
    },
  );
});

test("resolveCollections: Publish/Reading missing is named on its own", async () => {
  const server = raindropServer({
    roots: [collection(41, "Publish/Tools"), collection(42, "Publish/Sites")],
  });
  const client = createClient({ token: "t", fetch: server.fetch });

  await assert.rejects(
    () => resolveCollections(client, COLLECTION_NAMES),
    (error) => {
      assert.ok(error instanceof RaindropError);
      assert.match(error.message, /"Publish\/Reading" not found/);
      return true;
    },
  );
});

/* ---------------------------------------------------------------------------
   Slugs
   --------------------------------------------------------------------------- */

test("uniqueSlug: falls through to -2, -3 rather than overwriting a page", () => {
  assert.equal(uniqueSlug("save-design", new Set()), "save-design");
  assert.equal(uniqueSlug("save-design", new Set(["save-design"])), "save-design-2");
  assert.equal(
    uniqueSlug("save-design", new Set(["save-design", "save-design-2"])),
    "save-design-3",
  );
});

/* ---------------------------------------------------------------------------
   Refusing to do anything
   --------------------------------------------------------------------------- */

test("no token is one clear line and exit 1", async (t) => {
  const { paths } = await makeRepo(t);
  const out = recorder();

  const code = await run([], { env: {}, paths, log: out.log, errorLog: out.errorLog });

  assert.equal(code, 1);
  assert.equal(out.err.length, 1);
  assert.match(out.err[0], /RAINDROP_TOKEN is not set/);
  assert.deepEqual(out.out, [], "nothing is logged, so nothing looks like it ran");
});

test("a rejected token is an infrastructure failure, not an empty run", async (t) => {
  const { paths } = await makeRepo(t);
  const out = recorder();

  const code = await run([], {
    env: { RAINDROP_TOKEN: "not-a-token" },
    paths,
    fetch: async () => new Response("Unauthorized", { status: 401 }),
    log: out.log,
    errorLog: out.errorLog,
  });

  assert.equal(code, 1);
  assert.match(out.err[0], /rejected RAINDROP_TOKEN/);
  assert.equal(out.out.some((line) => line.startsWith("published=")), false);
});
