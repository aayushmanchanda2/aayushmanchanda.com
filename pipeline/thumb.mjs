/**
 * thumb.mjs — the pictures a /library entry commits rather than hotlinks.
 *
 * Two of them: the still a saved video shows before anyone presses play, and
 * the photos attached to a saved x.com post. Different sources, one rule, which
 * is why they share a module — fetch it once, re-encode it, write it into
 * `public/shots`, and let the entry name a local path.
 *
 * Its own module for the reason `palette.mjs` is: it is not part of taking a
 * picture of a website. There is no browser here and no Playwright — a URL goes
 * in, a `.webp` lands on disk, and `capture.mjs`'s whole apparatus of scrolling,
 * clipping and challenge detection is irrelevant to a file the provider is
 * already serving as a single JPEG.
 *
 * Why fetch at all, when an `<img src="https://i.ytimg.com/…">` would be one
 * line and no bytes in the repo: because that line would tell Google — or, for
 * a post's photos, x.com — who is reading this site, on every page load, before
 * anyone has decided to watch or look at anything. `/privacy` makes a promise
 * about outside requests that a hotlinked picture would break. So it is fetched
 * once, in CI, re-encoded, and committed next to the screenshots: the same
 * trade /sites already makes, for the same reason.
 *
 * Failure here is loud on purpose. `apply.mjs` catches it into a pending row and
 * the next run tries again, exactly as a failed capture does. The alternative —
 * publish the entry and leave a path pointing at a file that never arrived — is
 * the one outcome this module exists to prevent, because a dangling path
 * survives every later check: the JSON parses, the build passes, and the page
 * renders a broken image forever.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

/** @typedef {import("./types.js").Video} Video */

/**
 * YouTube video ids are eleven characters of URL-safe base64, and have been for
 * the whole life of the API. Held to exactly that rather than to "something
 * after the slash" so that a share link with a playlist in it, a channel page,
 * or a typo comes back null and the entry publishes without a video object —
 * which is an honest absence. The looser alternative fails later and worse: an
 * id nothing serves turns every run into a fetch that 404s, and the entry sits
 * pending until it dead-letters.
 */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** Path segments that introduce a video id rather than name one. */
const YOUTUBE_PREFIXES = new Set(["shorts", "embed", "live", "v"]);

/** How long one thumbnail fetch gets. A CDN that slow is not answering. */
const REQUEST_TIMEOUT_MS = 15_000;

/** Anything larger than this is not a poster frame. */
const MAX_THUMB_BYTES = 8 * 1024 * 1024;

/**
 * How each of the two formats a provider serves starts.
 *
 * Checked for the same reason `firecrawl.mjs` checks the PNG magic: a CDN that
 * answers 200 with an HTML error page would otherwise reach sharp as a buffer
 * that fails two calls later with a message about image formats, and the run log
 * would blame the encoder for something the network said.
 */
const MAGIC = [
  Buffer.from([0xff, 0xd8, 0xff]),
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
];

/** x.com's own ceiling on photos in one post. */
const MAX_MEDIA = 4;

/**
 * Poster frames, best first.
 *
 * `maxresdefault` is a 1280x720 frame and it does not exist for every video —
 * YouTube only generates it above a resolution threshold, and asks 404 for the
 * rest. `hqdefault` is generated for everything, so the pair is "the good one,
 * or the one that is always there". Both come from the same host with no key
 * and no query string.
 */
const YOUTUBE_FRAMES = ["maxresdefault", "hqdefault"];

/**
 * The widest a stored poster frame gets. `maxresdefault` arrives at exactly
 * this, so it is a ceiling for the good case and never an upscale for `hqdefault`,
 * which arrives at 480 and should stay there rather than be blown up into
 * something that looks worse than what was fetched.
 */
const THUMB_WIDTH = 1280;

/** The settings `capture.mjs` landed on, for the same kind of image. */
const WEBP_QUALITY = 82;
const WEBP_EFFORT = 6;

/* ---------------------------------------------------------------------------
   Reading a video out of its URL
   --------------------------------------------------------------------------- */

