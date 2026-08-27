/**
 * Whole runs, against a temp directory and a `fetch` that answers from a
 * literal. Nothing is monkey-patched: `run()` takes its dependencies as an
 * argument, so a test simply passes different ones.
 *
 * The crash tests are the reason the phase split exists. Each one reconstructs
 * on disk exactly what a process death would have left behind, then asserts
 * that an ordinary run converges — no repair command, no manual step.
 */

import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  FAKE_PALETTE,
  FIRECRAWL_PALETTE,
  NESTED,
  READING_ID,
  SITES_ID,
  TOOLS_ID,
  bookmark,
  deps,
  exists,
  fakeCapture,
  fakeFirecrawl,
  fakeFirecrawlShot,
  makeRepo,
  raindropServer,
  readJson,
  recorder,
} from "./fixtures.mjs";
import { run } from "./publish.mjs";
import { MAX_ATTEMPTS, loadState } from "./state.mjs";

test("publishes a site, moves its shot, records state, tags the bookmark", async (t) => {
  const { paths } = await makeRepo(t);
  const server = raindropServer({
    ...NESTED,
    raindrops: {
      [SITES_ID]: [bookmark(200, "https://otherkind.design", { title: "Otherkind" })],
      [TOOLS_ID]: [bookmark(201, "https://linear.app", { title: "Linear", excerpt: "Issue tracker." })],
    },
  });
  const capture = fakeCapture();
  const out = recorder();

  assert.equal(await run([], deps({ paths, server, capture, out })), 0);

  const [site] = await readJson(paths.sitesJson);
  assert.equal(site.slug, "otherkind");
  assert.equal(site.domain, "otherkind.design", "domain comes from the URL, not from Raindrop");
  assert.equal(site.saved_date, "2026-08-26");
  assert.equal(site.shot, "/shots/otherkind.webp");
  assert.deepEqual(site.palette, FAKE_PALETTE, "the capture's colours reach the entry");
  assert.ok(await exists(path.join(paths.shotsDir, "otherkind.webp")));

  // The /tools contract: new saves land as `watching`, dated today.
  const [tool] = await readJson(paths.toolsJson);
  assert.equal(tool.verdict, "watching");
  assert.equal(tool.status_date, "2026-08-26");
  assert.equal(tool.note, "Issue tracker.");
  assert.equal(capture.calls.length, 1, "tools are a link with a verdict, not a picture");

  assert.deepEqual((await loadState(paths))["200"], {
    kind: "published",
    slug: "otherkind",
    section: "sites",
    at: "2026-08-26T10:00:00.000Z",
  });
  assert.equal(server.tagCalls("published").length, 2);
  assert.equal(out.summary, "published=2 failed=0 skipped=0 pending=0");
});

test("the tags on a saved site become its collections", async (t) => {
  const { paths } = await makeRepo(t);
  const server = raindropServer({
    ...NESTED,
    raindrops: {
      // `published` is on the bookmark already — hand-typed, or left by a run
      // whose state row never landed. Tags are not how this pipeline dedupes,
      // so it publishes anyway, and the tag must not survive as a collection.
      [SITES_ID]: [
        bookmark(200, "https://bychudy.com", {
          title: "bychudy",
          tags: ["Personal Sites", "portfolios", "published"],
        }),
      ],
      [TOOLS_ID]: [bookmark(201, "https://linear.app", { title: "Linear", tags: ["Portfolios"] })],
    },
  });
  const out = recorder();

  assert.equal(await run([], deps({ paths, server, out })), 0);

  const [site] = await readJson(paths.sitesJson);
  assert.deepEqual(site.collections, ["personal-sites", "portfolios"], "slugified, sorted, deduped");

  const [tool] = await readJson(paths.toolsJson);
  assert.equal(tool.collections, undefined, "collections are a /sites field only");
});

test("a site saved with no tags gets an empty collections list, not a missing one", async (t) => {
  const { paths } = await makeRepo(t);
  const server = raindropServer({
    ...NESTED,
    raindrops: {
      [SITES_ID]: [bookmark(200, "https://otherkind.design", { title: "Otherkind" })],
    },
  });
  const out = recorder();

  assert.equal(await run([], deps({ paths, server, out })), 0);

  const [site] = await readJson(paths.sitesJson);
  assert.deepEqual(site.collections, [], "the field is always written, so the shape never varies");
});

