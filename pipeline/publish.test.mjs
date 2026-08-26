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

import { uniqueSlug } from "./entries.mjs";
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
 * @param {{ title?: string, excerpt?: string, tags?: string[] }} [extra]
 * @returns {import("./types.js").Bookmark}
 */
function mark(id, url, section, extra = {}) {
  return {
    id,
    url,
    title: extra.title ?? "",
    excerpt: extra.excerpt ?? "",
    domain: "",
    collection: section,
    tags: extra.tags ?? [],
  };
}

const EMPTY = { sites: [], tools: [] };

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

test("isTweetHost: subdomains count, lookalikes do not", () => {
  assert.equal(isTweetHost("https://x.com/a/status/1"), true);
  assert.equal(isTweetHost("https://www.twitter.com/a"), true);
  assert.equal(isTweetHost("https://mobile.twitter.com/a"), true);
  assert.equal(isTweetHost("https://x.company/a"), false);
  assert.equal(isTweetHost("https://notx.com/a"), false);
  assert.equal(isTweetHost("not a url"), false);
});

test("plan: a link the gallery already holds is adopted, not re-published", () => {
  const gallery = { sites: [{ slug: "linear", url: "https://linear.app/" }], tools: [] };
  // The same link, spelled differently: www, no trailing slash.
  const { work } = plan({ bookmarks: [mark("9", "https://www.linear.app", "sites")], state: {}, gallery });

  assert.equal(work[0].kind, "adopt");
  assert.equal(work[0].slug, "linear");
});

test("plan: the same URL in the other gallery is not a match", () => {
  const gallery = { sites: [{ slug: "linear", url: "https://linear.app" }], tools: [] };
  const { work } = plan({ bookmarks: [mark("9", "https://linear.app", "tools")], state: {}, gallery });

  assert.equal(work[0].kind, "capture", "a site and a tool are different pages");
});

/* ---------------------------------------------------------------------------
   Collections, resolved by name
   --------------------------------------------------------------------------- */

test("resolveCollections: finds Tools and Sites nested under a Publish parent", async () => {
  const server = raindropServer(NESTED);
  const ids = await resolveCollections(
    createClient({ token: "t", fetch: server.fetch }),
    COLLECTION_NAMES,
  );
  assert.deepEqual(ids, { tools: 11, sites: 12 });
});

test("resolveCollections: finds collections literally titled 'Publish/Tools'", async () => {
  const server = raindropServer({
    roots: [collection(31, "publish / tools"), collection(32, "Publish/Sites")],
  });
  const ids = await resolveCollections(
    createClient({ token: "t", fetch: server.fetch }),
    COLLECTION_NAMES,
  );
  assert.deepEqual(ids, { tools: 31, sites: 32 }, "case and spacing are not the user's problem");
});

test("resolveCollections: a missing collection names itself and the alternatives", async () => {
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
