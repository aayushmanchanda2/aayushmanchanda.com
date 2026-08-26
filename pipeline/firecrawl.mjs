/**
 * firecrawl.mjs — the Firecrawl v2 boundary.
 *
 * Same rule as `raindrop.mjs`, for the same reason: every response is parsed
 * into our own shapes before it leaves this file. Past here there is no
 * `data.markdown`, no `data.screenshot`, and no question of whether a shot came
 * back as a hosted URL or as inline base64 — only a `Post` and a PNG buffer.
 *
 * The pipeline uses Firecrawl for exactly two things, and neither of them is
 * load-bearing:
 *
 *   - `scrapeMarkdown()` reads an x.com post, so a /reading row can say what the
 *     post actually said instead of "A post from @someone", which is all
 *     Raindrop can see from behind the login wall.
 *   - `screenshotFullPage()` is the second chance for a /sites capture that
 *     Playwright could not get — Firecrawl runs from a different network with a
 *     different fingerprint, so a site that bot-blocks the runner sometimes
 *     answers them.
 *
 * "Neither is load-bearing" is the design constraint, not a disclaimer. There is
 * no `FIRECRAWL_API_KEY` outside CI, so a local run has no client at all and
 * must publish exactly what it published before this file existed. Every failure
 * here therefore has to be survivable by the caller, which is why this module
 * throws precise errors and `apply.mjs` is the one that decides they are not
 * fatal.
 */

import { isRecord } from "./util.mjs";

/** @typedef {import("./types.js").Post} Post */

const API_BASE = "https://api.firecrawl.dev/v2";

/**
 * Wall-clock ceiling for one call, and the same 45s `capture.mjs` gives one
 * shot — a page that has not answered in that long is not about to.
 *
 * The number is chosen against the run, not against the request. Every saved
 * post costs one of these, and the workflow has a 30-minute budget it must not
 * be killed inside: `gitCommit` is the last statement of `run()`, so a hard kill
 * loses the whole run's work rather than just the enrichment. At 45s a queue of
 * twenty posts against a Firecrawl that hangs on every single one still finishes
 * inside a quarter of an hour, which leaves the rest of the budget alone.
 */
const REQUEST_TIMEOUT_MS = 45_000;

/**
 * The environment variable this module is configured by. Named once, because
 * `firecrawlFrom()` reading a different string than the workflow sets is the
 * kind of bug that presents as "the feature silently does nothing".
 */
export const API_KEY_ENV = "FIRECRAWL_API_KEY";

/**
 * A Firecrawl call that did not produce what was asked for.
 *
 * `status` is the HTTP status when there was one and null when the failure was
 * local (unreachable host, a body that would not parse, a response missing the
 * field it promised). Firecrawl's documented codes are worth telling apart in
 * the message — 401 means the secret is wrong and 402 means the account is out
 * of credits, and those two need different humans to fix them.
 */
export class FirecrawlError extends Error {
  /** @param {string} message @param {number | null} [status] */
  constructor(message, status = null) {
    super(message);
    this.name = "FirecrawlError";
    /** @type {number | null} */
    this.status = status;
  }
}

/* ---------------------------------------------------------------------------
   The client
   --------------------------------------------------------------------------- */

/**
 * @param {unknown} payload
 * @param {number} status
 * @returns {string}
 */
function errorMessage(payload, status) {
  // `error` is the one field Firecrawl's docs guarantee across every failure
  // shape; `success`, `code` and `details` each appear on some responses and
  // not others, so none of them is worth branching on.
  if (isRecord(payload) && typeof payload["error"] === "string" && payload["error"] !== "") {
    return payload["error"];
  }
  return `HTTP ${status}`;
}

/**
 * @param {object} options
 * @param {string} options.apiKey
 * @param {typeof globalThis.fetch} [options.fetch] Injected in tests.
 * @param {string} [options.baseUrl]
 */