test("a tool with no excerpt still gets a note the build will accept", async (t) => {
  const { paths } = await makeRepo(t);
  const server = raindropServer({
    ...NESTED,
    raindrops: { [TOOLS_ID]: [bookmark(210, "https://buzz.example", { title: "Buzz" })] },
  });
  const out = recorder();

  await run([], deps({ paths, server, out }));

  const [tool] = await readJson(paths.toolsJson);
  assert.notEqual(tool.note, "");
  assert.notEqual(tool.category, "");
});

test("a reading save is published without opening a browser", async (t) => {
  const { paths } = await makeRepo(t);
  const server = raindropServer({
    ...NESTED,
    raindrops: {
      [READING_ID]: [
        bookmark(600, "https://gumclaw.github.io/how-i-work/", {
          title: "How Gumclaw Works",
          excerpt: "A durable agent setup, written up in public.",
        }),
      ],
    },
  });
  const capture = fakeCapture();
  const out = recorder();

  assert.equal(await run([], deps({ paths, server, capture, out })), 0);

  assert.equal(capture.calls.length, 0, "a reading row is metadata, not a picture");
  assert.deepEqual(await readJson(paths.libraryJson), [
    {
      slug: "how-gumclaw-works",
      title: "How Gumclaw Works",
      url: "https://gumclaw.github.io/how-i-work/",
      domain: "gumclaw.github.io",
      saved_date: "2026-08-26",
      kind: "article",
      note: "A durable agent setup, written up in public.",
    },
  ]);

  assert.deepEqual((await loadState(paths))["600"], {
    kind: "published",
    slug: "how-gumclaw-works",
    section: "reading",
    at: "2026-08-26T10:00:00.000Z",
  });
  assert.equal(server.tagCalls("published").length, 1);
  assert.equal(out.summary, "published=1 failed=0 skipped=0 pending=0");
});

test("a tweet saved to reading is published; the same tweet to sites is not", async (t) => {
  const { paths } = await makeRepo(t);
  const tweet = "https://x.com/benln/status/2006057848430604705";
  const server = raindropServer({
    ...NESTED,
    raindrops: {
      [READING_ID]: [bookmark(700, tweet, { title: "A post from @benln" })],
      [SITES_ID]: [bookmark(701, tweet, { title: "The same post" })],
    },
  });
  const capture = fakeCapture();
  const out = recorder();

  assert.equal(await run([], deps({ paths, server, capture, out })), 0);

  const [entry] = await readJson(paths.libraryJson);
  assert.equal(entry.kind, "post", "derived from the host, not from the collection");
  assert.equal(entry.domain, "x.com");
  assert.deepEqual(await readJson(paths.sitesJson), [], "the screenshot rule still holds there");

  assert.equal(capture.calls.length, 0);
  assert.equal((await loadState(paths))["701"].kind, "failed");
  assert.equal(out.summary, "published=1 failed=1 skipped=0 pending=0");
});

test("a reading save with no excerpt gets a null note, not a stand-in", async (t) => {
  const { paths } = await makeRepo(t);
  const server = raindropServer({
    ...NESTED,
    raindrops: {
      [READING_ID]: [
        bookmark(800, "https://www.youtube.com/watch?v=vJEy3nP2_C8", { title: "Managing AI Agents" }),
      ],
    },
  });
  const out = recorder();

  await run([], deps({ paths, server, out }));

  const [entry] = await readJson(paths.libraryJson);
  assert.equal(entry.note, null, "/tools needs a fallback sentence; a reading row does not");
  assert.equal(entry.kind, "video");
});

test("a second run with nothing new publishes nothing", async (t) => {
  const { paths } = await makeRepo(t);
  const server = raindropServer({
    ...NESTED,
    raindrops: { [SITES_ID]: [bookmark(200, "https://otherkind.design", { title: "Otherkind" })] },
  });
  const out = recorder();

  await run([], deps({ paths, server, out }));
  const second = fakeCapture();
  await run([], deps({ paths, server, capture: second, out }));

  assert.equal(second.calls.length, 0);
  assert.equal(out.summary, "published=0 failed=0 skipped=1 pending=0");
});

