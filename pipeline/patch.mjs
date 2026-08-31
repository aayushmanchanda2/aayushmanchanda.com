/**
 * patch.mjs — the only way a published /library entry changes.
 *
 * There are two writers on this file and exactly one line between them.
 * Raindrop is an entry's source right up until it is published: the bookmark is
 * still there, the sweep can still rewrite its tags and its private note, and
 * the next run reads all of it. After publish that stops being true — the run
 * skips anything already in the gallery, so an edit made in Raindrop lands
 * nowhere and looks like it worked. This module is what happens instead.
 *
 * The discriminator is a fact anyone can check rather than a convention anyone
 * can forget: the bookmark carries the `published` tag the pipeline wrote. Not
 * published, edit Raindrop. Published, run this. There is no third state, no
 * queue file, and no window in which both are true.
 *
 * ONE verb, and everything else is behind it. A caller says which entry and
 * what to change; finding the entry, folding tags into slugs, refusing a
 * half-written digest, writing the file without ever leaving it torn, and
 * getting the commit onto the remote are all in here. The point of hiding all
 * of that is that the next caller — a Telegram one-liner, a slash command, a
 * script nobody has written yet — gets the same guarantees without knowing this
 * file exists beyond its name.
 *
 * The laptop is load-bearing here, and that is a real cost rather than an
 * oversight. This runs where the git checkout is, which means an override made
 * from a phone travels through a machine at home. That is the same deal
 * `publish_digest.py` already takes, it is human-triggered, it happens rarely,
 * and the alternative is a service holding a write token to this repo.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { collectionsFrom, readEntries, urlKey, writeEntries } from "./entries.mjs";
import { resolvePaths } from "./state.mjs";
import { isRecord } from "./util.mjs";

/** @typedef {import("./types.js").Paths} Paths */
/** @typedef {import("./types.js").Patch} Patch */

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Every field a patch may touch, in the order the entry writes them. */
const FIELDS = ["tags", "note", "why", "draft", "digest"];

/**
 * A patch that cannot be applied: no such entry, two entries, a field that is
 * not the shape it claims. Never a git failure — those say so in their own
 * words, because "the push was rejected" and "your digest has no verdict" need
 * different things done about them.
 */
export class PatchError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "PatchError";
  }
}

/* ---------------------------------------------------------------------------
   Finding the entry
   --------------------------------------------------------------------------- */

/**
 * The index of the entry a patch names, or a `PatchError` naming why not.
 *
 * By slug when given one, and otherwise by the same `urlKey` the publish run
 * dedupes with — so the link pasted back out of Raindrop, off a phone share
 * sheet, or out of the address bar all find the same row even though they are
 * three different strings. Matching on the raw URL would send half of those to
 * "no entry found" while the entry sat right there.
 *
 * @param {Record<string, unknown>[]} entries @param {Patch} patch
 * @returns {number}
 */
function findEntry(entries, patch) {
  const { slug, url } = patch;

  if (typeof slug === "string" && slug !== "") {
    const index = entries.findIndex((entry) => entry["slug"] === slug);
    if (index === -1) throw new PatchError(`no /library entry has the slug "${slug}"`);
    return index;
  }

  if (typeof url !== "string" || url.trim() === "") {
    throw new PatchError("a patch has to name an entry, by --slug or by --url");
  }

  const key = urlKey(url);
  const matches = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => typeof entry["url"] === "string" && urlKey(entry["url"]) === key);

  const first = matches[0];
  if (first === undefined) throw new PatchError(`no /library entry points at ${url}`);
  if (matches.length > 1) {
    // Two rows one link resolves to means the gallery has a duplicate, and
    // picking one of them would half-apply the edit and hide the duplicate.
    throw new PatchError(
      `${matches.length} /library entries point at ${url} (${matches
        .map(({ entry }) => String(entry["slug"]))
        .join(", ")}) — patch one by --slug`,
    );
  }
  return first.index;
}

/* ---------------------------------------------------------------------------
   Normalising and refusing
   --------------------------------------------------------------------------- */

/**
 * The value a field should hold after the patch, or `undefined` for "the patch
 * did not mention this one".
 *
 * `null` is a real, different answer everywhere here: it clears the field. That
 * distinction is the difference between "leave the note alone" and "delete the
 * note", and collapsing the two is how a patch that only meant to add a tag
 * silently blanks a sentence.
 *
 * @param {string} field @param {unknown} value @returns {unknown}
 */
function normalise(field, value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  switch (field) {
    case "tags":
      return normaliseTags(value);
    case "note":
    case "why":
      return normaliseSentence(field, value);
    case "draft":
      return normaliseDraft(value);
    case "digest":
      return normaliseDigest(value);
    default:
      throw new PatchError(`"${field}" is not a field a patch can set`);
  }
}

