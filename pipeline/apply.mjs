/**
 * apply.mjs — doing the one thing `plan()` decided, for one bookmark.
 *
 * The whole file is about write ordering, and only /sites has enough writes for
 * the ordering to be interesting. /tools and /library are metadata: an entry and
 * a state row, no files on disk, so their only crash point is the one between
 * those two, which the next `plan()` adopts by URL.
 *
 * For a new site entry the order is:
 *
 *   1. capture into `pipeline/tmp/<id>/`, never straight into `public/`
 *   2. move the shot into `public/shots/`
 *   3. append the JSON entry
 *   4. write the state row
 *   5. tag the bookmark in Raindrop
 *
 * Read it as a list of crash points. Between 2 and 3 leaves an image nothing
 * points at, which the next `reconcile()` deletes. Between 3 and 4 leaves an
 * entry with no state row, which the next `plan()` adopts by URL. Between 4 and
 * 5 leaves an untagged bookmark, which is cosmetic — Raindrop tags are for the
 * human scrolling their collection, never for dedupe. The one ordering that
 * would hurt, an entry whose image never arrived, is unreachable.
 *
 * Steps 3 and 4 each land through a write-then-rename, so neither file is ever
 * half-written even if the process dies mid-call.
 */

import { copyFile, mkdir, rename, rm, unlink } from "node:fs/promises";
import path from "node:path";

import {
  FAILED_TAG,
  PUBLISHED_TAG,
  buildReadingEntry,
  buildSiteEntry,
  buildToolEntry,
  deriveKind,
  shotFileName,
  slugBase,
  uniqueSlug,
  writeEntries,
} from "./entries.mjs";
import { isOutOfCredits } from "./firecrawl.mjs";
import { tagBookmark } from "./raindrop.mjs";
import { MAX_ATTEMPTS, galleryFor, saveState } from "./state.mjs";
import { describe, isRecord } from "./util.mjs";

/** @typedef {import("./types.js").Bookmark} Bookmark */
/** @typedef {import("./types.js").CaptureVia} CaptureVia */
/** @typedef {import("./types.js").Paths} Paths */
/** @typedef {import("./types.js").PlannedItem} PlannedItem */
/** @typedef {import("./types.js").Post} Post */
/** @typedef {import("./types.js").Section} Section */
/** @typedef {import("./types.js").StateMap} StateMap */

/** A thing that turns a URL into a shot on disk. Two of them exist. */
/** @typedef {typeof import("./capture.mjs").captureSite} Capturer */

/** How one bookmark ended up — the four counters in the summary line. */
/** @typedef {"published" | "failed" | "skipped" | "pending"} Outcome */

/**
 * @typedef {object} ApplyContext
 * @property {Paths} paths
 * @property {import("./raindrop.mjs").RaindropClient} client
 * @property {StateMap} state
 * @property {Record<Section, Record<string, unknown>[]>} gallery
 * @property {Record<Section, Set<string>>} taken   Slugs already spoken for.
 * @property {string} date    ISO calendar date for the run.
 * @property {string} at      ISO timestamp for the run.
 * @property {boolean} dryRun
 * @property {(line: string) => void} log
 * @property {Capturer} captureSite
 * @property {Capturer | null} firecrawlShot
 *   The second chance for a /sites capture, or null when Firecrawl is not
 *   configured. Same signature as `captureSite` on purpose: `publish.mjs` has
 *   already bound the client, so this file never learns there is one.
 * @property {((url: string) => Promise<Post | null>) | null} lookUpPost
 *   Reads an x.com post, or null when Firecrawl is not configured.
 */

/**
 * Re-exported, not defined here.
 *
 * These two words are also the two `entries.mjs` refuses to turn into a
 * collection, and that refusal is the load-bearing half: a reader must never
 * find a `published` collection on /sites. So the definition sits next to the
 * rule that depends on it, and this file — which does the writing — borrows it.
 */
export { FAILED_TAG, PUBLISHED_TAG };

/**
 * @param {PlannedItem} item
 * @param {ApplyContext} ctx
 * @returns {Promise<Outcome>}
 */
export async function applyItem(item, ctx) {
  switch (item.kind) {
    case "capture":
      return captureAndPublish(item.bookmark, item.attempts, ctx);
    case "adopt":
      return adopt(item.bookmark, item.slug, ctx);
    case "reject":
      return terminate(item.bookmark, item.reason, MAX_ATTEMPTS, ctx);
    case "dead-letter":
      return terminate(item.bookmark, item.lastError, item.attempts, ctx);
    default: {
      const never = /** @type {never} */ (item);
      throw new Error(`unhandled planned item: ${JSON.stringify(never)}`);
    }
  }
}

/**
 * Local truth is already committed by the time this runs, so a tag that will
 * not stick is a warning, not a failed item.
 *
 * @param {Bookmark} bookmark @param {string} tag @param {ApplyContext} ctx
 */
async function tagQuietly(bookmark, tag, ctx) {
  if (ctx.dryRun) return;
  try {
    await tagBookmark(ctx.client, bookmark, tag);
  } catch (error) {
    ctx.log(`warn: could not tag raindrop ${bookmark.id} "${tag}" — ${describe(error)}`);
  }
}