test("a title that collides with an existing entry gets a suffixed slug", async (t) => {
  const seeded = {
    slug: "save-design",
    title: "Save.design",
    url: "https://save.design",
    domain: "save.design",
    saved_date: "2026-08-01",
    shot: "/shots/save-design.webp",
    palette: ["#111111"],
  };
  const { paths } = await makeRepo(t, { sites: [seeded], shots: ["save-design.webp"] });

  const server = raindropServer({
    ...NESTED,
    raindrops: {
      [SITES_ID]: [bookmark(101, "https://save.design/explore", { title: "Save.design" })],
    },
  });
  const out = recorder();

  assert.equal(await run([], deps({ paths, server, out })), 0);

  const sites = await readJson(paths.sitesJson);
  assert.deepEqual(
    sites.map((/** @type {Record<string, unknown>} */ entry) => entry["slug"]),
    ["save-design", "save-design-2"],
  );
  assert.equal(sites[1].shot, "/shots/save-design-2.webp");
});

/* ---------------------------------------------------------------------------
   Failure paths
   --------------------------------------------------------------------------- */

test("the retry cap dead-letters the bookmark and tags it failed", async (t) => {
  const { paths } = await makeRepo(t, {
    state: { 300: { kind: "pending", attempts: MAX_ATTEMPTS, lastError: "timed out" } },
  });
  const server = raindropServer({
    ...NESTED,
    raindrops: { [SITES_ID]: [bookmark(300, "https://fortress.example", { title: "Fortress" })] },
  });
  const capture = fakeCapture();
  const out = recorder();

  assert.equal(await run([], deps({ paths, server, capture, out })), 0);

  assert.equal(capture.calls.length, 0, "a dead-lettered item never reaches the browser");
  assert.equal(server.tagCalls("failed").length, 1);

  const state = await loadState(paths);
  assert.equal(state["300"].kind, "failed");
  assert.equal(state["300"].lastError, "timed out");
  assert.equal(out.summary, "published=0 failed=1 skipped=0 pending=0");
});

test("a capture failure costs one attempt and leaves the gallery untouched", async (t) => {
  const { paths } = await makeRepo(t);
  const server = raindropServer({
    ...NESTED,
    raindrops: { [SITES_ID]: [bookmark(400, "https://blocked.example", { title: "Blocked" })] },
  });
  const out = recorder();

  const code = await run(
    [],
    deps({ paths, server, capture: fakeCapture({ fail: "bot-blocked" }), out }),
  );

  assert.equal(code, 0, "a bookmark that will not shoot is data, not a broken run");
  assert.deepEqual(await readJson(paths.sitesJson), []);
  assert.deepEqual((await loadState(paths))["400"], {
    kind: "pending",
    attempts: 1,
    lastError: "bot-blocked",
  });
  assert.equal(server.tagCalls("failed").length, 0, "one bad attempt is not a verdict");
  assert.equal(out.summary, "published=0 failed=0 skipped=0 pending=1");
});

test("a page too tall to shoot whole still publishes, and says so in the run log", async (t) => {
  const { paths } = await makeRepo(t);
  const server = raindropServer({
    ...NESTED,
    raindrops: { [SITES_ID]: [bookmark(500, "https://chester.how", { title: "Chester" })] },
  });
  const out = recorder();

  await run([], deps({ paths, server, capture: fakeCapture({ clipped: true }), out }));

  const [site] = await readJson(paths.sitesJson);
  assert.equal(site.shot, "/shots/chester.webp", "a clip is still a publishable shot");

  // And the reason is in the run log rather than on stderr, which only happens
  // if `apply.mjs` hands its own logger down to `captureSite`.
  assert.ok(
    out.out.some((line) => line.includes("chester") && line.includes("clipped")),
    "the clip is explained in the run log",
  );
});

/* ---------------------------------------------------------------------------
   Firecrawl
   --------------------------------------------------------------------------- */

const TWEET = "https://x.com/ephraimakanmu/status/2081234457588056305";

test("a saved post lands with the words in it, not with Raindrop's placeholder", async (t) => {
  const { paths } = await makeRepo(t);
  const server = raindropServer({
    ...NESTED,
    raindrops: {
      [READING_ID]: [
        // With the excerpt Raindrop really does attach to an x.com save: a
        // ragged copy of the same post, which the fetched one has to beat.
        bookmark(900, TWEET, {
          title: "A post from @ephraimakanmu",
          excerpt: "Been rebuilding the Diadem brand archive\n\nfor three weeks and",
        }),
        bookmark(901, "https://gumclaw.github.io/how-i-work/", {
          title: "How Gumclaw Works",
          excerpt: "A durable agent setup, written up in public.",
        }),
      ],
    },
  });
  const firecrawl = fakeFirecrawl();
  const out = recorder();

  assert.equal(await run([], deps({ paths, server, firecrawl: firecrawl.client, out })), 0);

  const [post, article] = await readJson(paths.libraryJson);

  assert.equal(
    post.title,
    "Been rebuilding the Diadem brand archive for three weeks and the thing nobody…",
    "the title is what the post says",
  );
  assert.match(post.note, /^@EphraimAkanmu: Been rebuilding/, "and the note says whose it was");
  assert.equal(post.kind, "post");
  assert.equal(post.url, TWEET, "the link is untouched");

  assert.deepEqual(firecrawl.calls.scraped, [TWEET], "only a post is worth asking about");
  assert.equal(article.title, "How Gumclaw Works", "an article already has a title");
  assert.equal(out.summary, "published=2 failed=0 skipped=0 pending=0");
});

