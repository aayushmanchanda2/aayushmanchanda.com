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
 *   - a /tools entry has two link fields and they are not interchangeable.
 *     `url` is the product's own site and `repo` is its GitHub repository, and
 *     `tools.ts` fails the build on a repository written into `url`. A saved
 *     GitHub link therefore becomes `repo` with `url` left null. See
 *     `repoFrom` and `buildToolEntry` below.
 *   - `library.ts` takes `note` as `string | null`, so a bookmark with no
 *     excerpt gets null rather than a stand-in sentence. /tools needs the
 *     fallback because a verdict with no note is a row that says nothing; a
 *     reading row already says what it is with its title and its kind.
 *   - a site entry's `collections` and a reading entry's `tags` both come from
 *     the tags on the bookmark, minus the two the pipeline writes itself. See
 *     `RESERVED_TAGS` below.
 */

import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { thumbWebPath } from "./thumb.mjs";
import { isRecord } from "./util.mjs";

/** @typedef {import("./types.js").Bookmark} Bookmark */
/** @typedef {import("./types.js").Draft} Draft */
/** @typedef {import("./types.js").Post} Post */
/** @typedef {import("./types.js").ReadingKind} ReadingKind */
/** @typedef {import("./types.js").Section} Section */
/** @typedef {import("./types.js").Video} Video */

/* ---------------------------------------------------------------------------
   Tags the pipeline owns
   --------------------------------------------------------------------------- */

/**
 * Written back to Raindrop once a bookmark is settled. `apply.mjs` does the
 * writing; they live here because the same two words are what `collectionsFrom`
 * has to refuse, and a curation vocabulary that can silently absorb the
 * pipeline's own bookkeeping is a vocabulary with a `published` collection in
 * it. One definition, so the two rules cannot drift apart.
 */
export const PUBLISHED_TAG = "published";
export const FAILED_TAG = "failed";

/**
 * Tags that are the pipeline talking to itself, never curation.
 *
 * Compared AFTER slugification, so `Published`, `PUBLISHED` and ` published `
 * are all the same reserved word. Raindrop's tag field is free text a human
 * types on a phone, and case is not a thing they will be careful about.
 */
export const RESERVED_TAGS = new Set([PUBLISHED_TAG, FAILED_TAG]);

/** New tool saves are never a verdict — they are a note to self to look. */
export const NEW_TOOL_VERDICT = "watching";

/** Nothing has been judged yet, and the category is a later human call. */
export const NEW_TOOL_CATEGORY = "unsorted";

/** Used when the bookmark has no excerpt. `tools.ts` rejects an empty note. */
export const NEW_TOOL_NOTE = "Saved from Raindrop. Not tested yet.";

/**
 * The shot filenames the pipeline owns; anything else in the dir is left alone.
 *
 * One file per slug since the light/dark pair was retired, so the `-(light|dark)`
 * suffix went with it. The `.webp` extension is doing the real work here: it is
 * what keeps the orphan sweep away from `og-image.png` and anything else a human
 * has parked in `public/shots`.
 */
export const SHOT_FILE = /^[a-z0-9][a-z0-9-]*\.webp$/;

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
 * The collections a bookmark's tags put it in.
 *
 * This is the whole curation model: a tag typed in Raindrop is a collection on
 * the site, and there is no second place to maintain. "Handy Tools" and
 * "handy tools" are one collection because both fold to `handy-tools`, which is
 * also the route the site will answer on.
 *
 * Four things happen to the list, in this order and for these reasons:
 *
 *   - slugified, because a collection is a URL segment before it is a label;
 *   - emptied entries dropped, because a tag of pure punctuation ("!!!") folds
 *     to "" and there is no route with no name;
 *   - reserved tags dropped, so the pipeline's own bookkeeping never becomes a
 *     collection the reader can click into;
 *   - deduped and sorted, so re-tagging in a different order is not a diff.
 *
 * @param {readonly string[]} tags
 * @returns {string[]}
 */