export function createClient({ apiKey, fetch = globalThis.fetch, baseUrl = API_BASE }) {
  /**
   * One POST to `/scrape`, returning the `data` object.
   *
   * @param {Record<string, unknown>} body
   * @param {string} label  What was being asked for, for the error message.
   * @returns {Promise<Record<string, unknown>>}
   */
  async function scrape(body, label) {
    const url = `${baseUrl}/scrape`;

    /** @type {Response} */
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new FirecrawlError(
        `Firecrawl is unreachable for ${label} — ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
      );
    }

    /** @type {unknown} */
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // Left null. A non-JSON body is only interesting as context for the
      // status, and every branch below already has a message for that.
    }

    if (response.status === 401 || response.status === 403) {
      throw new FirecrawlError(
        `Firecrawl rejected ${API_KEY_ENV} (HTTP ${response.status}) — mint a fresh key and update the repo secret.`,
        response.status,
      );
    }
    if (response.status === 402) {
      throw new FirecrawlError(
        "Firecrawl is out of credits (HTTP 402) — top up the account or let the pipeline run without it.",
        402,
      );
    }
    if (!response.ok) {
      throw new FirecrawlError(
        `Firecrawl returned ${errorMessage(payload, response.status)} for ${label}`,
        response.status,
      );
    }

    if (!isRecord(payload)) {
      throw new FirecrawlError(`Firecrawl returned a non-object body for ${label}`);
    }
    // A 200 with `success: false` is a documented shape, not a surprise.
    if (payload["success"] === false) {
      throw new FirecrawlError(
        `Firecrawl refused ${label}: ${errorMessage(payload, response.status)}`,
        response.status,
      );
    }

    const data = payload["data"];
    if (!isRecord(data)) {
      throw new FirecrawlError(`Firecrawl returned no "data" object for ${label}`);
    }
    return data;
  }

  /**
   * The page as markdown.
   *
   * @param {string} url
   * @returns {Promise<string>}
   */
  async function scrapeMarkdown(url) {
    const data = await scrape({ url, formats: ["markdown"] }, `the markdown of ${url}`);

    const markdown = data["markdown"];
    if (typeof markdown !== "string" || markdown.trim() === "") {
      throw new FirecrawlError(`Firecrawl returned no markdown for ${url}`);
    }
    return markdown;
  }

  /**
   * The whole page as a PNG.
   *
   * v2 takes screenshot options on the format object itself. The v1 spelling
   * (`"screenshot@fullPage"`, or a sibling `screenshotOptions`) is gone, and the
   * bare string `"screenshot"` still works but means the viewport only — which
   * would hand back a 900px crop of a page the gallery wants whole.
   *
   * @param {string} url
   * @returns {Promise<Buffer>}
   */
  async function screenshotFullPage(url) {
    const data = await scrape(
      { url, formats: [{ type: "screenshot", fullPage: true }] },
      `a full-page shot of ${url}`,
    );

    const shot = data["screenshot"];
    if (typeof shot !== "string" || shot.trim() === "") {
      throw new FirecrawlError(`Firecrawl returned no screenshot for ${url}`);
    }
    return await toPng(shot.trim(), fetch, url);
  }

  return { scrapeMarkdown, screenshotFullPage };
}

/** @typedef {ReturnType<typeof createClient>} FirecrawlClient */

/**
 * A client, or null when there is no key to build one with.
 *
 * Null is the whole local story: no secret in the environment means no client,
 * which means `apply.mjs` never asks Firecrawl anything and a local run behaves
 * exactly as it did before. The check is on a trimmed value because an empty
 * repo secret arrives as `""`, not as absent.
 *
 * @param {Record<string, string | undefined>} env
 * @param {typeof globalThis.fetch} [fetch]
 * @returns {FirecrawlClient | null}
 */
export function firecrawlFrom(env, fetch = globalThis.fetch) {
  const apiKey = env[API_KEY_ENV];
  if (typeof apiKey !== "string" || apiKey.trim() === "") return null;
  return createClient({ apiKey: apiKey.trim(), fetch });
}

/* ---------------------------------------------------------------------------
   Screenshots arrive in two shapes
   --------------------------------------------------------------------------- */

/** Anything longer than this is not a screenshot we want to commit. */
const MAX_SHOT_BYTES = 40 * 1024 * 1024;

/** Base64 with nothing else in it. Used to tell a payload from a link. */
const BASE64 = /^[A-Za-z0-9+/\s]+={0,2}$/;

/** The eight bytes every PNG starts with. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * The PNG itself, whichever way Firecrawl chose to hand it over.
 *
 * Their docs describe `data.screenshot` as a hosted URL that expires after 24
 * hours, and their older responses inlined a `data:image/png;base64,…` URI.
 * Both are handled rather than picking one and hoping, because the difference is
 * invisible until the day it changes and the whole feature is a fallback nobody
 * is watching.
 *
 * Everything that leaves here has been checked to actually be a PNG, and that
 * check is doing more work than it looks like. `Buffer.from(s, "base64")` will
 * decode almost any English sentence without complaining — so a field holding
 * `"Screenshot unavailable"` would sail past a base64 shape test and leave this
 * module as fifteen junk bytes claiming to be an image. sharp would reject it
 * two calls later with a message about buffer formats, and the run log would
 * blame the encoder for a thing the API said. The boundary is where that has to
 * be caught, or this module's whole promise is void.
 *
 * @param {string} shot
 * @param {typeof globalThis.fetch} fetch
 * @param {string} url  The page the shot is of, for the error message.
 * @returns {Promise<Buffer>}
 */
async function toPng(shot, fetch, url) {
  if (shot.startsWith("data:")) {
    const comma = shot.indexOf(",");
    if (comma === -1) throw new FirecrawlError(`Firecrawl returned a malformed data URI for ${url}`);
    // Only the base64 flavour. A percent-encoded `data:image/png,%89PNG…` is a
    // legal data URI that base64-decoding turns into garbage, so it is refused
    // by name rather than mangled.
    if (!/;base64$/i.test(shot.slice(0, comma))) {
      throw new FirecrawlError(`Firecrawl returned a data URI that is not base64 for ${url}`);
    }
    return checkPng(Buffer.from(shot.slice(comma + 1), "base64"), url, shot);
  }

  if (/^https?:\/\//i.test(shot)) {
    /** @type {Response} */
    let response;
    try {
      response = await fetch(shot, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
      throw new FirecrawlError(
        `Firecrawl's screenshot for ${url} could not be downloaded — ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
      );
    }
    if (!response.ok) {
      throw new FirecrawlError(
        `Firecrawl's screenshot for ${url} returned HTTP ${response.status} — the link expires after 24 hours`,
        response.status,
      );
    }

    // Asked before the body is read, so an oversized response is refused rather
    // than merely reported. The check after the read is still the backstop: the
    // header is advisory and may not be there at all.
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_SHOT_BYTES) {
      throw new FirecrawlError(`Firecrawl's screenshot for ${url} declares ${declared} bytes — too large to commit`);
    }

    return checkPng(Buffer.from(await response.arrayBuffer()), url, shot);
  }

  if (BASE64.test(shot)) return checkPng(Buffer.from(shot, "base64"), url, shot);

  throw new FirecrawlError(`Firecrawl returned a screenshot that is neither a URL nor base64 for ${url}`);
}