/**
 * The line for a Firecrawl failure that is not going to fix itself, or null
 * when it might.
 *
 * Both callers below survive either kind identically — the row publishes, the
 * capture takes its strike — so the only thing left to get right is what the
 * run log tells the person reading it. A timeout or a 5xx is worth a warning
 * and no more, because the next run probably gets the page. A 402 is not a
 * failure of the call at all: the account is out of credits, every call after
 * this one fails the same way, and it will keep doing so on every scheduled run
 * until someone tops it up. That is the same standing condition an unset
 * `FIRECRAWL_API_KEY` is, arriving mid-run instead of at the top of one, and
 * `publish.mjs` already prints the top-of-run version — so this reads like it,
 * names the cost, and names the fix.
 *
 * The import that makes this possible is the error vocabulary, not the service:
 * `publish.mjs` still binds both enrichments to plain functions, and this file
 * still never holds a client.
 *
 * @param {string} what   What went unfetched, so the line has a subject.
 * @param {unknown} error
 * @returns {string | null}
 */
function outOfCreditsLine(what, error) {
  if (!isOutOfCredits(error)) return null;
  return (
    `firecrawl: out of credits (HTTP 402) — ${what} is skipped, ` +
    "and so is every call after it until the account is topped up"
  );
}

/**
 * `rename` first; `copyFile` covers a tmp dir that landed on another device.
 * @param {string} from @param {string} to
 */
async function moveShot(from, to) {
  try {
    await rename(from, to);
  } catch (error) {
    if (!isRecord(error) || error["code"] !== "EXDEV") throw error;
    await copyFile(from, to);
    await unlink(from);
  }
}

/**
 * The entry shape for a section, as a switch rather than a chain of ternaries:
 * a fourth section has to be handled here or the `never` arm stops compiling.
 *
 * @param {Section} section
 * @param {{ bookmark: Bookmark, slug: string, date: string, palette: string[], post: Post | null }} input
 * @returns {Record<string, unknown>}
 */
function buildEntry(section, { bookmark, slug, date, palette, post }) {
  switch (section) {
    case "sites":
      return buildSiteEntry({ bookmark, slug, date, palette });
    case "tools":
      return buildToolEntry({ bookmark, slug, date });
    case "reading":
      return buildReadingEntry({ bookmark, slug, date, post });
    default: {
      const never = /** @type {never} */ (section);
      throw new Error(`unknown section ${JSON.stringify(never)}`);
    }
  }
}

/**
 * What an x.com post says, when this is one and Firecrawl is configured to ask.
 *
 * Quiet on failure, like `tagQuietly` and for the same reason: the enrichment is
 * a nicety on top of a row that publishes fine without it, so a Firecrawl outage
 * must cost a warning line and nothing else. Never an attempt, never a strike.
 * The row lands with Raindrop's own title, exactly as it did before this
 * existed.
 *
 * @param {Bookmark} bookmark @param {ApplyContext} ctx
 * @returns {Promise<Post | null>}
 */
async function postFor(bookmark, ctx) {
  // `deriveKind` rather than a second host list: the question "is this a post"
  // already has one answer in this pipeline, and it is the one the entry's own
  // `kind` field is about to be set from.
  if (ctx.lookUpPost === null || deriveKind(bookmark.url) !== "post") return null;

  try {
    const post = await ctx.lookUpPost(bookmark.url);
    // Two different disappointments, and the run log has to tell them apart:
    // this one means Firecrawl answered and the answer held no post — a login
    // wall, a deleted tweet, a document shaped differently than it was. The
    // `warn` below means the call itself did not happen. Both publish the row
    // unchanged, and only one of them is worth going and looking at the
    // markdown for.
    if (post === null) ctx.log(`firecrawl: read ${bookmark.url}, found no post in it`);
    return post;
  } catch (error) {
    ctx.log(
      outOfCreditsLine(`the post at ${bookmark.url}`, error) ??
        `warn: firecrawl could not read ${bookmark.url} — ${describe(error)}`,
    );
    return null;
  }
}

/**
 * The shot, and who took it.
 *
 * Firecrawl is asked only on the last attempt, and only after the browser has
 * already failed. Both halves of that matter. Asking earlier would spend credits
 * on sites that a retry would have got for free — most capture failures are a
 * slow page, not a wall — and asking on any attempt but the last would put a
 * paid call on a path that still has free retries left in it. So the second
 * chance sits exactly where the alternative is a dead letter.
 *
 * A Firecrawl failure re-throws the BROWSER's error rather than its own. The
 * state row is a record of why the capture did not work, and "Playwright timed
 * out" is that reason; the fallback's failure is a footnote, and it goes in the
 * run log where footnotes belong.
 *
 * @param {Bookmark} bookmark @param {string} slug @param {string} outDir
 * @param {number} attempts  Attempts already spent before this one.
 * @param {ApplyContext} ctx
 * @returns {Promise<{ shot: string, palette: string[], via: CaptureVia | null }>}
 */