export function collectionsFrom(tags) {
  const slugs = tags
    .map((tag) => slugify(tag))
    .filter((slug) => slug !== "" && !RESERVED_TAGS.has(slug));

  return [...new Set(slugs)].sort();
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
 * The canonical `https://github.com/{owner}/{name}` a saved link belongs to, or
 * null when it is not a repository link at all.
 *
 * The second copy of a rule `src/lib/links.ts › githubRepo` owns, and the
 * duplication is the same one this module's header describes: the pipeline runs
 * as plain `.mjs` outside the bundler, so it cannot import the parser's half.
 * What keeps them from drifting is a test rather than an import —
 * `src/lib/links.test.mjs` feeds this function a table of saved links and
 * asserts that `githubRepo` accepts every repo it produces, unchanged. That is
 * the contract that actually matters: whatever this writes, that must accept.
 *
 * It is deliberately *more* forgiving than the parser in one direction. A
 * person saving a bookmark on a phone saves whatever page they were looking at
 * — a file, a branch, the issues tab — so a deep link is folded back to the
 * repository it is inside rather than rejected. The parser refuses the same
 * link, because a hand-edited file is an edit somebody chose to make.
 *
 * A profile is still not a repository: `github.com/block` has one segment and
 * comes back null, which leaves it in `url` where it belongs.
 *
 * @param {string} url @returns {string | null}
 */
export function repoFrom(url) {
  /** @type {URL} */
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (parsed.hostname.toLowerCase().replace(/^www\./, "") !== "github.com") return null;

  const segments = parsed.pathname.split("/").filter((segment) => segment !== "");
  if (segments.length < 2) return null;

  const owner = segments[0] ?? "";
  const name = (segments[1] ?? "").replace(/\.git$/i, "");
  const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  if (!NAME.test(owner) || !NAME.test(name)) return null;

  return `https://github.com/${owner}/${name}`;
}

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
 * Query parameters that record where a click came from rather than what it
 * points at. `utm_*` is matched as a prefix instead of being listed, because
 * that family is open-ended — a mail tool invents `utm_id` or `utm_term`
 * whenever it likes — and these six are not.
 */
const TRACKING = new Set(["fbclid", "gclid", "ref", "ref_src", "si", "igshid"]);

/**
 * Lowercased first: a share sheet is as likely to hand over `?UTM_Source=` as
 * the tidy spelling.
 *
 * @param {string} name @returns {boolean}
 */
function isTracking(name) {
  const lower = name.toLowerCase();
  return lower.startsWith("utm_") || TRACKING.has(lower);
}

/**
 * The comparison key for "is this the same link". Protocol, `www.`, a trailing
 * slash and the fragment are all noise when the question is whether the gallery
 * already holds this bookmark.
 *
 * **The query string stays, minus the parameters `isTracking` names.** That is a
 * denylist rather than a strip, and the difference is the whole function:
 * `youtube.com/watch?v=abc123` keeps its identity in `?v=`, so dropping the
 * query wholesale would fold every video the site has ever saved onto one key
 * and dedupe them all into whichever one landed first. So a parameter is
 * assumed to be identity until it is named as campaign junk, and the same link
 * saved from a newsletter and from the page itself is one entry.
 *
 * The whole key is then lowercased — right for the host, and deliberately loose
 * for the rest. A path and a query are case-sensitive to a server, but two
 * spellings of one link saved a month apart should still dedupe. The cost is
 * that two URLs differing *only* in the case of a value would collapse into one,
 * which for `?v=` means two YouTube IDs that are the same letters in different
 * case. Accepted rather than overlooked: that needs two genuinely different
 * links identical apart from capitalisation, and tightening it would lose the
 * far more common case this is here to catch.
 *
 * @param {string} url
 * @returns {string}
 */
export function urlKey(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/, "");

    // Rebuilt whether or not anything was dropped, so that two spellings of one
    // parameter cannot survive as two keys: `?q=a%20b` and `?q=a%20b&si=x` have
    // to come out identical, and `URLSearchParams` re-encodes what it holds.
    const query = new URLSearchParams(parsed.search);
    for (const name of [...query.keys()]) {
      if (isTracking(name)) query.delete(name);
    }
    const search = query.toString();

    const host = parsed.hostname.replace(/^www\./, "");
    return `${host}${pathname}${search === "" ? "" : `?${search}`}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/* ---------------------------------------------------------------------------
   Entry construction
   --------------------------------------------------------------------------- */

/** @param {string} slug @returns {string} */
export function shotWebPath(slug) {
  return `/shots/${slug}.webp`;
}

/** @param {string} slug @returns {string} */
export function shotFileName(slug) {
  return `${slug}.webp`;
}

/**
 * Every file in `public/shots` an entry points at, for the orphan sweep.
 *
 * An array because an entry shape is a thing that changes, and it has changed
 * twice now. A /sites entry has one `shot`; a /library entry can have a video's
 * poster frame and, one day, a post's pictures. All three live in the same
 * directory, and `state.mjs` deletes anything in there that nothing claims — so
 * a field that stores a picture and is not read here is a picture the very next
 * run throws away, leaving an entry pointing at nothing.
 *
 * Deliberately shallow, like `readEntries` above: this reads the JSON as records
 * rather than importing the build-time parsers, so it takes anything shaped like
 * a path and ignores everything else.
 *
 * @param {Record<string, unknown>} entry @returns {string[]}
 */
export function shotFilesOf(entry) {
  /** @type {string[]} */
  const paths = [];

  const shot = entry["shot"];
  if (typeof shot === "string") paths.push(shot);

  const video = entry["video"];
  if (isRecord(video) && typeof video["thumb"] === "string") paths.push(video["thumb"]);

  const post = entry["post"];
  if (isRecord(post) && Array.isArray(post["media"])) {
    for (const item of post["media"]) if (typeof item === "string") paths.push(item);
  }

  return paths.filter((value) => value !== "").map((value) => path.basename(value));
}

/**
 * /tools is the one section with no tag taxonomy, and that is still deliberate.
 *
 * The rule was never "only /sites gets collections" — it was that a field no
 * parser reads and no page renders is data pretending to do something. /sites
 * had nothing but the domain, which is a fact about the URL rather than a
 * judgement about the site, so a curated grouping was the first thing there
 * that said anything. /library is now in the same position for a different
 * reason: `kind` sorts a saved link into article, post or video, which says
 * what it is and nothing about what it is about — so its tags land in `tags`
 * (see `buildReadingEntry`) and get their own routes.
 *
 * /tools keeps `category` and stays out of it. That taxonomy is single-valued
 * and every page, route and filter bar over there is built around exactly one
 * answer per tool; a second, many-to-many one would be two things to maintain
 * and two ways to disagree about where a tool belongs.
 *
 * The field names differ across sections on purpose. A /sites `collections`
 * entry is a grouping Aayush curated; a /library `tags` entry is what he typed
 * on his phone when he saved the link. Same fold, same slugs, different claim.
 *
 * @param {object} input
 * @param {Bookmark} input.bookmark
 * @param {string} input.slug
 * @param {string} input.date ISO calendar date.
 * @param {string[]} input.palette Dominant colours, from the capture.
 */
export function buildSiteEntry({ bookmark, slug, date, palette }) {
  return {
    slug,
    title: bookmark.title === "" ? hostnameOf(bookmark.url) : bookmark.title,
    url: bookmark.url,
    domain: hostnameOf(bookmark.url),
    saved_date: date,
    shot: shotWebPath(slug),
    // Copied, not aliased: the capture's array must not stay reachable from the
    // gallery it was written into.
    palette: [...palette],
    collections: collectionsFrom(bookmark.tags),
  };
}

/**
 * A /tools entry, with the saved link filed as whichever kind of link it is.
 *
 * **A repository is not a product site, and the two do not share a field.** A
 * GitHub save lands in `repo` and leaves `url` null; everything else lands in
 * `url`. The pipeline cannot know whether the project also has a homepage — it
 * has one bookmark and no way to ask — so it writes down only what it was
 * given, and `url` stays null until a human finds the site and fills it in.
 *
 * That null is the honest state rather than a gap to paper over. Filing the
 * repository as the product's URL is what put a row of identical GitHub logos
 * on /tools and hid the real site of every tool that had one, and a `url` the
 * pipeline guessed at would put them straight back.
 *
 * @param {object} input
 * @param {Bookmark} input.bookmark
 * @param {string} input.slug
 * @param {string} input.date ISO calendar date; the run date, per contract.
 */
export function buildToolEntry({ bookmark, slug, date }) {
  const repo = repoFrom(bookmark.url);

  return {
    slug,
    name: bookmark.title === "" ? hostnameOf(bookmark.url) : bookmark.title,
    url: repo === null ? bookmark.url : null,
    // Left out entirely rather than written as null, the way every other
    // optional field in these files is left out. `tools.ts` reads absent and
    // null the same; the file stays readable.
    ...(repo === null ? {} : { repo }),
    category: NEW_TOOL_CATEGORY,
    verdict: NEW_TOOL_VERDICT,
    note: bookmark.excerpt === "" ? NEW_TOOL_NOTE : bookmark.excerpt,
    status_date: date,
  };
}

/* ---------------------------------------------------------------------------
   Posts
   --------------------------------------------------------------------------- */

/** How much of a post the title shows. About one line at the page's measure. */
export const POST_TITLE_MAX = 80;

/** How much of it the note shows. A tweet's own limit, near enough. */
export const POST_NOTE_MAX = 280;

/** Something a person could read. Punctuation and decoration alone is not. */
const HAS_WORDS = /[\p{L}\p{N}]/u;

/**
 * `text`, or as much of it as fits, ending on a word.
 *
 * The trailing-punctuation strip is what stops "three weeks," becoming
 * "three weeks,…". The half-budget floor is for the one input a word-boundary
 * cut cannot handle: a single token longer than the whole allowance, where
 * backing off to the last space would return almost nothing. Then a hard cut is
 * the only cut there is.
 *
 * Counted in code points rather than UTF-16 units, because a post is a place
 * emoji live and slicing a string at an odd index inside a surrogate pair leaves
 * half a character behind. The build would accept it — `readString` only refuses
 * empty — and the row would render a replacement glyph.
 *
 * @param {string} text @param {number} max @returns {string}
 */
export function clip(text, max) {
  const tidy = text.trim();
  const points = [...tidy];
  if (points.length <= max) return tidy;

  const cut = points.slice(0, max).join("");
  const space = cut.lastIndexOf(" ");
  const body = space > max / 2 ? cut.slice(0, space) : cut;

  return `${body.replace(/[\s,.;:!?—–-]+$/u, "")}…`;
}

/**
 * A /library entry: metadata and nothing else.
 *
 * No shots, no capture, no browser. A reading row is a title, a host, a word
 * for what it is, and the day it was saved — every one of which is already in
 * the bookmark by the time this runs.
 *
 * The one exception is `post`, and it exists because of a hole Raindrop cannot
 * fill: x.com is behind a login wall, so every post Aayush saves arrives titled
 * "A post from @someone", which is a row that says nothing. When the pipeline
 * has been able to read the post (see `firecrawl.mjs`), the words themselves are
 * a better title than that sentence, so they win.
 *
 * They win the note too, and that is worth saying because the first version of
 * this let Raindrop's excerpt outrank them. The reasoning was that `library.ts`
 * documents the note as one line in Aayush's voice — but the first real x.com
 * save proved the premise wrong. Raindrop does fill an excerpt for a post: it
 * fills it with a ragged, unattributed copy of the same words this function
 * already has, newlines and all. Preferring it meant preferring the worse copy.
 * A note Aayush actually wrote is one he edits into `src/data/library.json`,
 * which the README already names as the better tool for it, and which nothing
 * here ever overwrites.
 *
 * Everything after `note` is optional and left out entirely when it is empty,
 * the way `repo` is left out of a tool entry. `library.ts` reads an absent key
 * and a null one the same, and refuses a present-but-empty one — so writing
 * `"tags": []` on the fourteen entries that have none would be fourteen lines
 * of noise per gallery file and a shape the parser turns down anyway.
 *
 * @param {object} input
 * @param {Bookmark} input.bookmark
 * @param {string} input.slug
 * @param {string} input.date ISO calendar date; the run date, per contract.
 * @param {Post | null} [input.post] What the post said, when it could be read.
 * @param {Video | null} [input.video]
 *   The provider and id, when the URL named one video AND its poster frame is
 *   already on disk. The caller owns that second half: this function turns a
 *   video into a `thumb` path, and a path to a file nobody fetched is the one
 *   thing `thumb.mjs` exists to prevent.
 * @param {Draft | null} [input.draft] Hermes' placeholder opinion, if there is one.
 * @param {string | null} [input.why]
 *   Aayush's own why, when `draftFrom` found one and moved it out of the draft.
 *   A separate parameter from `draft` rather than a flag inside it, which is the
 *   whole point: no renderer can mistake the two, because they never share a
 *   field on the way in either.
 */
export function buildReadingEntry({
  bookmark,
  slug,
  date,
  post = null,
  video = null,
  draft = null,
  why = null,
}) {
  const fallbackTitle = bookmark.title === "" ? hostnameOf(bookmark.url) : bookmark.title;
  const headline = post === null ? "" : clip(post.text, POST_TITLE_MAX);
  const tags = collectionsFrom(bookmark.tags);

  return {
    slug,
    // Tested for words rather than for emptiness. `clip` can return a bare "…"
    // — a post whose first 80 characters are punctuation with no space in them
    // strips down to nothing and keeps the ellipsis — and that is not empty, so
    // an emptiness test would let it through and publish a row whose entire
    // link text is one character of punctuation. The bookmark's own title is a
    // worse title than the post's, but it is a better one than that.
    title: HAS_WORDS.test(headline) ? headline : fallbackTitle,
    url: bookmark.url,
    domain: hostnameOf(bookmark.url),
    saved_date: date,
    kind: deriveKind(bookmark.url),
    // null, not a stand-in sentence: `library.ts` takes null and renders the
    // row without a second line, which is the honest shape for a link Raindrop
    // gave us no excerpt for.
    note: post !== null ? postNote(post) : bookmark.excerpt === "" ? null : bookmark.excerpt,
    ...(tags.length === 0 ? {} : { tags }),
    ...(post === null ? {} : { post: postFields(post) }),
    ...(video === null ? {} : { video: { ...video, thumb: thumbWebPath(slug) } }),
    ...(draft === null ? {} : { draft }),
    ...(why === null ? {} : { why }),
  };
}

/**
 * The post, minus the media array when there is nothing in it.
 *
 * `library.ts › readPost` refuses `"media": []` on the same reasoning it
 * refuses an empty note: a blank means somebody wrote a blank. So the empty
 * case — which is every case today, because Firecrawl's markdown carries no
 * media — is the key not being there.
 *
 * @param {Post} post @returns {Record<string, unknown>}
 */
function postFields({ media, ...rest }) {
  return media.length === 0 ? rest : { ...rest, media };
}

/* ---------------------------------------------------------------------------
   The drafted opinion, out of the bookmark's private note
   --------------------------------------------------------------------------- */

/**
 * A private note that claimed to be a draft and was not one. Its own class so
 * `apply.mjs` reports it as the sweep's bug it is, rather than as a stray
 * SyntaxError from somewhere in the JSON stack.
 */
export class DraftError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "DraftError";
  }
}

/** Who wrote the `why` in the blob. The site renders the two differently. */
const WHY_AUTHORS = new Set(["hermes", "aayush"]);

/**
 * The drafted opinion a sweep left in the bookmark's private note, and the why
 * that is not drafted at all.
 *
 * The transport is the private note because it is the one field on a bookmark
 * that only Aayush can see and only he and his agents write to — so a JSON blob
 * there is machine-to-machine, and nothing a reader of the Raindrop collection
 * has to scroll past. The blob is flat:
 *
 *   {"bullets": ["…"], "why": "…", "whyAuthor": "hermes", "drafted": "2026-08-31"}
 *
 * Two fields are optional and one of them must be there; `whyAuthor` defaults to
 * `hermes`; `drafted` defaults to the run date, which is the day the draft
 * reached the site and the only date this end of the pipe can honestly claim.
 *
 * **`whyAuthor: "aayush"` is a field move, not a label.** His why leaves the
 * draft and becomes the entry's own `why`, where the type system and every
 * renderer treat it as his. If that empties the draft, the draft is null. There
 * is no state in which one sentence is both drafted and his.
 *
 * Anything else throws. A note that is not a blob at all — a sentence he typed —
 * is not "anything else": it is a person using their own notes field, so it
 * returns nothing and says nothing. The loud case is a note that opens with `{`,
 * because only a machine writes that, and a machine writing a broken one is a
 * bug that must stop the item rather than publish a garbled opinion under a
 * label that says a person's agent wrote it.
 *
 * @param {string} note  The bookmark's private note.
 * @param {string} date  ISO calendar date; the run date.
 * @returns {{ draft: Draft | null, why: string | null }}
 */
export function draftFrom(note, date) {
  const text = note.trim();
  if (!text.startsWith("{")) return { draft: null, why: null };

  /** @type {unknown} */
  let blob;
  try {
    blob = JSON.parse(text);
  } catch (error) {
    throw new DraftError(`the private note opens with "{" but is not JSON: ${String(error)}`);
  }
  // Unreachable at runtime — text opening with `{` either parses to an object
  // or throws above — and kept because it is what narrows `unknown` for the
  // reads below. No test covers it, on purpose: there is no input that gets here.
  if (!isRecord(blob)) throw new DraftError("the private note's JSON is not an object");

  const bullets = readBullets(blob["bullets"]);
  const rawWhy = blob["why"];
  if (rawWhy !== undefined && rawWhy !== null && (typeof rawWhy !== "string" || rawWhy.trim() === "")) {
    throw new DraftError(`the draft's "why" is not a sentence: ${JSON.stringify(rawWhy)}`);
  }
  const why = typeof rawWhy === "string" ? rawWhy : null;

  if (bullets === null && why === null) {
    throw new DraftError('the draft has neither "bullets" nor a "why"; leave the note empty instead');
  }

  const author = blob["whyAuthor"] ?? "hermes";
  if (typeof author !== "string" || !WHY_AUTHORS.has(author)) {
    throw new DraftError(
      `the draft's "whyAuthor" must be one of ${[...WHY_AUTHORS].join(", ")} (got ${JSON.stringify(author)})`,
    );
  }

  const drafted = blob["drafted"] ?? date;
  if (typeof drafted !== "string" || !isCalendarDate(drafted)) {
    throw new DraftError(`the draft's "drafted" is not a YYYY-MM-DD date: ${JSON.stringify(drafted)}`);
  }

  // His why leaves the draft rather than being flagged inside it.
  const mine = author === "aayush" ? why : null;
  const theirs = author === "aayush" ? null : why;
  if (bullets === null && theirs === null) return { draft: null, why: mine };

  return { draft: { bullets, why: theirs, drafted }, why: mine };
}

/** @param {unknown} value @returns {string[] | null} */
function readBullets(value) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length === 0) {
    throw new DraftError('the draft\'s "bullets" is not a non-empty array');
  }
  return value.map((bullet) => {
    // One line each, the rule `library.ts › readDigest` already holds bullets
    // to: the markdown rendering turns a newline into a second, unmarked bullet
    // and the HTML one does not, so the two would disagree about how many
    // claims the piece made.
    if (typeof bullet !== "string" || bullet.trim() === "" || bullet.includes("\n")) {
      throw new DraftError(`a draft bullet is not one non-empty line: ${JSON.stringify(bullet)}`);
    }
    return bullet;
  });
}

/** Shape AND reality — `2026-02-31` is neither. @param {string} value */
function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/**
 * The second line for a post: who said it, and more of what they said than the
 * title had room for.
 *
 * The handle leads so the line reads as a quotation rather than as Aayush
 * talking. When the title already holds the whole post, the words are not
 * repeated — the attribution is the only thing left that the title did not
 * already say.
 *
 * @param {Post} post @returns {string}
 */
function postNote(post) {
  const whole = clip(post.text, POST_TITLE_MAX) === post.text.trim();
  return whole ? `@${post.handle}` : `@${post.handle}: ${clip(post.text, POST_NOTE_MAX)}`;
}
