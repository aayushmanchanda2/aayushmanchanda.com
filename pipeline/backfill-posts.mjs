/**
 * backfill-posts.mjs — re-read every saved x.com post through `post.mjs`.
 *
 * One-off, and safe to re-run: media already in `public/posts/` is not fetched
 * again, and a post that fails keeps what it had. `node pipeline/backfill-posts.mjs`
 * reads every post; `... backfill-posts.mjs <slug> [<slug>...]` only those (VET-284:
 * one post that lost its avatar, without re-reading the other seventeen).
 */

import { fileURLToPath, pathToFileURL } from "node:url";

import { readEntries, writeEntries } from "./entries.mjs";
import { postFrom } from "./post.mjs";
import { backfill, describe } from "./util.mjs";

const LIBRARY_JSON = fileURLToPath(new URL("../src/data/library.json", import.meta.url));
const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

async function main() {
  const entries = /** @type {Record<string, any>[]} */ (await readEntries(LIBRARY_JSON));
  const only = process.argv.slice(2);
  const posts = entries.filter((entry) => entry["kind"] === "post" && (only.length === 0 || only.includes(entry["slug"])));

  /** @type {string[]} */
  const failed = [];
  /** @type {string[]} */
  const removed = [];

  await backfill(
    posts,
    async (entry) => {
      try {
        const post = await postFrom({ url: entry.url, saved: entry.post ?? null, publicDir: PUBLIC_DIR });
        if (post === null) return;
        entry.post = post;
        // Files already here keep their first day; this run's are dated today (VET-65).
        if (JSON.stringify(post).includes('"/posts/')) entry.media_retrieved ??= new Date().toISOString().slice(0, 10);
        if (post["removed"]) removed.push(entry.slug);
        console.log(`ok     ${entry.slug}`);
      } catch (error) {
        failed.push(entry.slug);
        console.log(`failed ${entry.slug}: ${describe(error)}`);
      }
    },
    4,
  );

  await writeEntries(LIBRARY_JSON, entries);

  console.log(`\n${posts.length} posts, ${posts.length - failed.length} read, ${removed.length} removed on X.`);
  if (removed.length > 0) console.log(`Removed: ${removed.join(", ")}`);
  if (failed.length > 0) console.log(`Failed: ${failed.join(", ")}`);
}

// Imported by nothing today; guarded so an import (a test) never rewrites library.json.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
