/**
 * state.mjs — `pipeline/state.json`, and the convergence step that repairs it.
 *
 * The pipeline writes three things per item: image files, a JSON entry, and a
 * state row. A crash can land between any two of them, and no ordering makes
 * all three land together. So instead of pretending the write is atomic, the
 * run starts by making the three agree again.
 *
 * `reconcile()` is that step. It runs before any network write, it is pure with
 * respect to Raindrop, and it can run twice with the same result:
 *
 *   - a `published` row whose entry has vanished from the gallery goes back to
 *     `pending`, so the next plan re-does the work
 *   - a shot file no entry points at is deleted, because it is the residue of a
 *     crash between "move the shots" and "append the entry"
 *   - `pipeline/tmp/` is wiped, because a half-captured directory is never
 *     worth resuming
 *
 * The mirrored rule — a gallery entry with no state row — cannot be settled
 * here: state rows are keyed by Raindrop id, and an entry on disk does not
 * carry one. `plan()` closes that gap by matching a bookmark's URL against the
 * gallery, which is the only place both facts are in hand at once.
 */

import { readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { SHOT_FILE, isRecord, readEntries, shotFilesOf } from "./entries.mjs";

/** @typedef {import("./types.js").ItemState} ItemState */
/** @typedef {import("./types.js").Paths} Paths */
/** @typedef {import("./types.js").ReconcileReport} ReconcileReport */
/** @typedef {import("./types.js").Section} Section */
/** @typedef {import("./types.js").StateMap} StateMap */

/** Three tries, then the item is somebody's problem, not the cron's. */
export const MAX_ATTEMPTS = 3;

/**
 * Every path the pipeline touches, from the repo root.
 *
 * @param {string} root
 * @returns {Paths}
 */
export function resolvePaths(root) {
  return {
    root,
    statePath: path.join(root, "pipeline", "state.json"),
    sitesJson: path.join(root, "src", "data", "sites.json"),
    toolsJson: path.join(root, "src", "data", "tools.json"),
    shotsDir: path.join(root, "public", "shots"),
    tmpDir: path.join(root, "pipeline", "tmp"),
  };
}

/** @param {Paths} paths @param {Section} section @returns {string} */
export function galleryFor(paths, section) {
  switch (section) {
    case "sites":
      return paths.sitesJson;
    case "tools":
      return paths.toolsJson;
    default: {
      const never = /** @type {never} */ (section);
      throw new Error(`unknown section ${JSON.stringify(never)}`);
    }
  }
}

/* ---------------------------------------------------------------------------
   The state file
   --------------------------------------------------------------------------- */

/**
 * One row, validated. An unreadable row is dropped rather than fatal: state is
 * a cache of decisions, and losing one row costs a re-publish, while throwing
 * would wedge every future run behind a hand edit.
 *
 * @param {unknown} value
 * @returns {ItemState | null}
 */
function parseItemState(value) {
  if (!isRecord(value)) return null;

  const attempts = typeof value["attempts"] === "number" ? value["attempts"] : 0;
  const at = typeof value["at"] === "string" ? value["at"] : "";
  const lastError = typeof value["lastError"] === "string" ? value["lastError"] : undefined;

  switch (value["kind"]) {
    case "published": {
      const slug = value["slug"];
      const section = value["section"];
      if (typeof slug !== "string" || (section !== "tools" && section !== "sites")) return null;
      return { kind: "published", slug, section, at };
    }
    case "failed":
      return { kind: "failed", attempts, lastError: lastError ?? "unknown", at };
    case "pending":
      return lastError === undefined
        ? { kind: "pending", attempts }
        : { kind: "pending", attempts, lastError };
    default:
      return null;
  }
}

/**
 * @param {Paths} paths
 * @returns {Promise<StateMap>}
 */
export async function loadState(paths) {
  /** @type {string} */
  let text;
  try {
    text = await readFile(paths.statePath, "utf8");
  } catch (error) {
    if (isRecord(error) && error["code"] === "ENOENT") return {};
    throw error;
  }

  /** @type {unknown} */
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${paths.statePath} is not valid JSON: ${String(error)}`);
  }

  if (!isRecord(value)) throw new Error(`${paths.statePath} must hold a JSON object`);

  /** @type {StateMap} */
  const state = {};
  for (const [id, row] of Object.entries(value)) {
    const parsed = parseItemState(row);
    if (parsed !== null) state[id] = parsed;
  }
  return state;
}

/**
 * Write-then-rename, and sorted by id so a diff of this file reads as a list of
 * changes rather than a reshuffle.
 *
 * @param {Paths} paths
 * @param {StateMap} state
 */
export async function saveState(paths, state) {
  /** @type {StateMap} */
  const sorted = {};
  for (const id of Object.keys(state).sort()) sorted[id] = state[id];

  const staging = `${paths.statePath}.staging`;
  await writeFile(staging, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  await rename(staging, paths.statePath);
}

/* ---------------------------------------------------------------------------
   Convergence
   --------------------------------------------------------------------------- */

/**
 * Make state, galleries and `public/shots` agree, then report what it took.
 *
 * @param {object} options
 * @param {Paths} options.paths
 * @param {boolean} [options.dryRun] Report the repairs, change nothing.
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<ReconcileReport>}
 */
export async function reconcile({ paths, dryRun = false, log = () => {} }) {
  const state = await loadState(paths);
  const sites = await readEntries(paths.sitesJson);
  const tools = await readEntries(paths.toolsJson);

  /** @type {Record<Section, Set<string>>} */
  const slugs = {
    sites: new Set(sites.map((entry) => String(entry["slug"]))),
    tools: new Set(tools.map((entry) => String(entry["slug"]))),
  };

  /** @type {string[]} */
  const downgraded = [];

  for (const [id, row] of Object.entries(state)) {
    if (row.kind !== "published") continue;
    if (slugs[row.section].has(row.slug)) continue;

    downgraded.push(id);
    log(
      `reconcile: ${id} claims ${row.section}/${row.slug}, which is not in the gallery — back to pending`,
    );
    // Mutated even on a dry run: the returned map is what `plan()` reasons
    // about, and a dry run that planned against stale rows would report a
    // different run than the real one. `dryRun` guards the disk, not memory.
    state[id] = {
      kind: "pending",
      attempts: 0,
      lastError: `entry ${row.section}/${row.slug} disappeared from the gallery`,
    };
  }

  // Only sites carry shots, so only sites can vouch for a file in the shots dir.
  const referenced = new Set(sites.flatMap((entry) => shotFilesOf(entry)));

  /** @type {string[]} */
  let present = [];
  try {
    present = await readdir(paths.shotsDir);
  } catch (error) {
    if (!isRecord(error) || error["code"] !== "ENOENT") throw error;
  }

  /** @type {string[]} */
  const orphans = [];

  for (const file of present) {
    // The naming convention is the ownership boundary: a file that does not
    // look like something this pipeline wrote is left where it is.
    if (!SHOT_FILE.test(file)) continue;
    if (referenced.has(file)) continue;

    orphans.push(file);
    log(`reconcile: ${file} belongs to no entry — deleting`);
    if (!dryRun) await rm(path.join(paths.shotsDir, file), { force: true });
  }

  if (!dryRun) {
    await rm(paths.tmpDir, { recursive: true, force: true });
    if (downgraded.length > 0) await saveState(paths, state);
  }

  return { state, downgraded, orphans };
}
