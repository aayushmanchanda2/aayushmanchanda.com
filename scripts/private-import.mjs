/**
 * private-import.mjs — the private library archive into Convex (VET-274).
 *
 *   node scripts/private-import.mjs          # the dev deployment (this checkout's .env.local)
 *   node scripts/private-import.mjs --prod   # production, after the setup wizard has run
 *
 * Reads everything from the private folder next to this repo, never from the
 * repo: `library-private-archive.json`, `private-blocks.json` when it exists
 * (each row's block, `why_saved` and `also_saved`, merged by slug) and
 * `hermes-comments.json` when it exists (slug -> what he wrote Hermes on
 * Telegram with the link) and `media/public/...`. Every entry
 * goes through `parseLibrary` first, the same parser the site builds with, so
 * a bad row stops here rather than on the page. Rows upsert by slug and files
 * skip when the stored copy has the same hash, so a re-run changes nothing.
 * An entry that is public (its slug is in `src/data/library.json`) is never
 * private too: it is skipped, and removed from Convex with the files only it
 * used. Prints counts only.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseLibrary } from "../src/lib/library.ts";
import { libraryJson, mergeBlocks, ownNote, raindropHighlights } from "../src/lib/private.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PRIVATE = process.env["PRIVATE_DIR"] ?? path.join(ROOT, "..", "aayushmanchanda-private");
const MEDIA = path.join(PRIVATE, "media", "public");
/** @type {Record<string, string>} */
const TYPES = { ".webp": "image/webp", ".mp4": "video/mp4" };

/** KEY=value lines; a missing file is an empty map. @param {string} file @returns {Record<string, string>} */
function readEnv(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => /^[A-Z_]+=/.test(line))
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
    );
  } catch {
    return {};
  }
}

const prod = process.argv.includes("--prod");
const secrets = readEnv(path.join(PRIVATE, ".env"));
const site = prod ? secrets.PROD_CONVEX_SITE_URL : readEnv(path.join(ROOT, ".env.local")).CONVEX_SITE_URL;
const secret = secrets.INGEST_SECRET;
if (!site || !secret) {
  console.error(`private-import: missing ${!site ? (prod ? "PROD_CONVEX_SITE_URL" : "CONVEX_SITE_URL in .env.local") : "INGEST_SECRET"}. Run scripts/private-setup-wizard.sh.`);
  process.exit(1);
}

/**
 * One request, retried twice on a dropped connection (a large upload occasionally is).
 * @param {string} route @param {{ method?: string, headers?: Record<string, string>, body?: BodyInit }} [init]
 * @returns {Promise<any>}
 */
async function call(route, init = {}, tries = 3) {
  let response;
  try {
    response = await fetch(new URL(route, site), {
      ...init,
      headers: { authorization: `Bearer ${secret}`, ...init.headers },
    });
  } catch (error) {
    if (tries > 1) return call(route, init, tries - 1);
    throw error;
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${route.split("?")[0]} -> ${response.status} ${body.error ?? ""}`);
  return body;
}

/** @typedef {{ entry: Record<string, unknown>, raindrop_id?: number | null, bucket?: string, raindrop_note?: string, raindrop_highlights?: unknown, sweep_note?: string, why_saved?: string | null }} ArchiveRow */
const BLOCKS = path.join(PRIVATE, "private-blocks.json");
const merged = mergeBlocks(
  /** @type {ArchiveRow[]} */ (JSON.parse(readFileSync(path.join(PRIVATE, "library-private-archive.json"), "utf8"))),
  existsSync(BLOCKS) ? JSON.parse(readFileSync(BLOCKS, "utf8")) : [],
);
const archive = merged.rows;
const COMMENTS = path.join(PRIVATE, "hermes-comments.json");
/** @type {Record<string, string>} */
const comments = existsSync(COMMENTS) ? JSON.parse(readFileSync(COMMENTS, "utf8")) : {};
parseLibrary(archive.map((item) => libraryJson(item.entry)));

const PUBLIC = new Set(JSON.parse(readFileSync(path.join(ROOT, "src", "data", "library.json"), "utf8")).map((/** @type {{ slug: string }} */ e) => e.slug));
const MEDIA_REF = /\/(?:posts|shots|previews)\/[A-Za-z0-9/_.-]+\.(?:webp|mp4)/g;
/** The files an archive row points at, and its library preview. @param {(typeof archive)[number]} item */
const refs = (item) => [...(JSON.stringify(item.entry).match(MEDIA_REF) ?? []), `/previews/library/${item.entry["slug"]}.webp`];
const isPublic = (/** @type {(typeof archive)[number]} */ item) => PUBLIC.has(String(item.entry["slug"]));
const kept = new Set(archive.filter((item) => !isPublic(item)).flatMap(refs));
const pruneSlugs = archive.filter(isPublic).map((item) => String(item.entry["slug"]));
const prunePaths = [...new Set(archive.filter(isPublic).flatMap(refs))].filter((p) => !kept.has(p));

const rows = archive.filter((item) => !isPublic(item)).map((item) => ({
  ...item.entry,
  raindrop_id: item.raindrop_id ?? null,
  bucket: item.bucket ?? null,
  raindrop_note: ownNote(item.raindrop_note),
  raindrop_highlights: raindropHighlights(item.raindrop_highlights),
  why_saved: item.why_saved || null,
  telegram_note: comments[String(item.entry["slug"])] || null,
  sweep_note: item.sweep_note || null,
}));

/** @type {Record<string, number>} */
const total = { inserted: 0, updated: 0, skipped: 0 };
for (let i = 0; i < rows.length; i += 25) {
  const result = await call("/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rows: rows.slice(i, i + 25), mode: "upsert" }),
  });
  for (const key of Object.keys(total)) total[key] += result[key];
}

const files = readdirSync(MEDIA, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.join(entry.parentPath, entry.name))
  .filter((file) => !prunePaths.includes(`/${path.relative(MEDIA, file).split(path.sep).join("/")}`));
let stored = 0;
for (const file of files) {
  const bytes = readFileSync(file);
  const web = `/${path.relative(MEDIA, file).split(path.sep).join("/")}`;
  const result = await call(`/import/media?path=${encodeURIComponent(web)}`, {
    method: "POST",
    headers: { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" },
    body: bytes,
  });
  if (result.stored) stored++;
}

const pruned = await call("/import/prune", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ slugs: pruneSlugs, paths: prunePaths }),
});
const counts = await call("/import");
console.log(
  `target=${prod ? "prod" : "dev"} rows_sent=${rows.length} inserted=${total.inserted} updated=${total.updated} ` +
    `files_sent=${files.length} files_stored=${stored} files_unchanged=${files.length - stored} ` +
    `blocks=${existsSync(BLOCKS) ? archive.filter((item) => item.entry["block"]).length : "no-file"} blocks_unmatched=${merged.unmatched.length} ` +
    `notes=${rows.filter((row) => row.raindrop_note).length} telegram=${rows.filter((row) => row.telegram_note).length} public_skipped=${pruneSlugs.length} rows_pruned=${pruned.rows} files_pruned=${pruned.files} ` +
    `entries_in_convex=${counts.entries} media_in_convex=${counts.media}`,
);
