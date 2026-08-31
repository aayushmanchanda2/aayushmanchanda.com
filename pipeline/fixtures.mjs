/**
 * fixtures.mjs — scaffolding for the pipeline tests.
 *
 * Not a test file (the runner's patterns skip this name deliberately). It
 * builds the two things every test needs: a throwaway repo on disk with the
 * same shape as the real one, and a Raindrop that answers from a literal.
 *
 * Both are plain functions handed in through `run()`'s `deps` parameter. There
 * is no module mocking anywhere in this suite — if a dependency is hard to
 * replace here, that is a design problem in the pipeline, not a testing one.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { firecrawlFrom } from "./firecrawl.mjs";
import { resolvePaths } from "./state.mjs";

/**
 * A temp repo with `src/data`, `public/shots`, and `pipeline/state.json`.
 *
 * @param {import("node:test").TestContext} t
 * @param {object} [seed]
 * @param {unknown[]} [seed.sites]
 * @param {unknown[]} [seed.tools]
 * @param {unknown[]} [seed.reading]
 * @param {Record<string, unknown>} [seed.state]
 * @param {string[]} [seed.shots] Filenames to drop into `public/shots`.
 */
export async function makeRepo(
  t,
  { sites = [], tools = [], reading = [], state = {}, shots = [] } = {},
) {
  const root = await mkdtemp(path.join(tmpdir(), "publish-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const paths = resolvePaths(root);

  await mkdir(path.dirname(paths.sitesJson), { recursive: true });
  await mkdir(paths.shotsDir, { recursive: true });
  await mkdir(path.dirname(paths.statePath), { recursive: true });

  await writeFile(paths.sitesJson, JSON.stringify(sites, null, 2));
  await writeFile(paths.toolsJson, JSON.stringify(tools, null, 2));
  await writeFile(paths.libraryJson, JSON.stringify(reading, null, 2));
  await writeFile(paths.statePath, JSON.stringify(state, null, 2));

  for (const shot of shots) {
    await writeFile(path.join(paths.shotsDir, shot), `pretend-webp:${shot}`);
  }

  return { root, paths };
}

/** @param {string} file @returns {Promise<any>} */
export async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

/** @param {string} file @returns {Promise<boolean>} */
export async function exists(file) {
  try {
    await readFile(file);
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------------------
   Raindrop, in a literal
   --------------------------------------------------------------------------- */

/** @param {number} id @param {string} title @param {number} [parentId] */
export function collection(id, title, parentId) {
  return parentId === undefined ? { _id: id, title } : { _id: id, title, parent: { $id: parentId } };
}

/**
 * @param {number} id
 * @param {string} link
 * @param {object} [extra]
 * @param {string} [extra.title]
 * @param {string} [extra.excerpt]
 * @param {string} [extra.note] Raindrop's PRIVATE note — where a draft blob arrives.
 * @param {string[]} [extra.tags]
 */
export function bookmark(id, link, { title = "", excerpt = "", note = "", tags = [] } = {}) {
  return { _id: id, link, title, excerpt, note, tags, domain: new URL(link).hostname };
}

/** @param {unknown} payload */
function json(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/**
 * A `fetch` that speaks just enough Raindrop, plus the call log the tests
 * assert against (a tag write is an outcome, so it has to be observable).
 *
 * @param {object} wiring
 * @param {unknown[]} [wiring.roots]
 * @param {unknown[]} [wiring.children]
 * @param {Record<string, unknown[]>} [wiring.raindrops] Collection id to items.
 */
export function raindropServer({ roots = [], children = [], raindrops = {} } = {}) {
  /** @type {{ method: string, path: string, body?: any }[]} */
  const calls = [];

  /** @type {typeof globalThis.fetch} */
  const fetch = async (input, init = {}) => {
    const url = new URL(String(input));

    // A fixture that answers 404 to a host it has never heard of is a fixture
    // that lies. Throwing means any test which accidentally reaches a real
    // service — Firecrawl, most plausibly — fails saying so, instead of quietly
    // taking the "that call failed, carry on" branch and looking like a pass.
    if (url.hostname !== "api.raindrop.io") {
      throw new Error(`the test raindrop was asked for ${url.hostname}`);
    }

    const route = url.pathname.replace("/rest/v1", "");
    const method = init.method ?? "GET";
    calls.push({
      method,
      path: route,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    });

    if (route === "/collections") return json({ result: true, items: roots });
    if (route === "/collections/childrens") return json({ result: true, items: children });

    const list = route.match(/^\/raindrops\/(\d+)$/);
    if (list !== null && method === "GET") {
      // Page 0 carries everything; the fixtures never approach a real page.
      const page = Number(url.searchParams.get("page") ?? "0");
      return json({ result: true, items: page === 0 ? (raindrops[list[1]] ?? []) : [] });
    }

    const one = route.match(/^\/raindrop\/(\d+)$/);
    if (one !== null && method === "PUT") return json({ result: true, item: {} });

    return new Response("no route", { status: 404 });
  };

  /** @param {string} tag @returns {{ path: string, body?: any }[]} */
  const tagCalls = (tag) =>
    calls.filter((call) => call.method === "PUT" && call.body?.tags?.includes(tag));

  return { fetch, calls, tagCalls };
}

/** What `fakeCapture` reports when a test does not ask for something else. */
export const FAKE_PALETTE = ["#1c1c1e", "#f5f3ef", "#3b6cf6"];

/**
 * A stand-in for `captureSite` that writes a plausible file and records what it
 * was asked to shoot — so "never called" is a thing a test can assert.
 *
 * It also honours `log` the way the real one does. That is the only cheap way
 * to check the wiring: a real clip needs a browser and a 12,000px page, but
 * whether `apply.mjs` hands its own logger down so the notice reaches the run
 * log is a question this fixture can answer.
 *
 * @param {object} [options]
 * @param {string[]} [options.palette] Colours to report for the shot.
 * @param {boolean} [options.clipped]  Report the page as too tall to shoot whole.
 * @param {string} [options.fail]      Throw with this message instead of shooting.
 */
export function fakeCapture({ palette = FAKE_PALETTE, clipped = false, fail } = {}) {
  /** @type {{ url: string, slug: string, outDir: string }[]} */
  const calls = [];

  /** @type {typeof import("./capture.mjs").captureSite} */
  async function captureSite({ url, slug, outDir, log = console.warn }) {
    calls.push({ url, slug, outDir: String(outDir) });
    if (fail !== undefined) throw new Error(fail);

    const dir = String(outDir);
    await mkdir(dir, { recursive: true });

    const shot = path.join(dir, `${slug}.webp`);
    await writeFile(shot, `shot:${slug}`);

    if (clipped) {
      // Shaped like the sentence capture.mjs writes, so the assertion in
      // run.test.mjs is about the wiring and not about this fixture's wording.
      log(`capture: ${slug} is 30000px tall, clipped to the first 12000px`);
    }

    return { shot, palette };
  }

  return { calls, captureSite };
}

/**
 * Stand-ins for the two things `thumb.mjs` fetches: a video's poster frame and
 * a post's photos. Both write a plausible file and record what they were asked
 * for.
 *
 * Here rather than left to the real module for the reason the Raindrop fixture
 * throws on an unknown host: `thumb.mjs` reaches i.ytimg.com and
 * pbs.twimg.com, and a suite that quietly hit either would be slow, flaky, and
 * lying about what it proved. The real fetch, the real magic-byte check and the
 * real sharp encode are pinned in `thumb.test.mjs`, where a fake `fetch` can
 * answer with bytes.
 *
 * @param {object} [options]
 * @param {string} [options.fail] Throw with this message instead of writing.
 */
export function fakeThumb({ fail } = {}) {
  /** @type {{ id: string, slug: string, outDir: string }[]} */
  const calls = [];
  /** @type {{ media: readonly string[], slug: string }[]} */
  const mediaCalls = [];

  /** @type {typeof import("./thumb.mjs").captureThumb} */
  async function captureThumb({ video, slug, outDir }) {
    calls.push({ id: video.id, slug, outDir: String(outDir) });
    if (fail !== undefined) throw new Error(fail);

    const dir = String(outDir);
    await mkdir(dir, { recursive: true });

    const thumb = path.join(dir, `${slug}-thumb.webp`);
    await writeFile(thumb, `thumb:${video.id}`);
    return { thumb };
  }

  /** @type {typeof import("./thumb.mjs").captureMedia} */
  async function captureMedia({ media, slug, outDir }) {
    mediaCalls.push({ media, slug });
    if (fail !== undefined) throw new Error(fail);

    const dir = String(outDir);
    await mkdir(dir, { recursive: true });

    /** @type {string[]} */
    const files = [];
    /** @type {string[]} */
    const paths = [];

    for (const [index, url] of media.entries()) {
      const file = path.join(dir, `${slug}-media-${index + 1}.webp`);
      await writeFile(file, `media:${url}`);
      files.push(file);
      paths.push(`/shots/${slug}-media-${index + 1}.webp`);
    }

    return { files, paths };
  }

  return { calls, mediaCalls, captureThumb, captureMedia };
}

/* ---------------------------------------------------------------------------
   Firecrawl, in a literal
   --------------------------------------------------------------------------- */

/**
 * What Firecrawl's `x-twitter` post-processor hands back.
 *
 * Copied from a real response rather than imagined, down to the escaped dates
 * and the unbolded `Author:` line, because every one of those details is
 * something `parsePost` either steps over or trips on. The sections after the
 * post are the part that earns its place here: a saved thread carries ten more
 * posts and a reply under `## Thread` and `## Top Comments`, and a parser that
 * let those through would put a stranger's words in the note.
 *
 * @param {object} [options]
 * @param {string} [options.handle]
 * @param {string} [options.text]
 */
export function postMarkdown({ handle = "EphraimAkanmu", text = POST_TEXT } = {}) {
  return [
    `# Post by @${handle}`,
    "",
    `Author: Diadem @${handle}`,
    "Posted: 2026\\-07\\-26T04:25:36\\.000Z",
    `URL: [https://x\\.com/${handle}/status/2081234457588056305](https://x.com/${handle}/status/2081234457588056305)`,
    "Likes: 636 | Retweets: 78",
    "",
    "## Post",
    "",
    text,
    "",
    "## Thread",
    "",
    "### 1. Thread Post",
    `Author: @${handle}`,
    "",
    "> BEHANCE",
    ">",
    "> Starting with some individual designers whose projects I study.",
    "",
    "Likes: 35 | Retweets: 1",
    "",
    "## Top Comments",
    "",
    "### 1. @Jstmaiking",
    "Author: Maiking",
    "",
    "> Can any one do something like this for web and app designers?",
    "",
  ].join("\n");
}

/** Long enough that both the 80-char title and the 280-char note have to clip. */
export const POST_TEXT =
  "Been rebuilding the Diadem brand archive for three weeks and the thing nobody " +
  "tells you about design systems is that the hard part was never the tokens. It " +
  "is getting everyone to reach for them at the moment they are about to invent a " +
  "ninth shade of grey instead, which is a habit problem wearing a tooling costume.";

/**
 * A stand-in for the Firecrawl client, with the call log the tests assert
 * against — "never asked" is the whole point of the env-absent rule.
 *
 * @param {object} [options]
 * @param {string} [options.markdown]   What `scrapeMarkdown` returns.
 * @param {string} [options.failScrape] Throw with this message instead.
 * @param {string} [options.failShot]   Throw with this message instead.
 */
export function fakeFirecrawl({ markdown = postMarkdown(), failScrape, failShot } = {}) {
  /** @type {{ scraped: string[], shot: string[] }} */
  const calls = { scraped: [], shot: [] };

  const client = {
    /** @param {string} url */
    async scrapeMarkdown(url) {
      calls.scraped.push(url);
      if (failScrape !== undefined) throw new Error(failScrape);
      return markdown;
    },
    /** @param {string} url */
    async screenshotFullPage(url) {
      calls.shot.push(url);
      if (failShot !== undefined) throw new Error(failShot);
      // Never decoded by anything: `fakeFirecrawlShot` writes its own file and
      // the real encode path is tested against real sharp in `capture.test.mjs`.
      return Buffer.from("pretend-png");
    },
  };

  return { calls, client };
}

/* ---------------------------------------------------------------------------
   The wiring every test starts from
   --------------------------------------------------------------------------- */

export const TOOLS_ID = 11;
export const SITES_ID = 12;
export const READING_ID = 13;

/** A root `Publish` collection with the three sections nested underneath. */
export const NESTED = {
  roots: [collection(1, "Publish")],
  children: [
    collection(TOOLS_ID, "Tools", 1),
    collection(SITES_ID, "Sites", 1),
    collection(READING_ID, "Reading", 1),
  ],
};

/** Distinct from `FAKE_PALETTE`, so a test can tell which capturer ran. */
export const FIRECRAWL_PALETTE = ["#8a2be2", "#fffaf0"];

/**
 * A stand-in for `captureWithFirecrawl` — which, unlike `captureSite`, is handed
 * a client.
 *
 * It calls that client rather than ignoring it, and that is the entire reason
 * this exists instead of another `fakeCapture`. `publish.mjs` is the only place
 * the client gets bound to the capturer, and a fake that destructured only
 * `{url, slug, outDir}` would pass every test with that binding deleted — while
 * production threw on `undefined.screenshotFullPage`, got swallowed into a log
 * line by `shootSite`, and disabled the second chance forever without anything
 * going red. Asking the client through this seam is what makes the chain from
 * `deps` to the API a thing the suite can see.
 *
 * @param {object} [options]
 * @param {string[]} [options.palette]
 */
export function fakeFirecrawlShot({ palette = FIRECRAWL_PALETTE } = {}) {
  /** @type {{ url: string, slug: string, outDir: string }[]} */
  const calls = [];

  /** @type {typeof import("./capture.mjs").captureWithFirecrawl} */
  async function captureWithFirecrawl({ url, slug, outDir, client }) {
    if (client === undefined || typeof client.screenshotFullPage !== "function") {
      throw new Error("captureWithFirecrawl was called without a Firecrawl client");
    }
    calls.push({ url, slug, outDir: String(outDir) });

    // The throw a failing client raises is the fallback's failure, and it has
    // to travel exactly as the real one would.
    await client.screenshotFullPage(url);

    const dir = String(outDir);
    await mkdir(dir, { recursive: true });
    const shot = path.join(dir, `${slug}.webp`);
    await writeFile(shot, `firecrawl-shot:${slug}`);

    return { shot, palette };
  }

  return { calls, captureWithFirecrawl };
}

/**
 * The `deps` bag for a test run: a fake API, a fake browser, a fixed clock, and
 * a commit that does nothing (git is CI's concern, not this suite's).
 *
 * `firecrawl` is left out by default on purpose. The default run therefore goes
 * through the real `firecrawlFrom()` against an environment with no key in it,
 * which is exactly the local case — so every test that does not mention
 * Firecrawl is also a test that the feature stays out of the way.
 *
 * @param {object} wiring
 * @param {import("./types.js").Paths} wiring.paths
 * @param {ReturnType<typeof raindropServer>} wiring.server
 * @param {ReturnType<typeof fakeCapture>} [wiring.capture]
 * @param {ReturnType<typeof fakeFirecrawlShot>} [wiring.fallback] The second-chance shot.
 * @param {ReturnType<typeof fakeThumb>} [wiring.thumb] The video poster frame.
 * @param {ReturnType<typeof fakeFirecrawl>["client"]} [wiring.firecrawl]
 * @param {ReturnType<typeof recorder>} wiring.out
 */
export function deps({
  paths,
  server,
  capture = fakeCapture(),
  fallback = fakeFirecrawlShot(),
  thumb = fakeThumb(),
  firecrawl,
  out,
}) {
  return {
    fetch: server.fetch,
    captureSite: capture.captureSite,
    captureWithFirecrawl: fallback.captureWithFirecrawl,
    captureThumb: thumb.captureThumb,
    captureMedia: thumb.captureMedia,
    makeFirecrawl: firecrawl === undefined ? firecrawlFrom : () => firecrawl,
    env: { RAINDROP_TOKEN: "test-token" },
    now: () => new Date("2026-08-26T10:00:00.000Z"),
    log: out.log,
    errorLog: out.errorLog,
    paths,
    commit: async () => false,
  };
}

/** Collects stdout/stderr lines so the summary contract can be asserted. */
export function recorder() {
  /** @type {string[]} */
  const out = [];
  /** @type {string[]} */
  const err = [];
  return {
    out,
    err,
    log: (/** @type {string} */ line) => out.push(line),
    errorLog: (/** @type {string} */ line) => err.push(line),
    get summary() {
      return out.at(-1);
    },
  };
}