/**
 * The provider and id a saved link points at, or null when the URL is a YouTube
 * page that is not one video — a channel, a playlist, the homepage.
 *
 * Null is a supported answer all the way up. `deriveKind` has already called
 * this entry a video from the host alone, and it stays a video: what it loses
 * is the poster frame and the click-to-play card, not its place in the gallery.
 *
 * @param {string} url
 * @returns {Video | null}
 */
export function videoFrom(url) {
  /** @type {URL} */
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const segments = parsed.pathname.split("/").filter((segment) => segment !== "");

  // youtu.be/<id> — the whole path is the id.
  if (host === "youtu.be") return youtube(segments[0]);

  if (host !== "youtube.com" && !host.endsWith(".youtube.com")) return null;

  // youtube.com/watch?v=<id>, and every other query-shaped route they have.
  if (segments[0] === "watch") return youtube(parsed.searchParams.get("v"));

  // youtube.com/shorts/<id>, /embed/<id>, /live/<id>, /v/<id>.
  const first = segments[0]?.toLowerCase();
  if (first !== undefined && YOUTUBE_PREFIXES.has(first)) return youtube(segments[1]);

  return null;
}

/** @param {string | null | undefined} id @returns {Video | null} */
function youtube(id) {
  if (typeof id !== "string" || !YOUTUBE_ID.test(id)) return null;
  return { provider: "youtube", id };
}

/* ---------------------------------------------------------------------------
   Where it lands
   --------------------------------------------------------------------------- */

/**
 * `<slug>-thumb.webp`.
 *
 * The suffix is what keeps a video's poster frame from colliding with a site's
 * screenshot when both are named after the same slug, and it stays inside the
 * `[a-z0-9-]*\.webp` shape `entries.mjs › SHOT_FILE` recognises — which is the
 * pattern the orphan sweep uses to decide whether a file in `public/shots` is
 * the pipeline's to delete. A name outside that shape would never be swept and
 * would outlive every entry that pointed at it.
 *
 * @param {string} slug @returns {string}
 */
export function thumbFileName(slug) {
  return `${slug}-thumb.webp`;
}

/** @param {string} slug @returns {string} */
export function thumbWebPath(slug) {
  return `/shots/${thumbFileName(slug)}`;
}

/**
 * `<slug>-media-1.webp`, `-2`, and so on.
 *
 * Numbered from one rather than named after the source, because the source name
 * is a CDN hash that says nothing, and because the order is the only thing about
 * a post's photos that a card has to preserve: a three-photo post reads
 * differently if the second one leads.
 *
 * @param {string} slug @param {number} index  Zero-based.
 */
export function mediaFileName(slug, index) {
  return `${slug}-media-${index + 1}.webp`;
}

/** @param {string} slug @param {number} index @returns {string} */
export function mediaWebPath(slug, index) {
  return `/shots/${mediaFileName(slug, index)}`;
}

/* ---------------------------------------------------------------------------
   Fetching it
   --------------------------------------------------------------------------- */

/**
 * A thumbnail that could not be fetched or was not an image. Its own class so
 * `apply.mjs` can report it as what it is rather than as a stray TypeError.
 */
export class ThumbError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "ThumbError";
  }
}

/** @param {Video} video @param {string} frame @returns {string} */
function frameUrl(video, frame) {
  return `https://i.ytimg.com/vi/${video.id}/${frame}.jpg`;
}

/**
 * One picture, checked to actually be one.
 *
 * `missing` separates the two kinds of absence a caller cares about. A 404 on
 * `maxresdefault` is the ordinary answer for a video that never had one, so the
 * frame loop wants to try the next name; a 404 on a post's photo is a real
 * failure. Passing the distinction back rather than deciding it here is what
 * lets both callers keep their own policy.
 *
 * @param {string} url
 * @param {typeof globalThis.fetch} fetch
 * @returns {Promise<{ bytes: Buffer } | { missing: true }>}
 */