async function shootSite(bookmark, slug, outDir, attempts, ctx) {
  // `log` so a clipped capture is reported in the run log, next to the entry it
  // explains, instead of on stderr where nothing reads it.
  const input = { url: bookmark.url, slug, outDir, log: ctx.log };

  try {
    return { ...(await ctx.captureSite(input)), via: null };
  } catch (error) {
    const lastAttempt = attempts + 1 >= MAX_ATTEMPTS;
    if (!lastAttempt || ctx.firecrawlShot === null) throw error;

    ctx.log(`capture: ${slug} failed its last browser attempt — asking firecrawl for the shot`);

    try {
      return { ...(await ctx.firecrawlShot(input)), via: "firecrawl" };
    } catch (fallbackError) {
      ctx.log(
        outOfCreditsLine(`the shot for ${slug}`, fallbackError) ??
          `capture: firecrawl could not shoot ${slug} either — ${describe(fallbackError)}`,
      );
      throw error;
    }
  }
}

/**
 * @param {Bookmark} bookmark
 * @param {number} attempts   Attempts already spent on this bookmark.
 * @param {ApplyContext} ctx
 * @returns {Promise<Outcome>}
 */
async function captureAndPublish(bookmark, attempts, ctx) {
  const section = bookmark.collection;
  const slug = uniqueSlug(slugBase(bookmark), ctx.taken[section]);

  if (ctx.dryRun) {
    ctx.taken[section].add(slug);
    ctx.log(`would publish ${section}/${slug} — ${bookmark.url}`);
    return "published";
  }

  const scratch = path.join(ctx.paths.tmpDir, bookmark.id);

  try {
    /** @type {string[]} */
    let palette = [];
    /** @type {CaptureVia | null} */
    let via = null;

    // Only /sites is a picture. A tool is a link with a verdict attached and a
    // reading row is a link with a kind attached; neither opens a browser.
    if (section === "sites") {
      await mkdir(scratch, { recursive: true });
      const capture = await shootSite(bookmark, slug, scratch, attempts, ctx);
      await mkdir(ctx.paths.shotsDir, { recursive: true });

      await moveShot(capture.shot, path.join(ctx.paths.shotsDir, shotFileName(slug)));
      palette = capture.palette;
      via = capture.via;
    }

    const post = section === "reading" ? await postFor(bookmark, ctx) : null;
    const entry = buildEntry(section, { bookmark, slug, date: ctx.date, palette, post });

    // The file is written before the in-memory list advances, so a failed write
    // leaves the run's view of the gallery matching what is on disk.
    const next = [...ctx.gallery[section], entry];
    await writeEntries(galleryFor(ctx.paths, section), next);
    ctx.gallery[section] = next;
    ctx.taken[section].add(slug);

    // `via` is written only when there is something to say. The ordinary row
    // has no such key, so the state file does not grow a field that is null on
    // every line but the rare one.
    ctx.state[bookmark.id] =
      via === null
        ? { kind: "published", slug, section, at: ctx.at }
        : { kind: "published", slug, section, at: ctx.at, via };
    await saveState(ctx.paths, ctx.state);
  } catch (error) {
    await rm(scratch, { recursive: true, force: true });

    const tried = attempts + 1;
    ctx.state[bookmark.id] = { kind: "pending", attempts: tried, lastError: describe(error) };
    await saveState(ctx.paths, ctx.state);
    ctx.log(`failed ${bookmark.url} (attempt ${tried}/${MAX_ATTEMPTS}) — ${describe(error)}`);
    return "pending";
  }

  await rm(scratch, { recursive: true, force: true });
  await tagQuietly(bookmark, PUBLISHED_TAG, ctx);
  ctx.log(`published ${section}/${slug} — ${bookmark.url}`);
  return "published";
}

/**
 * The gallery already holds this link. Record the state row that was missing
 * and tag the bookmark; nothing new is published.
 *
 * @param {Bookmark} bookmark @param {string} slug @param {ApplyContext} ctx
 * @returns {Promise<Outcome>}
 */
async function adopt(bookmark, slug, ctx) {
  ctx.log(`adopted ${bookmark.collection}/${slug} — already in the gallery`);
  if (ctx.dryRun) return "skipped";

  ctx.state[bookmark.id] = { kind: "published", slug, section: bookmark.collection, at: ctx.at };
  await saveState(ctx.paths, ctx.state);
  await tagQuietly(bookmark, PUBLISHED_TAG, ctx);
  return "skipped";
}

/**
 * Stop trying: tag `failed` in Raindrop so it is visible where it was saved,
 * and settle the state row so no later run picks it up again.
 *
 * @param {Bookmark} bookmark @param {string} reason @param {number} attempts
 * @param {ApplyContext} ctx
 * @returns {Promise<Outcome>}
 */
async function terminate(bookmark, reason, attempts, ctx) {
  ctx.log(`gave up on ${bookmark.url} — ${reason}`);
  if (ctx.dryRun) return "failed";

  ctx.state[bookmark.id] = { kind: "failed", attempts, lastError: reason, at: ctx.at };
  await saveState(ctx.paths, ctx.state);
  await tagQuietly(bookmark, FAILED_TAG, ctx);
  return "failed";
}
