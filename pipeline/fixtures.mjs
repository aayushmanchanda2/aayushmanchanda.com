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
  await writeFile(paths.readingJson, JSON.stringify(reading, null, 2));
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
 * @param {string[]} [extra.tags]
 */
export function bookmark(id, link, { title = "", excerpt = "", tags = [] } = {}) {
  return { _id: id, link, title, excerpt, tags, domain: new URL(link).hostname };
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

/**
 * The `deps` bag for a test run: a fake API, a fake browser, a fixed clock, and
 * a commit that does nothing (git is CI's concern, not this suite's).
 *
 * @param {object} wiring
 * @param {import("./types.js").Paths} wiring.paths
 * @param {ReturnType<typeof raindropServer>} wiring.server
 * @param {ReturnType<typeof fakeCapture>} [wiring.capture]
 * @param {ReturnType<typeof recorder>} wiring.out
 */
export function deps({ paths, server, capture = fakeCapture(), out }) {
  return {
    fetch: server.fetch,
    captureSite: capture.captureSite,
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
