/**
 * How a /library tag reads, and the site's identity palette slot.
 *
 * `lib/library.ts` owns what a tag *is* — a slug on an entry, a route segment,
 * a join key — and stops there. This file is the presentation half, and it is
 * separate for the reason `MarkGlyph` and `SiteMark` are two files: the data
 * boundary is already the longest module in `src/lib`, and nothing here needs
 * to see an entry to do its job.
 *
 * ## The palette
 *
 * Tags are plain grey since VET-219 (`styles/chip.css › .tag`), so the only
 * thing here a tag still uses is `tagLabel`. `hueSlot` stays for the post
 * monogram (`components/TweetCard.astro`), keyed on the poster's handle.
 *
 * **The hue lives in CSS and the slot lives here.** `hueSlot` returns a number
 * in `[0, TAG_HUES)` and `styles/chip.css` decides what each of those seven
 * numbers is worth in each theme, because a colour value typed outside
 * `styles/` is the bug design.md §1 opens with.
 *
 * **The assignment is a hash, not a table**, so any handle gets a hue for free
 * and keeps it on every build. Seven hues collide often; the name beside the
 * monogram is the identifier and the colour is a recognition aid.
 */

/**
 * How many slots the palette has. `styles/chip.css` declares exactly this many
 * `[data-hue]` rules and `lib/tags.test.mjs` fails if the two ever disagree —
 * a slot with no rule in the stylesheet would render the fallback colour.
 */
export const TAG_HUES = 7;

/**
 * `go-to-market` -> `go to market`.
 *
 * The same fold `lib/sites.ts › collectionLabel` does to a collection, for the
 * same reason: the hyphens are there to make the slug a URL, and a reader has
 * no use for them. Nothing round-trips this back into a slug — the slug is what
 * the JSON stores and what every href is built from.
 */
export function tagLabel(slug: string): string {
  return slug.replace(/-/g, " ");
}

/**
 * Which of the palette's slots a word wears, deterministically, for ever.
 *
 * djb2: `h = h * 33 + c`, the loop Dan Bernstein posted to comp.lang.c, held to
 * 32 bits by `Math.imul` and an unsigned shift so it cannot drift into
 * floating-point territory on a long key. Pure, so the only way a poster's
 * monogram changes colour is if someone edits this function or renames the
 * thing.
 *
 * The key is an x.com handle, used raw: a handle is spelled the way its owner
 * spells it, so `TermiusHQ` and `termiushq` are two strings here. Nothing folds them, because nothing on the site has two
 * spellings of one handle to reconcile.
 */
export function hueSlot(key: string): number {
  let hash = 5381;
  for (let index = 0; index < key.length; index += 1) {
    hash = (Math.imul(hash, 33) + key.charCodeAt(index)) >>> 0;
  }
  return hash % TAG_HUES;
}
