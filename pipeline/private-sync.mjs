/**
 * private-sync.mjs — new bookmarks in the Internal/* Raindrop collections go
 * to the private library in Convex (VET-274). Run by the publish cron after
 * the public publish.
 *
 *   RAINDROP_TOKEN=… INGEST_SECRET=… CONVEX_SITE_URL=… node pipeline/private-sync.mjs
 *
 * Minimal on purpose: title, url, date, cover, the Raindrop note and tags. No
 * screenshots, no enrichment, no media. Rows are sent with `mode: "insert"`,
 * so Convex adds only slugs and Raindrop ids it has never seen and never
 * overwrites an archived row. Nothing is written to this repo, which is
 * public. Any secret missing and it prints one line and exits 0.
 */
import { pathToFileURL } from "node:url";

import { buildReadingEntry, draftFrom, slugBase } from "./entries.mjs";
import { createClient, fetchBookmarks, resolveCollections } from "./raindrop.mjs";

/** @typedef {import("./types.js").Bookmark} Bookmark */

export const PRIVATE_COLLECTIONS = ["Internal/Reading", "Internal/Tools", "Internal/Process", "Internal/Vetted"];

/**
 * One bookmark as a private row. The slug carries the Raindrop id, so two
 * saves with the same title never collide. A note that is a sweep's JSON blob
 * splits the way `entries.mjs › draftFrom` reads it: his why is his note, the
 * drafted why is the sweep's.
 * @param {Bookmark} bookmark @param {string} bucket @param {string} date
 */
export function toPrivateRow(bookmark, bucket, date) {
  const blob = bookmark.note.trim().startsWith("{");
  let parsed = /** @type {ReturnType<typeof draftFrom>} */ ({ draft: null, why: null });
  try {
    parsed = draftFrom(bookmark.note, date);
  } catch {
    // A malformed blob is kept as his note, whole, rather than lost.
  }
  const { draft, why } = parsed;
  return {
    ...buildReadingEntry({ bookmark, slug: `${slugBase(bookmark)}-${bookmark.id}`, date, draft }),
    ...(bookmark.cover ? { cover: bookmark.cover } : {}),
    raindrop_id: Number(bookmark.id),
    bucket,
    raindrop_note: blob && (draft !== null || why !== null) ? why : bookmark.note || null,
    sweep_note: draft?.why ?? null,
  };
}

/** @param {Record<string, string | undefined>} env @param {typeof fetch} [fetchImpl] */
export async function sync(env, fetchImpl = globalThis.fetch) {
  const { RAINDROP_TOKEN: token, INGEST_SECRET: secret, CONVEX_SITE_URL: site } = env;
  if (!token || !secret || !site) {
    console.log("private-sync: skipped (RAINDROP_TOKEN, INGEST_SECRET or CONVEX_SITE_URL not set)");
    return { sent: 0 };
  }
  const client = createClient({ token, fetch: fetchImpl });
  const wanted = Object.fromEntries(PRIVATE_COLLECTIONS.map((name) => [name, name]));
  const ids = /** @type {Record<string, number>} */ (await resolveCollections(client, /** @type {any} */ (wanted)));
  const date = new Date().toISOString().slice(0, 10);
  const rows = [];
  for (const name of PRIVATE_COLLECTIONS) {
    for (const bookmark of await fetchBookmarks(client, /** @type {number} */ (ids[name]), "reading")) {
      rows.push(toPrivateRow(bookmark, name, date));
    }
  }
  const response = await fetchImpl(new URL("/import", site), {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ rows, mode: "insert" }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`private-sync: /import answered ${response.status}`);
  console.log(`private-sync: sent=${rows.length} inserted=${result.inserted} skipped=${result.skipped}`);
  return { sent: rows.length };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await sync(process.env);
}
