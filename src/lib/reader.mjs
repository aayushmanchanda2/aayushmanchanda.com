/**
 * The caps on what a /library entry says about its source (VET-233, VET-246):
 * the TLDR, the highlights and the excerpt.
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
