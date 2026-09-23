/**
 * backfill-posts.mjs — re-read every saved x.com post through `post.mjs`.
 *
 * One-off, and safe to re-run: media already in `public/posts/` is not fetched
 * again, and a post that fails keeps what it had. `node pipeline/backfill-posts.mjs`
 */

import { fileURLToPath } from "node:url";

import { readEntries, writeEntries } from "./entries.mjs";
import { postFrom } from "./post.mjs";
import { backfill, describe } from "./util.mjs";

const LIBRARY_JSON = fileURLToPath(new URL("../src/data/library.json", import.meta.url));
const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

const entries = /** @type {Record<string, any>[]} */ (await readEntries(LIBRARY_JSON));
const posts = entries.filter((entry) => entry["kind"] === "post");

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