/** @param {unknown} value @returns {string[] | null} */
function normaliseTags(value) {
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    throw new PatchError("tags have to be a list of strings");
  }
  // The same fold the publish run applies, so a tag typed here and the same tag
  // typed in Raindrop cannot become two collections with one route between them.
  const tags = collectionsFrom(value);
  // Empty is `null`, not `[]`: `library.ts` refuses a present-but-empty array,
  // so "remove every tag" has to be spelled as removing the key.
  return tags.length === 0 ? null : tags;
}

/** @param {string} field @param {unknown} value @returns {string} */
function normaliseSentence(field, value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PatchError(`"${field}" has to be a sentence, or null to clear it`);
  }
  return value.trim();
}

/** One non-empty line. @param {unknown} value @param {string} where */
function line(value, where) {
  if (typeof value !== "string" || value.trim() === "" || value.includes("\n")) {
    throw new PatchError(`${where} has to be one non-empty line (got ${JSON.stringify(value)})`);
  }
  return value.trim();
}

/**
 * A draft keeps the rule `library.ts › readDraft` holds it to: bullets or a why
 * or both, never neither, and a date that is a date.
 *
 * @param {unknown} value @returns {Record<string, unknown>}
 */
function normaliseDraft(value) {
  if (!isRecord(value)) throw new PatchError("a draft has to be an object, or null to clear it");

  const raw = value["bullets"];
  /** @type {string[] | null} */
  let bullets = null;
  if (raw !== undefined && raw !== null) {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new PatchError("a draft's bullets have to be a non-empty list");
    }
    bullets = raw.map((bullet) => line(bullet, "a draft bullet"));
  }

  const rawWhy = value["why"];
  const why =
    rawWhy === undefined || rawWhy === null ? null : normaliseSentence("draft.why", rawWhy);

  if (bullets === null && why === null) {
    throw new PatchError("a draft with neither bullets nor a why is written as null");
  }

  return {
    bullets,
    why,
    drafted: date(value["drafted"], "a draft's drafted"),
  };
}

/**
 * A digest is all four fields or it is not a digest.
 *
 * The strictest refusal in this file, and the one worth being strict about. A
 * digest is what earns an entry its detail page, so a patch that lands three
 * quarters of one would publish a page built around a verdict nobody wrote.
 *
 * @param {unknown} value @returns {Record<string, unknown>}
 */
function normaliseDigest(value) {
  if (!isRecord(value)) throw new PatchError("a digest has to be an object, or null to clear it");

  const raw = value["bullets"];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new PatchError("a digest needs bullets — all four fields, or none");
  }

  return {
    bullets: raw.map((bullet) => line(bullet, "a digest bullet")),
    verdict: normaliseSentence("digest.verdict", value["verdict"]),
    why: normaliseSentence("digest.why", value["why"]),
    digested: date(value["digested"], "a digest's digested"),
  };
}

/** Shape AND reality: `2026-02-31` is neither. @param {unknown} value @param {string} where */
function date(value, where) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new PatchError(`${where} has to be a YYYY-MM-DD date (got ${JSON.stringify(value)})`);
  }
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new PatchError(`${where} is not a day that exists: ${value}`);
  }
  return value;
}

/* ---------------------------------------------------------------------------
   git
   --------------------------------------------------------------------------- */

/**
 * `git`, in the repo, with the same three-stream setup `publish.mjs` uses.
 * @param {string} root @returns {(args: string[]) => string}
 */