/**
 * @param {Buffer} bytes @param {string} url
 * @param {string} raw  What the field held, so the error can quote it.
 * @returns {Buffer}
 */
function checkPng(bytes, url, raw) {
  if (bytes.length > MAX_SHOT_BYTES) {
    throw new FirecrawlError(`Firecrawl's screenshot for ${url} is ${bytes.length} bytes — too large to commit`);
  }
  if (!bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    // The quote is the whole point of the message: this fires when the field
    // held something that was never an image, and the first thing anyone will
    // want to know is what it actually said.
    throw new FirecrawlError(
      `Firecrawl's screenshot for ${url} is not a PNG — the field held ${JSON.stringify(raw.slice(0, 40))}`,
    );
  }
  return bytes;
}

/* ---------------------------------------------------------------------------
   Reading an x.com post out of the markdown
   --------------------------------------------------------------------------- */

/**
 * Firecrawl post-processes x.com and twitter.com into a small, stable document
 * rather than the app shell a raw scrape would return:
 *
 *   # Post by @handle
 *   **Author:** Some Name (@handle)
 *   **Posted:** 2026-08-24
 *   ## Post
 *   the words the person actually wrote
 *   ## Engagement
 *   …
 *
 * The parse below is deliberately loose about where it finds the handle and
 * strict about where it finds the words. A handle can be recovered from the URL
 * if the heading ever changes shape, but there is no second source for the post
 * text — so `## Post` is required, and its absence is what makes this function
 * return null instead of guessing. Null is a supported answer all the way up:
 * the row publishes with Raindrop's own title, exactly as it did before.
 */

