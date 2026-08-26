/**
 * apply.mjs — doing the one thing `plan()` decided, for one bookmark.
 *
 * The whole file is about write ordering. For a new site entry the order is:
 *
 *   1. capture into `pipeline/tmp/<id>/`, never straight into `public/`
 *   2. move the shots into `public/shots/`
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
  buildSiteEntry,
  buildToolEntry,
  isRecord,
  shotFileName,
  slugBase,
  uniqueSlug,
  writeEntries,
} from "./entries.mjs";
import { tagBookmark } from "./raindrop.mjs";
import { MAX_ATTEMPTS, galleryFor, saveState } from "./state.mjs";

/** @typedef {import("./types.js").Bookmark} Bookmark */
/** @typedef {import("./types.js").Paths} Paths */
/** @typedef {import("./types.js").PlannedItem} PlannedItem */
/** @typedef {import("./types.js").Section} Section */
/** @typedef {import("./types.js").StateMap} StateMap */

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
 * @property {typeof import("./capture.mjs").captureSite} captureSite
 */

export const PUBLISHED_TAG = "published";
export const FAILED_TAG = "failed";

/** @param {unknown} error @returns {string} */
function describe(error) {
  if (error instanceof Error) return error.message.split("\n")[0];
  return String(error);
}

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
    let hasDark = false;

    // Tools are a link with a verdict attached; only sites are a picture.
    if (section === "sites") {
      await mkdir(scratch, { recursive: true });
      const shots = await ctx.captureSite({ url: bookmark.url, slug, outDir: scratch });
      await mkdir(ctx.paths.shotsDir, { recursive: true });

      await moveShot(shots.light, path.join(ctx.paths.shotsDir, shotFileName(slug, "light")));
      if (shots.dark !== null) {
        await moveShot(shots.dark, path.join(ctx.paths.shotsDir, shotFileName(slug, "dark")));
        hasDark = true;
      }
    }

    const entry =
      section === "sites"
        ? buildSiteEntry({ bookmark, slug, date: ctx.date, hasDark })
        : buildToolEntry({ bookmark, slug, date: ctx.date });

    // The file is written before the in-memory list advances, so a failed write
    // leaves the run's view of the gallery matching what is on disk.
    const next = [...ctx.gallery[section], entry];
    await writeEntries(galleryFor(ctx.paths, section), next);
    ctx.gallery[section] = next;
    ctx.taken[section].add(slug);

    ctx.state[bookmark.id] = { kind: "published", slug, section, at: ctx.at };
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