test("markdown that is not a post leaves the row exactly as it was", async (t) => {
  // x.com behind a login wall is the ordinary shape of this failure: Firecrawl
  // answers, the answer is a sign-in page, and there is nothing in it to use.
  const { paths } = await makeRepo(t);
  const server = raindropServer({
    ...NESTED,
    raindrops: { [READING_ID]: [bookmark(900, TWEET, { title: "A post from @ephraimakanmu" })] },
  });
  const firecrawl = fakeFirecrawl({ markdown: "# Sign in to X\n\nSomething went wrong." });
  const out = recorder();

  assert.equal(await run([], deps({ paths, server, firecrawl: firecrawl.client, out })), 0);

  const [entry] = await readJson(paths.libraryJson);
  assert.equal(entry.title, "A post from @ephraimakanmu");
  assert.equal(entry.note, null);
  assert.ok(
    out.out.some((line) => line.includes("found no post in it")),
    "an answer with no post in it reads differently in the log than no answer at all",
  );
  assert.equal(out.summary, "published=1 failed=0 skipped=0 pending=0");
});

test("a Firecrawl outage costs a warning line and nothing else", async (t) => {
  const { paths } = await makeRepo(t);
  const server = raindropServer({
    ...NESTED,
    raindrops: { [READING_ID]: [bookmark(900, TWEET, { title: "A post from @ephraimakanmu" })] },
  });
  const out = recorder();

  const code = await run(
    [],
    deps({ paths, server, firecrawl: fakeFirecrawl({ failScrape: "HTTP 429" }).client, out }),
  );

  assert.equal(code, 0, "the enrichment is a nicety; the row publishes without it");
  assert.equal((await readJson(paths.libraryJson))[0].title, "A post from @ephraimakanmu");
  assert.equal((await loadState(paths))["900"].kind, "published", "never an attempt, never a strike");
  assert.ok(out.out.some((line) => line.startsWith("warn: firecrawl")));
});

test("with no key in the environment nothing is asked of anyone", async (t) => {
  // The default `deps()` goes through the real `firecrawlFrom()` against a test
  // environment holding only RAINDROP_TOKEN — which is the local case exactly.
  const { paths } = await makeRepo(t);
  const server = raindropServer({
    ...NESTED,
    raindrops: { [READING_ID]: [bookmark(900, TWEET, { title: "A post from @ephraimakanmu" })] },
  });
  const out = recorder();

  assert.equal(await run([], deps({ paths, server, out })), 0);

  assert.equal((await readJson(paths.libraryJson))[0].title, "A post from @ephraimakanmu");
  assert.equal(
    out.out.some((line) => line.startsWith("warn: firecrawl") || line.includes("found no post")),
    false,
    "nothing was attempted, so there is nothing to report about it failing",
  );
  // But the run does say so, once. A missing or misspelt secret disables both
  // enrichments silently by design, and in CI the only other symptom would be
  // posts that quietly stopped getting titles.
  assert.ok(
    out.out.includes("firecrawl: no FIRECRAWL_API_KEY — posts unread, blocked shots not retried"),
  );
});

