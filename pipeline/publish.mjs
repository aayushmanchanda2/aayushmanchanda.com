/**
 * publish.mjs — save a link on your phone, find it on the site.
 *
 *   RAINDROP_TOKEN=… node pipeline/publish.mjs             # a real run (CI's job)
 *   RAINDROP_TOKEN=… node pipeline/publish.mjs --dry-run   # decide, write nothing
 *
 * Three phases, and the split is the whole design:
 *
 *   reconcile — make local truth agree with itself before anything external
 *               happens (state.mjs)
 *   plan      — read the three Raindrop collections, diff them against state,
 *               and decide exactly one thing to do about every bookmark (below)
 *   apply     — do that one thing, in an order where every crash point is
 *               repairable by the next reconcile (apply.mjs)
 *
 * Exit 0 unless the infrastructure failed: a missing token, a missing
 * collection, an unreachable API. A bookmark that will not screenshot is data,
 * not an error — the run reports it in the summary rather than going red.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { applyItem } from "./apply.mjs";
import { captureSite } from "./capture.mjs";
import { POST_HOSTS, hostIsOneOf, readEntries, urlKey } from "./entries.mjs";
import { RaindropError, createClient, fetchBookmarks, resolveCollections } from "./raindrop.mjs";
import { MAX_ATTEMPTS, SECTIONS, reconcile, resolvePaths } from "./state.mjs";
import { describe } from "./util.mjs";

/** @typedef {import("./types.js").Bookmark} Bookmark */
/** @typedef {import("./types.js").Paths} Paths */
/** @typedef {import("./types.js").PlannedItem} PlannedItem */
/** @typedef {import("./types.js").Section} Section */
/** @typedef {import("./types.js").StateMap} StateMap */
/** @typedef {import("./types.js").Summary} Summary */

/**
 * The classification IS the collection. No AI sorting, no keyword rules — the
 * share sheet asks which one, and that answer is the whole taxonomy. Resolved
 * by name at run time, so no account-specific id is ever committed, and these
 * three are the only collections the pipeline can see.
 */
export const COLLECTION_NAMES = /** @type {Record<Section, string>} */ ({
  tools: "Publish/Tools",
  sites: "Publish/Sites",
  reading: "Publish/Reading",
});

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Tweets bot-block a headless browser, so a shot would fail three times and
 * dead-letter anyway. Failing on sight skips the pointless retries and says the
 * useful thing instead: save the product, not the post about it.
 *
 * The host test itself lives in `entries.mjs`, next to the other one that asks
 * the same question of a URL. This export stays because the rule is a /sites
 * and /tools rule, not a fact about hostnames, and `plan()` reads better saying
 * what it means.
 *
 * @param {string} url @returns {boolean}
 */
export function isTweetHost(url) {
  return hostIsOneOf(url, POST_HOSTS);
}

/* ---------------------------------------------------------------------------
   plan
   --------------------------------------------------------------------------- */

/**
 * One decision per bookmark, and no I/O — which is what makes the interesting
 * cases (dedupe, the retry cap, the x.com short-circuit) testable as data.
 *
 * @param {object} input
 * @param {readonly Bookmark[]} input.bookmarks
 * @param {StateMap} input.state
 * @param {Record<Section, Record<string, unknown>[]>} input.gallery
 * @returns {{ work: PlannedItem[], skipped: number }}
 */
export function plan({ bookmarks, state, gallery }) {
  /** @type {Record<Section, Map<string, string>>} */
  const byUrl = { sites: new Map(), tools: new Map(), reading: new Map() };

  for (const section of SECTIONS) {
    for (const entry of gallery[section]) {
      const url = entry["url"];
      if (typeof url === "string") byUrl[section].set(urlKey(url), String(entry["slug"]));
    }
  }

  /** @type {PlannedItem[]} */
  const work = [];
  let skipped = 0;

  for (const bookmark of bookmarks) {
    const current = state[bookmark.id];

    // Dedupe. `published` and `failed` are settled; only `pending` and an
    // unseen id are still open questions.
    if (current !== undefined && (current.kind === "published" || current.kind === "failed")) {
      skipped += 1;
      continue;
    }

    // The gallery already holds this link — a hand-seeded entry, or a run that
    // crashed after the append and before the state row. Either way the work is
    // done and only the bookkeeping is missing.
    const existing = byUrl[bookmark.collection].get(urlKey(bookmark.url));
    if (existing !== undefined) {
      work.push({ kind: "adopt", bookmark, slug: existing });
      continue;
    }

    // The x.com rule is a rule about screenshots, so it stops at the section
    // that takes them. /sites cannot shoot a tweet and /tools would file one as
    // a product it is not; /reading only ever wanted the link, and a saved post
    // is a first-class row there rather than a capture that is going to fail.
    // Rejecting one here would make the section unable to hold the single
    // commonest thing Aayush saves.
    if (bookmark.collection !== "reading" && isTweetHost(bookmark.url)) {
      work.push({
        kind: "reject",
        bookmark,
        reason:
          "x.com and twitter.com block headless capture — save the product's URL, not the tweet",
      });
      continue;
    }

    const attempts = current === undefined ? 0 : current.attempts;
    if (attempts >= MAX_ATTEMPTS) {
      work.push({
        kind: "dead-letter",
        bookmark,
        attempts,
        lastError: current?.lastError ?? "no error recorded",
      });
      continue;
    }

    work.push({ kind: "capture", bookmark, attempts });
  }

  return { work, skipped };
}

