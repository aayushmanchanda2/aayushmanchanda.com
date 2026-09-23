/** FNV-1a, 32-bit: a spread-out number for a string, no crypto needed. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

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
  return entries
    .filter((entry) => entry.id !== slug)
    .map((entry) => ({ entry, key: hash(`${slug}\n${entry.id}`) }))
    .sort((a, b) => a.key - b.key)
    .slice(0, count)
    .map(({ entry }) => entry);
}
