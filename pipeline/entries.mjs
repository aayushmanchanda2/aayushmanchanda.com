/**
 * entries.mjs — the JSON galleries, from the writing side.
 *
 * `src/lib/sites.ts` and `src/lib/tools.ts` own the reading side and refuse to
 * build on a bad entry. This module is the other half of that contract: it is
 * the only place the pipeline shapes an entry, so anything it writes is
 * something those parsers will accept.
 *
 * Two contract details worth stating out loud, because they are not obvious
 * from the JSON alone:
 *
 *   - `domain` is recomputed from the URL (`hostname` minus `www.`), never
 *     copied from Raindrop's own `domain` field. `sites.ts` cross-checks the
 *     two and fails the build if they disagree, and Raindrop keeps the `www.`
 *     on some hosts.
 *   - `tools.ts` requires a non-empty `note` and a non-empty `category`.
 *     Raindrop supplies neither reliably, so both have honest fallbacks below
 *     rather than an empty string that would fail `astro build`.
 *   - `reading.ts` takes `note` as `string | null`, so a bookmark with no
 *     excerpt gets null rather than a stand-in sentence. /tools needs the
 *     fallback because a verdict with no note is a row that says nothing; a
 *     reading row already says what it is with its title and its kind.
 */

import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { isRecord } from "./util.mjs";

/** @typedef {import("./types.js").Bookmark} Bookmark */
/** @typedef {import("./types.js").ReadingKind} ReadingKind */
/** @typedef {import("./types.js").Section} Section */

/** New tool saves are never a verdict — they are a note to self to look. */
export const NEW_TOOL_VERDICT = "watching";

/** Nothing has been judged yet, and the category is a later human call. */
export const NEW_TOOL_CATEGORY = "unsorted";

/** Used when the bookmark has no excerpt. `tools.ts` rejects an empty note. */
export const NEW_TOOL_NOTE = "Saved from Raindrop. Not tested yet.";

/** The shot filenames the pipeline owns; anything else in the dir is left alone. */
export const SHOT_FILE = /^[a-z0-9][a-z0-9-]*-(light|dark)\.webp$/;

/* ---------------------------------------------------------------------------
   Reading and writing
   --------------------------------------------------------------------------- */