test("a site that beats the browser on its last try is caught by Firecrawl", async (t) => {
  // Two attempts already spent, so this run is the one before the dead letter.
  const { paths } = await makeRepo(t, {
    state: { 400: { kind: "pending", attempts: 2, lastError: "bot-blocked" } },
  });
  const server = raindropServer({
    ...NESTED,
    raindrops: { [SITES_ID]: [bookmark(400, "https://fortress.example", { title: "Fortress" })] },
  });
  const fallback = fakeFirecrawlShot();
  const firecrawl = fakeFirecrawl();
  const out = recorder();

  const code = await run(
    [],
    deps({
      paths,
      server,
      capture: fakeCapture({ fail: "bot-blocked" }),
      fallback,
      firecrawl: firecrawl.client,
      out,
    }),
  );

  assert.equal(code, 0);
  assert.deepEqual(
    fallback.calls.map((call) => call.url),
    ["https://fortress.example"],
  );
  // The chain publish.mjs is the only place that builds: env → client → bound
  // capturer → the API actually being asked. Without this the binding could be
  // deleted and the suite would not notice.
  assert.deepEqual(firecrawl.calls.shot, ["https://fortress.example"]);

  const [site] = await readJson(paths.sitesJson);
  assert.deepEqual(site.palette, FIRECRAWL_PALETTE, "a fallback shot goes through the same path");
  assert.equal(site.shot, "/shots/fortress.webp");
  assert.equal("via" in site, false, "who took the picture is not the reader's business");
  assert.ok(await exists(path.join(paths.shotsDir, "fortress.webp")));

  assert.deepEqual((await loadState(paths))["400"], {
    kind: "published",
    slug: "fortress",
    section: "sites",
    at: "2026-08-26T10:00:00.000Z",
    via: "firecrawl",
  });
  assert.equal(server.tagCalls("published").length, 1);
  assert.equal(out.summary, "published=1 failed=0 skipped=0 pending=0");
});

test("the second chance is not spent while free retries remain", async (t) => {
  const { paths } = await makeRepo(t);
  const server = raindropServer({
    ...NESTED,
    raindrops: { [SITES_ID]: [bookmark(400, "https://fortress.example", { title: "Fortress" })] },
  });
  const fallback = fakeFirecrawlShot();
  const firecrawl = fakeFirecrawl();
  const out = recorder();

  await run(
    [],
    deps({
      paths,
      server,
      capture: fakeCapture({ fail: "bot-blocked" }),
      fallback,
      firecrawl: firecrawl.client,
      out,
    }),
  );

  assert.equal(fallback.calls.length, 0, "most capture failures are a slow page, not a wall");
  assert.deepEqual(firecrawl.calls.shot, [], "and no credit is spent finding that out");
  assert.deepEqual((await loadState(paths))["400"], {
    kind: "pending",
    attempts: 1,
    lastError: "bot-blocked",
  });
  assert.equal(out.summary, "published=0 failed=0 skipped=0 pending=1");
});

test("when Firecrawl cannot shoot it either, the third strike lands as normal", async (t) => {
  const { paths } = await makeRepo(t, {
    state: { 400: { kind: "pending", attempts: 2, lastError: "bot-blocked" } },
  });
  const server = raindropServer({
    ...NESTED,
    raindrops: { [SITES_ID]: [bookmark(400, "https://fortress.example", { title: "Fortress" })] },
  });
  const out = recorder();

  const code = await run(
    [],
    deps({
      paths,
      server,
      capture: fakeCapture({ fail: "bot-blocked" }),
      // The failure comes out of the client, the way a real one would, rather
      // than out of a capturer that never asked it anything.
      firecrawl: fakeFirecrawl({ failShot: "Firecrawl returned no screenshot" }).client,
      out,
    }),
  );

  assert.equal(code, 0);
  assert.deepEqual(await readJson(paths.sitesJson), []);
  assert.deepEqual((await loadState(paths))["400"], {
    kind: "pending",
    attempts: 3,
    lastError: "bot-blocked",
  });
  assert.ok(
    out.out.some((line) => line.includes("firecrawl could not shoot fortress")),
    "the fallback's own reason is a footnote in the log, not the state row",
  );
  assert.equal(out.summary, "published=0 failed=0 skipped=0 pending=1");

  // And the run after this one is the dead letter, unchanged by any of it.
  const next = recorder();
  await run([], deps({ paths, server, capture: fakeCapture({ fail: "bot-blocked" }), out: next }));

  assert.equal((await loadState(paths))["400"].kind, "failed");
  assert.equal(server.tagCalls("failed").length, 1);
});

test("a dry run decides the second chance without spending a credit on it", async (t) => {
  // The design constraint stated in `shootSite`, asserted rather than trusted:
  // a run that writes nothing must also buy nothing.
  const { paths } = await makeRepo(t, {
    state: { 400: { kind: "pending", attempts: 2, lastError: "bot-blocked" } },
  });
  const server = raindropServer({
    ...NESTED,
    raindrops: {
      [SITES_ID]: [bookmark(400, "https://fortress.example", { title: "Fortress" })],
      [READING_ID]: [bookmark(900, TWEET, { title: "A post from @ephraimakanmu" })],
    },
  });
  const firecrawl = fakeFirecrawl();
  const out = recorder();

  assert.equal(
    await run(["--dry-run"], deps({ paths, server, firecrawl: firecrawl.client, out })),
    0,
  );

  assert.deepEqual(firecrawl.calls, { scraped: [], shot: [] });
});