/* ---------------------------------------------------------------------------
   git
   --------------------------------------------------------------------------- */

/** Paths the pipeline may commit. Nothing else is ever staged. */
const COMMITTED = [
  "src/data/sites.json",
  "src/data/tools.json",
  "src/data/reading.json",
  "public/shots",
  "pipeline/state.json",
];

/**
 * One commit per run, and none when nothing moved. Pushing is CI's job.
 * @param {{ paths: Paths, summary: Summary, log: (line: string) => void }} input
 * @returns {Promise<boolean>} Whether a commit was made.
 */
async function gitCommit({ paths, summary, log }) {
  const git = (/** @type {string[]} */ args) =>
    execFileSync("git", args, {
      cwd: paths.root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

  git(["add", "--", ...COMMITTED]);

  const staged = git(["diff", "--cached", "--name-only"]).trim();
  if (staged === "") {
    log("commit: nothing changed");
    return false;
  }

  git([
    "commit",
    "-m",
    `content: ${summary.published} published, ${summary.failed} failed (raindrop)`,
  ]);
  log(`commit: ${staged.split("\n").length} file(s)`);
  return true;
}

/* ---------------------------------------------------------------------------
   run
   --------------------------------------------------------------------------- */

/**
 * Everything the run reaches for, in one injectable bag. The defaults are the
 * real thing; tests replace `fetch` and `captureSite` and point `paths` at a
 * scratch directory, with no framework in between.
 */
function baseDeps() {
  return {
    fetch: globalThis.fetch,
    captureSite,
    env: process.env,
    now: () => new Date(),
    log: (/** @type {string} */ line) => console.log(line),
    errorLog: (/** @type {string} */ line) => console.error(line),
    paths: resolvePaths(REPO_ROOT),
    commit: gitCommit,
  };
}

/**
 * @param {readonly string[]} [argv]
 * @param {Partial<ReturnType<typeof baseDeps>>} [overrides]
 * @returns {Promise<number>} Process exit code.
 */
export async function run(argv = [], overrides = {}) {
  const deps = { ...baseDeps(), ...overrides };

  const unknown = argv.filter((arg) => arg !== "--dry-run");
  if (unknown.length > 0) {
    deps.errorLog(
      `publish: unknown argument "${unknown[0]}" — usage: node pipeline/publish.mjs [--dry-run]`,
    );
    return 2;
  }
  const dryRun = argv.includes("--dry-run");

  const token = deps.env["RAINDROP_TOKEN"];
  if (typeof token !== "string" || token.trim() === "") {
    deps.errorLog(
      "publish: RAINDROP_TOKEN is not set — export the Raindrop test token locally, or add it as the RAINDROP_TOKEN repo secret.",
    );
    return 1;
  }

  const { paths, log } = deps;
  const clock = deps.now();

  try {
    const { state } = await reconcile({ paths, dryRun, log });

    const client = createClient({ token, fetch: deps.fetch });
    const ids = await resolveCollections(client, COLLECTION_NAMES);
    const bookmarks = [
      ...(await fetchBookmarks(client, ids.tools, "tools")),
      ...(await fetchBookmarks(client, ids.sites, "sites")),
      ...(await fetchBookmarks(client, ids.reading, "reading")),
    ];

    /** @type {Record<Section, Record<string, unknown>[]>} */
    const gallery = {
      sites: await readEntries(paths.sitesJson),
      tools: await readEntries(paths.toolsJson),
      reading: await readEntries(paths.readingJson),
    };

    const { work, skipped } = plan({ bookmarks, state, gallery });

    /** @type {import("./apply.mjs").ApplyContext} */
    const ctx = {
      paths,
      client,
      state,
      gallery,
      taken: {
        sites: new Set(gallery.sites.map((entry) => String(entry["slug"]))),
        tools: new Set(gallery.tools.map((entry) => String(entry["slug"]))),
        reading: new Set(gallery.reading.map((entry) => String(entry["slug"]))),
      },
      date: clock.toISOString().slice(0, 10),
      at: clock.toISOString(),
      dryRun,
      log,
      captureSite: deps.captureSite,
    };

    /** @type {Summary} */
    const summary = { published: 0, failed: 0, skipped, pending: 0 };
    for (const item of work) {
      summary[await applyItem(item, ctx)] += 1;
    }

    if (!dryRun) await deps.commit({ paths, summary, log });

    // The contract line. CI parses it into the step summary, so it is last and
    // it is the only line with this shape.
    log(
      `published=${summary.published} failed=${summary.failed} skipped=${summary.skipped} pending=${summary.pending}`,
    );
    return 0;
  } catch (error) {
    deps.errorLog(
      error instanceof RaindropError ? `publish: ${error.message}` : `publish: ${describe(error)}`,
    );
    return 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exitCode = await run(process.argv.slice(2));
}