/**
 * A gallery file as a list of records.
 *
 * Deliberately shallow: the pipeline only needs `slug`, `url` and `shots` to do
 * its job, and re-implementing the full build-time parse here would give us two
 * validators to keep in step. Anything malformed enough to break those three
 * fields throws; the rest is the build guard's business.
 *
 * @param {string} file
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function readEntries(file) {
  /** @type {string} */
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    // A gallery that does not exist yet is an empty gallery, not a failure.
    if (isRecord(error) && error["code"] === "ENOENT") return [];
    throw error;
  }

  /** @type {unknown} */
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${String(error)}`);
  }

  if (!Array.isArray(value)) throw new Error(`${file} must hold a JSON array`);

  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`${file} entry ${index} is not an object`);
    if (typeof item["slug"] !== "string" || item["slug"] === "") {
      throw new Error(`${file} entry ${index} has no "slug"`);
    }
    return item;
  });
}

/**
 * Replace a gallery file in one step.
 *
 * Write-then-rename, because a torn JSON file would fail every later build and
 * there is no reconcile rule that can repair one. `rename` within a directory
 * is atomic on every filesystem this runs on.
 *
 * @param {string} file
 * @param {readonly unknown[]} entries
 */
export async function writeEntries(file, entries) {
  const staging = `${file}.staging`;
  await writeFile(staging, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  await rename(staging, file);
}

/* ---------------------------------------------------------------------------
   Slugs
   --------------------------------------------------------------------------- */

/**
 * Kebab-case, and nothing a URL or a filename would argue with.
 *
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/**
 * The slug a bookmark wants: its title, or its domain when the title is
 * missing or turns to punctuation.
 *
 * @param {Bookmark} bookmark
 * @returns {string}
 */
export function slugBase(bookmark) {
  const fromTitle = slugify(bookmark.title);
  if (fromTitle !== "") return fromTitle;

  const fromDomain = slugify(hostnameOf(bookmark.url));
  if (fromDomain !== "") return fromDomain;

  return `entry-${bookmark.id}`;
}

/**
 * `base`, or `base-2`, `base-3`… — the first spelling nothing else has claimed.
 * Slugs are page URLs, so a collision would silently overwrite a page.
 *
 * @param {string} base
 * @param {ReadonlySet<string>} taken
 * @returns {string}
 */
export function uniqueSlug(base, taken) {
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`cannot find a free slug for "${base}" after 1000 tries`);
}

/* ---------------------------------------------------------------------------
   URLs
   --------------------------------------------------------------------------- */

/** @param {string} url @returns {string} `""` when the URL does not parse. */
export function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Whether a URL's host is one of `bases`, or a subdomain of one.
 *
 * The subdomain half is the part worth having: `mobile.twitter.com` is Twitter
 * and `x.company` is not, and a bare `includes()` on the hostname gets both of
 * those wrong in opposite directions.
 *
 * @param {string} url @param {readonly string[]} bases @returns {boolean}
 */
export function hostIsOneOf(url, bases) {
  const host = hostnameOf(url).toLowerCase();
  if (host === "") return false;
  return bases.some((base) => host === base || host.endsWith(`.${base}`));
}

/** Hosts whose links are a post on a timeline rather than a page. */
export const POST_HOSTS = ["x.com", "twitter.com"];

/** Hosts whose links are something you watch. */
export const VIDEO_HOSTS = ["youtube.com", "youtu.be"];

/**
 * What a saved link is, from its host alone.
 *
 * Host-based rather than clever, and `article` is the fallback, because the two
 * exceptions are the only two the site can be sure about: a `/status/` URL is a
 * post and a YouTube URL is a video, and everything else on the open web is a
 * page with words on it until a human says otherwise. Getting this wrong costs
 * one word in a chip that Aayush can edit in the JSON, so it is not worth a
 * network call to be surer.
 *
 * @param {string} url @returns {ReadingKind}
 */
export function deriveKind(url) {
  if (hostIsOneOf(url, POST_HOSTS)) return "post";
  if (hostIsOneOf(url, VIDEO_HOSTS)) return "video";
  return "article";
}

/**
 * The comparison key for "is this the same link". Protocol, `www.`, a trailing
 * slash and the fragment are all noise when the question is whether the gallery
 * already holds this bookmark.
 *
 * @param {string} url
 * @returns {string}
 */
export function urlKey(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.hostname.replace(/^www\./, "")}${pathname}${parsed.search}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/* ---------------------------------------------------------------------------
   Entry construction
   --------------------------------------------------------------------------- */

/** @param {string} slug @param {"light" | "dark"} scheme @returns {string} */
export function shotWebPath(slug, scheme) {
  return `/shots/${slug}-${scheme}.webp`;
}

/** @param {string} slug @param {"light" | "dark"} scheme @returns {string} */
export function shotFileName(slug, scheme) {
  return `${slug}-${scheme}.webp`;
}

/**
 * The shot filenames an entry points at, for the orphan sweep.
 * @param {Record<string, unknown>} entry @returns {string[]}
 */
export function shotFilesOf(entry) {
  const shots = entry["shots"];
  if (!isRecord(shots)) return [];

  /** @type {string[]} */
  const files = [];
  for (const key of /** @type {const} */ (["light", "dark"])) {
    const value = shots[key];
    if (typeof value === "string" && value !== "") files.push(path.basename(value));
  }
  return files;
}

/**
 * @param {object} input
 * @param {Bookmark} input.bookmark
 * @param {string} input.slug
 * @param {string} input.date ISO calendar date.
 * @param {boolean} input.hasDark
 */
export function buildSiteEntry({ bookmark, slug, date, hasDark }) {
  return {
    slug,
    title: bookmark.title === "" ? hostnameOf(bookmark.url) : bookmark.title,
    url: bookmark.url,
    domain: hostnameOf(bookmark.url),
    saved_date: date,
    shots: {
      light: shotWebPath(slug, "light"),
      dark: hasDark ? shotWebPath(slug, "dark") : null,
    },
  };
}

/**
 * @param {object} input
 * @param {Bookmark} input.bookmark
 * @param {string} input.slug
 * @param {string} input.date ISO calendar date; the run date, per contract.
 */
export function buildToolEntry({ bookmark, slug, date }) {
  return {
    slug,
    name: bookmark.title === "" ? hostnameOf(bookmark.url) : bookmark.title,
    url: bookmark.url,
    category: NEW_TOOL_CATEGORY,
    verdict: NEW_TOOL_VERDICT,
    note: bookmark.excerpt === "" ? NEW_TOOL_NOTE : bookmark.excerpt,
    status_date: date,
  };
}

/**
 * A /reading entry: metadata and nothing else.
 *
 * No shots, no capture, no browser. A reading row is a title, a host, a word
 * for what it is, and the day it was saved — every one of which is already in
 * the bookmark by the time this runs.
 *
 * @param {object} input
 * @param {Bookmark} input.bookmark
 * @param {string} input.slug
 * @param {string} input.date ISO calendar date; the run date, per contract.
 */
export function buildReadingEntry({ bookmark, slug, date }) {
  return {
    slug,
    title: bookmark.title === "" ? hostnameOf(bookmark.url) : bookmark.title,
    url: bookmark.url,
    domain: hostnameOf(bookmark.url),
    saved_date: date,
    kind: deriveKind(bookmark.url),
    // null, not a stand-in sentence: `reading.ts` takes null and renders the
    // row without a second line, which is the honest shape for a link Raindrop
    // gave us no excerpt for.
    note: bookmark.excerpt === "" ? null : bookmark.excerpt,
  };
}