function gitIn(root) {
  return (args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * Commit the one file and get it onto the remote, or say precisely how far it
 * got.
 *
 * A push race is the expected failure, not a surprise: the publish workflow
 * pushes to this branch on a schedule, so a patch made while a run is finishing
 * lands on a ref that moved. Rebase and try once more, and if the second push
 * fails too, stop. The commit is still made and still local, and the message
 * says exactly that — "committed, not pushed" is a state a person can finish by
 * hand, and a loop that kept retrying would hide a real problem behind noise.
 *
 * @param {object} input
 * @param {string} input.root
 * @param {string} input.file    Path to stage, relative to the root.
 * @param {string} input.message
 * @param {(line: string) => void} input.log
 * @param {(args: string[]) => string} [input.git] Injected in tests.
 * @returns {boolean} Whether the commit reached the remote.
 */
export function commitAndPush({ root, file, message, log, git = gitIn(root) }) {
  git(["add", "--", file]);
  if (git(["diff", "--cached", "--name-only"]).trim() === "") {
    log("patch: the file already said that — nothing committed");
    return false;
  }
  git(["commit", "-m", message]);

  for (const attempt of [1, 2]) {
    try {
      git(["push"]);
      return true;
    } catch (error) {
      if (attempt === 2) {
        log(
          `patch: committed, not pushed — ${describeGit(error)}. ` +
            "The edit is in the local history; push it by hand.",
        );
        return false;
      }
      log("patch: the remote moved — rebasing and pushing once more");
      try {
        git(["pull", "--rebase"]);
      } catch (rebaseError) {
        log(
          `patch: committed, not pushed — the rebase failed (${describeGit(rebaseError)}). ` +
            "The edit is in the local history; sort the branch out by hand.",
        );
        return false;
      }
    }
  }
  return false;
}

/** git writes the useful part to stderr. @param {unknown} error @returns {string} */
function describeGit(error) {
  if (isRecord(error) && typeof error["stderr"] === "string" && error["stderr"].trim() !== "") {
    return error["stderr"].trim().split("\n").slice(-1)[0] ?? "git failed";
  }
  return error instanceof Error ? error.message.split("\n")[0] : String(error);
}

/* ---------------------------------------------------------------------------
   The verb
   --------------------------------------------------------------------------- */

/**
 * Apply one patch to `src/data/library.json`.
 *
 * @param {object} input
 * @param {Patch} input.patch
 * @param {Paths} [input.paths]
 * @param {(line: string) => void} [input.log]
 * @param {boolean} [input.commit] Off in tests, and for a dry look at the diff.
 * @param {(args: string[]) => string} [input.git]
 * @returns {Promise<{ slug: string, changed: string[], pushed: boolean }>}
 */
export async function patchLibrary({
  patch,
  paths = resolvePaths(REPO_ROOT),
  log = (line) => console.log(line),
  commit = true,
  git,
}) {
  const entries = await readEntries(paths.libraryJson);
  const index = findEntry(entries, patch);
  const before = entries[index];
  if (before === undefined) throw new PatchError("the entry vanished between finding and reading it");

  /** @type {Record<string, unknown>} */
  const after = { ...before };
  /** @type {string[]} */
  const changed = [];

  for (const field of FIELDS) {
    const value = normalise(field, /** @type {Record<string, unknown>} */ (patch)[field]);
    if (value === undefined) continue;

    // Cleared fields lose the key rather than gaining a `null`, which is how
    // every other optional field in these files spells "nothing". `library.ts`
    // reads both the same; the file stays readable.
    if (value === null) {
      if (!(field in after)) continue;
      delete after[field];
    } else {
      if (JSON.stringify(after[field]) === JSON.stringify(value)) continue;
      after[field] = value;
    }
    changed.push(field);
  }

  const slug = String(before["slug"]);
  if (changed.length === 0) {
    log(`patch: ${slug} already said that — nothing to write`);
    return { slug, changed, pushed: false };
  }

  const next = [...entries];
  next[index] = after;
  // Write-then-rename, the same as every other gallery write: a torn
  // library.json fails every later build and no reconcile rule can repair one.
  await writeEntries(paths.libraryJson, next);
  log(`patch: ${slug} — ${changed.join(", ")}`);

  if (!commit) return { slug, changed, pushed: false };

  const pushed = commitAndPush({
    root: paths.root,
    file: "src/data/library.json",
    message: `library: ${slug} — ${changed.join(", ")}`,
    log,
    git,
  });
  return { slug, changed, pushed };
}

/* ---------------------------------------------------------------------------
   CLI
   --------------------------------------------------------------------------- */

const USAGE = [
  "usage: node pipeline/patch.mjs (--url <url> | --slug <slug>) [edits]",
  "",
  "  --tags a,b,c      replace the tags; --tags '' removes them",
  "  --note <text>     replace the note; --note '' removes it",
  "  --why <text>      replace Aayush's why; --why '' removes it",
  "  --draft <json>    {\"bullets\":[…],\"why\":\"…\",\"drafted\":\"YYYY-MM-DD\"}",
  "  --digest <json>   all four fields; --digest '' removes it",
  "  --no-commit       write the file and stop, so the diff can be read first",
].join("\n");

/** JSON fields take an object; `""` means "clear it". @param {string} raw @param {string} flag */
function jsonArg(raw, flag) {
  if (raw.trim() === "") return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new PatchError(`${flag} is not JSON: ${String(error)}`);
  }
}

/**
 * @param {readonly string[]} argv
 * @returns {{ patch: Patch, commit: boolean }}
 */
export function parseArgs(argv) {
  /** @type {Record<string, unknown>} */
  const patch = {};
  let commit = true;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--no-commit") {
      commit = false;
      continue;
    }

    const value = argv[i + 1];
    if (value === undefined) throw new PatchError(`${flag} needs a value\n\n${USAGE}`);
    i += 1;

    switch (flag) {
      case "--url":
      case "--slug":
        patch[flag.slice(2)] = value;
        break;
      case "--tags":
        patch.tags = value.trim() === "" ? null : value.split(",");
        break;
      case "--note":
      case "--why":
        patch[flag.slice(2)] = value.trim() === "" ? null : value;
        break;
      case "--draft":
      case "--digest":
        patch[flag.slice(2)] = jsonArg(value, flag);
        break;
      default:
        throw new PatchError(`unknown argument "${flag}"\n\n${USAGE}`);
    }
  }

  return { patch: /** @type {Patch} */ (patch), commit };
}

/** @param {readonly string[]} argv @returns {Promise<number>} */
export async function main(argv) {
  try {
    const { patch, commit } = parseArgs(argv);
    await patchLibrary({ patch, commit });
    return 0;
  } catch (error) {
    console.error(`patch: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