/* ---------------------------------------------------------------------------
   Crashes
   --------------------------------------------------------------------------- */

test("converges after a crash between the shot move and the JSON append", async (t) => {
  // The image made it to public/shots; the gallery never saw the entry.
  const { paths } = await makeRepo(t, { shots: ["otherkind.webp"] });
  const server = raindropServer({
    ...NESTED,
    raindrops: { [SITES_ID]: [bookmark(200, "https://otherkind.design", { title: "Otherkind" })] },
  });
  const capture = fakeCapture();
  const out = recorder();

  assert.equal(await run([], deps({ paths, server, capture, out })), 0);

  assert.equal(capture.calls.length, 1, "swept, then re-shot — never silently reused");
  assert.equal((await readJson(paths.sitesJson))[0].slug, "otherkind");
  assert.equal((await loadState(paths))["200"].kind, "published");
  assert.equal(out.summary, "published=1 failed=0 skipped=0 pending=0");
});

test("converges after a crash between the JSON append and the state row", async (t) => {
  const entry = {
    slug: "otherkind",
    title: "Otherkind",
    url: "https://otherkind.design",
    domain: "otherkind.design",
    saved_date: "2026-08-26",
    shot: "/shots/otherkind.webp",
    palette: ["#0a0a0a", "#fafafa"],
  };
  const { paths } = await makeRepo(t, { sites: [entry], shots: ["otherkind.webp"] });
  const server = raindropServer({
    ...NESTED,
    raindrops: { [SITES_ID]: [bookmark(200, "https://otherkind.design", { title: "Otherkind" })] },
  });
  const capture = fakeCapture();
  const out = recorder();

  assert.equal(await run([], deps({ paths, server, capture, out })), 0);

  assert.equal(capture.calls.length, 0, "the work was already done");
  assert.equal((await readJson(paths.sitesJson)).length, 1, "no duplicate entry");
  assert.equal((await loadState(paths))["200"].kind, "published");
  assert.equal(server.tagCalls("published").length, 1, "the missing tag is written too");
  assert.equal(out.summary, "published=0 failed=0 skipped=1 pending=0");
});

test("a temp directory left by a crash is wiped before work starts", async (t) => {
  const { paths } = await makeRepo(t);
  await mkdir(path.join(paths.tmpDir, "999"), { recursive: true });
  await writeFile(path.join(paths.tmpDir, "999", "half-a-shot.webp"), "torn");

  const out = recorder();
  assert.equal(await run([], deps({ paths, server: raindropServer(NESTED), out })), 0);
  assert.equal(await exists(path.join(paths.tmpDir, "999", "half-a-shot.webp")), false);
});

/* ---------------------------------------------------------------------------
   The CLI
   --------------------------------------------------------------------------- */

test("--dry-run decides everything and writes nothing", async (t) => {
  const { paths } = await makeRepo(t, { shots: ["ghost.webp"] });
  const server = raindropServer({
    ...NESTED,
    raindrops: {
      [SITES_ID]: [bookmark(200, "https://otherkind.design", { title: "Otherkind" })],
      [TOOLS_ID]: [bookmark(201, "https://x.com/someone/status/1", { title: "A tweet" })],
    },
  });
  const capture = fakeCapture();
  const out = recorder();

  assert.equal(await run(["--dry-run"], deps({ paths, server, capture, out })), 0);

  assert.equal(capture.calls.length, 0);
  assert.deepEqual(await readJson(paths.sitesJson), []);
  assert.deepEqual(await readJson(paths.statePath), {});
  assert.ok(await exists(path.join(paths.shotsDir, "ghost.webp")), "the orphan survives");
  assert.equal(server.calls.filter((call) => call.method === "PUT").length, 0);
  assert.equal(out.summary, "published=1 failed=1 skipped=0 pending=0");
});

test("an unknown flag is a usage error, not a silent no-op", async (t) => {
  const { paths } = await makeRepo(t);
  const out = recorder();

  const code = await run(["--dryrun"], {
    env: { RAINDROP_TOKEN: "t" },
    paths,
    log: out.log,
    errorLog: out.errorLog,
  });

  assert.equal(code, 2);
  assert.match(out.err[0], /unknown argument "--dryrun"/);
});
