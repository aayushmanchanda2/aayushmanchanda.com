/**
 * util.mjs — the helpers the pipeline kept rewriting.
 *
 * Deliberately the only module in `pipeline/` that knows nothing about
 * bookmarks, galleries, shots or state. Everything here is about JavaScript or
 * the filesystem, not about publishing: a plain-object check, a thrown thing as
 * a line of text, a file replaced in one step, and a bounded worker pool. That
 * is why `raindrop.mjs` is allowed to import them without breaking its own rule
 * about staying a boundary — importing a `typeof` check is not importing the
 * domain.
 *
 * Every one of them existed as copies first. Identical copies are not a
 * problem until one of them is edited.
 */

import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

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

/**
 * Replace a file in one step: write `<file>.tmp` beside it, then rename.
 *
 * A torn gallery or state file fails every later build and no reconcile rule
 * can repair one, and a half-written icon is a broken image; `rename` within a
 * directory is atomic on every filesystem this runs on. A failed write removes
 * its `.tmp`, and `.gitignore` refuses `*.tmp` in case a killed process leaves
 * one behind.
 *
 * @param {string} file
 * @param {string | Uint8Array} data  A string is written as UTF-8.
 */
export async function writeAtomic(file, data) {
  const staging = `${file}.tmp`;
  await mkdir(path.dirname(file), { recursive: true });
  try {
    await writeFile(staging, data);
    await rename(staging, file);
  } catch (error) {
    await rm(staging, { force: true });
    throw error;
  }
}

/**
 * Run `fn` over every item, at most `n` at once, and wait for all of them.
 *
 * The backfills' pool: a worker takes the next item as soon as it finishes
 * one, so a slow site holds up one lane, not a batch. `fn` handles its own
 * failures; a throw rejects the whole run.
 *
 * @template T
 * @param {readonly T[]} items
 * @param {(item: T) => Promise<unknown>} fn
 * @param {number} n
 * @returns {Promise<void>}
 */
export async function backfill(items, fn, n) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(/** @type {T} */ (items[next++]));
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}