async function fetchImage(url, fetch) {
  /** @type {Response} */
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    throw new ThumbError(
      `${url} is unreachable — ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
    );
  }

  if (response.status === 404) return { missing: true };
  if (!response.ok) throw new ThumbError(`${url} returned HTTP ${response.status}`);

  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_THUMB_BYTES) {
    throw new ThumbError(`${url} declares ${declared} bytes — too large to commit`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_THUMB_BYTES) {
    throw new ThumbError(`${url} is ${bytes.length} bytes — too large to commit`);
  }
  if (!MAGIC.some((magic) => bytes.subarray(0, magic.length).equals(magic))) {
    throw new ThumbError(`${url} did not answer with an image`);
  }
  return { bytes };
}

/**
 * The best frame the provider has for this video.
 *
 * @param {Video} video
 * @param {typeof globalThis.fetch} fetch
 * @returns {Promise<Buffer>}
 */
async function fetchFrame(video, fetch) {
  /** @type {string[]} */
  const tried = [];

  for (const frame of YOUTUBE_FRAMES) {
    const url = frameUrl(video, frame);
    const answer = await fetchImage(url, fetch);
    if ("bytes" in answer) return answer.bytes;
    tried.push(`${frame} (404)`);
  }

  throw new ThumbError(
    `${video.provider} has no poster frame for ${video.id} — tried ${tried.join(", ")}`,
  );
}

/** @param {Buffer} image @param {number} width @returns {Promise<Buffer>} */
async function encode(image, width) {
  return await sharp(image)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
    .toBuffer();
}

/** @param {Buffer} jpeg @returns {Promise<Buffer>} */
export async function encodeThumb(jpeg) {
  return await encode(jpeg, THUMB_WIDTH);
}

/**
 * Fetch the poster frame, re-encode it, and write it into `outDir`.
 *
 * Same signature shape as `captureSite`: it writes into a scratch directory and
 * hands back the path, and moving the result into `public/shots` is the
 * caller's step. That ordering is what keeps a half-written file out of the
 * gallery — see the crash-point list at the top of `apply.mjs`.
 *
 * @param {object} input
 * @param {Video} input.video
 * @param {string} input.slug
 * @param {string} input.outDir
 * @param {typeof globalThis.fetch} [input.fetch] Injected in tests.
 * @returns {Promise<{ thumb: string }>}
 */
export async function captureThumb({ video, slug, outDir, fetch = globalThis.fetch }) {
  const jpeg = await fetchFrame(video, fetch);

  /** @type {Buffer} */
  let webp;
  try {
    webp = await encodeThumb(jpeg);
  } catch (error) {
    throw new ThumbError(
      `the poster frame for ${video.id} would not encode — ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
    );
  }

  const thumb = path.join(outDir, thumbFileName(slug));
  await writeFile(thumb, webp);
  return { thumb };
}

/**
 * The widest a stored post photo gets. A tweet card is 550px at its measure, so
 * this is the retina copy of one and no more: these are somebody else's
 * pictures being kept for a card, not archived at source resolution.
 */
const MEDIA_WIDTH = 1200;

/**
 * Fetch a post's photos, re-encode them, and write them into `outDir`.
 *
 * Returns the files it wrote AND the web paths for them, in the order the post
 * put them in. That order is the only thing about a set of photos a card has to
 * preserve, and it is why a failure part-way through throws rather than
 * returning what it managed: three of four photos is a card that quietly says
 * something the post did not.
 *
 * Capped at four, which is x.com's own limit. A document claiming more is a
 * document this parser has misread, and fetching them all would be believing it.
 *
 * @param {object} input
 * @param {readonly string[]} input.media  Source URLs, as the document named them.
 * @param {string} input.slug
 * @param {string} input.outDir
 * @param {typeof globalThis.fetch} [input.fetch]
 * @returns {Promise<{ files: string[], paths: string[] }>}
 */
export async function captureMedia({ media, slug, outDir, fetch = globalThis.fetch }) {
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const paths = [];

  for (const [index, url] of media.slice(0, MAX_MEDIA).entries()) {
    const answer = await fetchImage(url, fetch);
    if ("missing" in answer) throw new ThumbError(`${url} is gone (HTTP 404)`);

    /** @type {Buffer} */
    let webp;
    try {
      webp = await encode(answer.bytes, MEDIA_WIDTH);
    } catch (error) {
      throw new ThumbError(
        `${url} would not encode — ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
      );
    }

    const file = path.join(outDir, mediaFileName(slug, index));
    await writeFile(file, webp);
    files.push(file);
    paths.push(mediaWebPath(slug, index));
  }

  return { files, paths };
}
