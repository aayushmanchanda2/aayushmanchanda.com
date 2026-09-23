/**
 * The caps on what a /library entry says about its source (VET-233, VET-246):
 * the TLDR, the highlights and the excerpt; since VET-264 a post's highlights,
 * its keyline and a video's moments.
 *
 * Plain JS so one set of rules serves both writers: `lib/library.ts` refuses a
 * bad entry at build, and `pipeline/patch.mjs` refuses it before Hermes writes
 * it. The caps are the copyright line as much as a style one. The site quotes a
 * third-party piece; it never republishes it.
 *
 * Every function throws a plain `Error` whose message names the field, and the
 * caller wraps it in its own error type.
 */

export const CAPS = { tldr: 25, highlights: 5, highlight: 60, note: 25, excerpt: 80 };

/** Amber is the default and the one `--highlight` has always been. */
export const COLORS = /** @type {const} */ (["amber", "blue", "pink", "green"]);

/** @typedef {(typeof COLORS)[number]} Color */
/** @typedef {{ text: string, note?: string, color?: Color }} Highlight */

/** @param {string} text */
export const words = (text) => text.split(/\s+/).filter((word) => word !== "").length;

/**
 * A trimmed string of at most `cap` words with no em dash in it.
 * @param {unknown} value @param {string} field @param {number} cap @returns {string}
 */
export function prose(value, field, cap) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`"${field}" has to be a non-empty string (got ${JSON.stringify(value)})`);
  }
  if (value.includes("—")) throw new Error(`"${field}" has an em dash in it`);
  const count = words(value);
  if (count > cap) throw new Error(`"${field}" is ${count} words; the cap is ${cap}`);
  return value.trim();
}

/** @param {unknown} value @returns {value is Color} */
function isColor(value) {
  return typeof value === "string" && COLORS.some((color) => color === value);
}

/**
 * One to five quoted passages. Absent `note` and `color` stay absent, so a
 * patch writes the file the way a hand-edit would.
 * @param {unknown} value @returns {Highlight[]}
 */
export function highlights(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > CAPS.highlights) {
    throw new Error(`"highlights" has to be a list of 1 to ${CAPS.highlights} passages`);
  }
  return value.map((item, index) => {
    const at = `highlights[${index}]`;
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`"${at}" has to be an object with a "text"`);
    }
    /** @type {Highlight} */
    const out = { text: prose(item.text, `${at}.text`, CAPS.highlight) };
    if (item.note !== undefined && item.note !== null) out.note = prose(item.note, `${at}.note`, CAPS.note);
    if (item.color !== undefined && item.color !== null) {
      if (!isColor(item.color)) {
        throw new Error(`"${at}.color" has to be one of ${COLORS.join(", ")} (got ${JSON.stringify(item.color)})`);
      }
      out.color = item.color;
    }
    return out;
  });
}

/** A post quotes itself, so its passages are shorter and must be its own words (VET-264). */
export const POST_CAPS = { highlights: 3, highlight: 25, keyline: 15, moments: 4, moment: 30 };

/** @param {string} quote @param {string} text @param {string} field */
function verbatim(quote, text, field) {
  if (!text.includes(quote)) throw new Error(`"${field}" is not word for word in the post`);
  return quote;
}

/**
 * A plain post's highlights: the article shape under the post caps, each one
 * an exact substring of the post's text. An X Article keeps the article caps,
 * because its body is quoted rather than shown.
 * @param {unknown} value @param {string} text @returns {Highlight[]}
 */
export function postHighlights(value, text) {
  const list = highlights(value);
  if (list.length > POST_CAPS.highlights) {
    throw new Error(`"highlights" on a post is at most ${POST_CAPS.highlights} passages`);
  }
  list.forEach((item, index) => {
    prose(item.text, `highlights[${index}].text`, POST_CAPS.highlight);
    verbatim(item.text, text, `highlights[${index}].text`);
  });
  return list;
}

/** The one line a short post marks inline. @param {unknown} value @param {string} text */
export function keyline(value, text) {
  return verbatim(prose(value, "keyline", POST_CAPS.keyline), text, "keyline");
}