/** x.com handles: letters, digits, underscore, 15 at most. */
const HANDLE = "[A-Za-z0-9_]{1,15}";

const HEADING_HANDLE = new RegExp(`^#{0,3}[ \\t]*Post by @(${HANDLE})\\b`, "im");
// `.*?` and nothing before it. A `\s*` here would be a second way to match the
// same run of spaces, and two ways to match one thing is how a linear regex
// becomes a quadratic one on input this module does not control.
const AUTHOR_HANDLE = new RegExp(`^\\**Author\\**:?.*?@(${HANDLE})\\b`, "im");

/** The body heading, and whatever heading ends it. */
const POST_HEADING = /^#{1,3}\s+Post\s*$/im;
const NEXT_HEADING = /^#{1,3}\s+\S/m;

/**
 * x.com paths whose first segment is the site's own routing rather than a
 * person. `x.com/i/web/status/123` is the one that actually turns up, and
 * attributing that post to "@i" would be worse than not attributing it at all.
 */
const NOT_A_HANDLE = new Set(["i", "home", "search", "intent", "notifications", "messages"]);

/**
 * The handle in the URL itself: `x.com/<handle>/status/<id>`.
 *
 * @param {string} url @returns {string | null}
 */
function handleFromUrl(url) {
  try {
    const [first] = new URL(url).pathname.split("/").filter((part) => part !== "");
    if (first === undefined || NOT_A_HANDLE.has(first.toLowerCase())) return null;
    return new RegExp(`^${HANDLE}$`).test(first) ? first : null;
  } catch {
    return null;
  }
}

/**
 * Markdown decoration out, one line of prose in.
 *
 * Images go entirely (a post's own media is not something a one-line note can
 * show), links keep their text, and the rest collapses to single spaces because
 * the destination is a single row on a page, not a document.
 *
 * @param {string} body @returns {string}
 */
function flatten(body) {
  return (
    body
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // `[ \t]`, never `\s`. A blockquote marker is a per-line thing, and `\s`
      // matches a newline — which makes `^\s*` rescan to the end of the document
      // from every single line start, turning this into a quadratic walk over
      // markdown nobody here controls. A quote-tweet arrives as blockquotes, so
      // this line is on the ordinary path, not an exotic one.
      .replace(/^[ \t]*>[ \t]?/gm, "")
      .replace(/\*\*(.+?)\*\*/gs, "$1")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Something a person could read. Punctuation and decoration alone is not. */
const HAS_WORDS = /[\p{L}\p{N}]/u;

/**
 * What the post says, or null if this markdown does not contain a post.
 *
 * @param {unknown} markdown  Whatever came back; a non-string is a null answer.
 * @param {string} url        The post's URL, as a second source for the handle.
 * @returns {Post | null}
 */
export function parsePost(markdown, url) {
  if (typeof markdown !== "string") return null;

  const heading = POST_HEADING.exec(markdown);
  if (heading === null) return null;

  const after = markdown.slice(heading.index + heading[0].length);
  const ends = NEXT_HEADING.exec(after);
  const text = flatten(ends === null ? after : after.slice(0, ends.index));
  // Not just non-empty: a body that survives flattening as `**` or `...` is a
  // parse that found the section and nothing in it, and it would go on to become
  // a /reading row whose entire link text is punctuation.
  if (!HAS_WORDS.test(text)) return null;

  const handle =
    HEADING_HANDLE.exec(markdown)?.[1] ?? AUTHOR_HANDLE.exec(markdown)?.[1] ?? handleFromUrl(url);
  if (handle === null || handle === undefined) return null;

  return { handle, text };
}
