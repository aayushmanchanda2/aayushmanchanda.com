import { createHash } from "node:crypto";

/**
 * Up to `count` of the other entries, in an order that looks random and is the
 * same on every build: briOS's "Read next" (`writing/[slug]/page.tsx ›
 * getRandomPosts`) for a static site.
 *
 * Each candidate is ranked by a hash of the current slug and its own, so every
 * page gets a different draw and a rebuild with the same notes changes nothing.
 * A client-side shuffle would be fresh per visit, but it ships a script and
 * swaps the list after first paint for a section most readers never reach.
 */
export function readNext<T extends { id: string }>(
  slug: string,
  entries: readonly T[],
  count = 5,
): T[] {
  const rank = (entry: T) =>
    createHash("sha1").update(`${slug}\n${entry.id}`).digest("hex");

  return entries
    .filter((entry) => entry.id !== slug)
    .map((entry) => ({ entry, key: rank(entry) }))
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .slice(0, count)
    .map(({ entry }) => entry);
}