/** @typedef {{ t: number, text: string, source_video_id?: string }} Moment */

/**
 * A video's key moments: up to four, each a timestamp in whole seconds and a
 * short point. `source_video_id` names the video the time belongs to when the
 * entry is a playlist and has no video of its own.
 * @param {unknown} value @returns {Moment[]}
 */
export function moments(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > POST_CAPS.moments) {
    throw new Error(`"moments" has to be a list of 1 to ${POST_CAPS.moments} moments`);
  }
  return value.map((item, index) => {
    const at = `moments[${index}]`;
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`"${at}" has to be an object with a "t" and a "text"`);
    }
    if (!Number.isInteger(item.t) || item.t < 0) {
      throw new Error(`"${at}.t" has to be whole seconds (got ${JSON.stringify(item.t)})`);
    }
    /** @type {Moment} */
    const out = { t: item.t, text: prose(item.text, `${at}.text`, POST_CAPS.moment) };
    if (item.source_video_id !== undefined) {
      if (typeof item.source_video_id !== "string" || !/^[\w-]{11}$/.test(item.source_video_id)) {
        throw new Error(`"${at}.source_video_id" has to be a YouTube video id`);
      }
      out.source_video_id = item.source_video_id;
    }
    return out;
  });
}

/** 95 → "1:35", 3725 → "1:02:05". @param {number} t */
export function clock(t) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(t % 60)}` : `${m}:${pad(t % 60)}`;
}

/** The moment on YouTube itself. @param {string} id @param {number} t */
export const watchAt = (id, t) => `https://www.youtube.com/watch?v=${id}&t=${t}s`;

/** Where a block's time comes from: the source said it, or we guessed. */
export const TIME_SOURCES = /** @type {const} */ (["stated", "estimate"]);

/** The most "Start here" steps a block carries. */
export const START_MAX = 3;

/**
 * @typedef {{
 *   best_for: string, tip: string,
 *   time?: { text: string, source: (typeof TIME_SOURCES)[number] },
 *   needs: string[],
 *   prompt?: { text: string, ours: boolean },
 *   start_here: string[],
 * }} Block
 */

/** @param {unknown} value @param {string} at @returns {Record<string, unknown>} */
function object(value, at) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`"${at}" has to be an object`);
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {unknown} value @param {string} at @param {number} min @param {number} max */
function lines(value, at, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new Error(`"${at}" has to be a list of ${min} to ${max} lines`);
  }
  return value.map((item, index) => {
    if (typeof item === "string" && item.includes("\n")) throw new Error(`"${at}[${index}]" has to be one line`);
    return prose(item, `${at}[${index}]`, Infinity);
  });
}

/**
 * The block on a library entry (VET-273): who it is for, the tip, what it
 * takes, a prompt to copy, and where to start. `time` and `prompt` are
 * optional; absent or null stays absent, so a patch writes what a hand-edit
 * would. Every string is non-empty and has no em dash.
 * @param {unknown} value @returns {Block}
 */
export function block(value) {
  const raw = object(value, "block");
  /** @type {Block["time"]} */
  let time;
  if (raw.time != null) {
    const at = object(raw.time, "block.time");
    const source = TIME_SOURCES.find((name) => name === at.source);
    if (!source) throw new Error(`"block.time.source" has to be one of ${TIME_SOURCES.join(", ")}`);
    time = { text: prose(at.text, "block.time.text", Infinity), source };
  }
  /** @type {Block["prompt"]} */
  let prompt;
  if (raw.prompt != null) {
    const at = object(raw.prompt, "block.prompt");
    if (typeof at.ours !== "boolean") throw new Error(`"block.prompt.ours" has to be true or false`);
    prompt = { text: prose(at.text, "block.prompt.text", Infinity), ours: at.ours };
  }
  return {
    best_for: prose(raw.best_for, "block.best_for", Infinity),
    tip: prose(raw.tip, "block.tip", Infinity),
    ...(time && { time }),
    needs: lines(raw.needs, "block.needs", 0, 12),
    ...(prompt && { prompt }),
    start_here: lines(raw.start_here, "block.start_here", 1, START_MAX),
  };
}
