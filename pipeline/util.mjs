/**
 * util.mjs — the two language-level helpers the pipeline kept rewriting.
 *
 * Deliberately the only module in `pipeline/` that knows nothing about
 * bookmarks, galleries, shots or state. Both functions here are about
 * JavaScript, not about publishing: one asks whether a value is a plain object,
 * the other turns a thrown thing into a line of text. That is why `raindrop.mjs`
 * is allowed to import them without breaking its own rule about staying a
 * boundary — importing a `typeof` check is not importing the domain.
 *
 * There were six copies between them, all identical, spread across five files.
 * Identical copies are not a problem until one of them is edited.
 */

/**
 * A plain object: something whose keys can be read with `value["key"]`.
 *
 * Arrays are excluded on purpose. Every caller here is asking "did I get the
 * JSON object I expected", and an array would pass a bare `typeof` check and
 * then read `undefined` out of every field.
 *
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * One line describing a thrown value, whatever it turned out to be.
 *
 * First line only: a Playwright failure carries a stack and a page of context,
 * and this string ends up in a state row, a log line, and a Raindrop tag. The
 * detail is worth having in none of those places.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function describe(error) {
  if (error instanceof Error) return error.message.split("\n")[0];
  return String(error);
}
