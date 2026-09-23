/**
 * private-import.mjs — the private library archive into Convex (VET-274).
 *
 *   node scripts/private-import.mjs          # the dev deployment (this checkout's .env.local)
 *   node scripts/private-import.mjs --prod   # production, after the setup wizard has run
 *
 * Reads everything from the private folder next to this repo, never from the
 * repo: `library-private-archive.json` and `media/public/...`. Every entry
 * goes through `parseLibrary` first, the same parser the site builds with, so
 * a bad row stops here rather than on the page. Rows upsert by slug and files
 * skip when the stored copy has the same hash, so a re-run changes nothing.
 * Prints counts only.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseLibrary } from "../src/lib/library.ts";
import { libraryJson } from "../src/lib/private.ts";

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

/** @type {{ entry: Record<string, unknown>, raindrop_id?: number | null, bucket?: string, raindrop_note?: string, sweep_note?: string }[]} */
const archive = JSON.parse(readFileSync(path.join(PRIVATE, "library-private-archive.json"), "utf8"));
parseLibrary(archive.map((item) => libraryJson(item.entry)));

const rows = archive.map((item) => ({
  ...item.entry,
  raindrop_id: item.raindrop_id ?? null,
  bucket: item.bucket ?? null,
  raindrop_note: item.raindrop_note || null,
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
  .map((entry) => path.join(entry.parentPath, entry.name));
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

const counts = await call("/import");
console.log(
  `target=${prod ? "prod" : "dev"} rows_sent=${rows.length} inserted=${total.inserted} updated=${total.updated} ` +
    `files_sent=${files.length} files_stored=${stored} files_unchanged=${files.length - stored} ` +
    `entries_in_convex=${counts.entries} media_in_convex=${counts.media}`,
);
