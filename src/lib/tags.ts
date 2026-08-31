/**
 * How a /library tag is shown: the words it reads as, and which dot it wears.
 *
 * `lib/library.ts` owns what a tag *is* — a slug on an entry, a route segment,
 * a join key — and stops there. This file is the presentation half, and it is
 * separate for the reason `MarkGlyph` and `SiteMark` are two files: the data
 * boundary is already the longest module in `src/lib`, and nothing here needs
 * to see an entry to do its job.
 *
 * ## The dot
 *
 * A chip carries a small coloured dot and ink-coloured words, the Linear label
 * shape rather than the filled pill `styles/chip.css › .chip` draws. The colour
 * is identity and nothing more: it is what lets a reader who has seen `agents`
 * twice recognise it a third time before reading the word. It says nothing on a
 * scale, unlike a verdict or a status, which is exactly why it may not be a
 * fill — twenty filled rows would read as a traffic light making claims about
 * links that are all in the same state, which is saved.
 *
 * **The hue lives in CSS and the slot lives here.** `tagHue` returns a number
 * in `[0, TAG_HUES)` and `styles/chip.css` decides what each of those seven
 * numbers is worth in each theme, because a colour value typed outside
 * `styles/` is the bug design.md §1 opens with. So this module never names a
 * colour, and the stylesheet never needs to know a tag exists.
 *
 * **The assignment is a hash, not a table.** Tags arrive from Raindrop through
 * the publish pipeline, so a table here would mean a hand edit to this repo
 * every time Aayush files something under a new word, and a tag with no row in
 * the table would have to fall back to something anyway. A hash gives every
 * possible tag a hue for free, gives the same tag the same hue on every build
 * for ever, and cannot drift from the data because it never reads it.
 *
 * The price is collisions: seven hues cannot keep twelve tags apart, and two
 * tags sharing a dot is the normal case rather than a fault. That is affordable
 * because **the dot is a recognition aid and the word beside it is the
 * identifier** — nothing on this site is ever named by colour alone. What would
 * actually read as a bug is two identical dots on one row, so djb2 at seven
 * slots was picked from four standard string hashes at sizes seven to ten by
 * that one measurement: no two tags that appear together on an entry today land
 * on the same slot, and all seven hues are in use. It is a check of a palette,
 * not a promise about the next tag: a new word can land anywhere, including
 * beside one of its own row-mates.
 */

/**
 * How many dots the palette has. `styles/chip.css` declares exactly this many
 * `[data-hue]` rules and `lib/tags.test.mjs` fails if the two ever disagree —
 * a slot with no rule in the stylesheet would render the fallback dot and look
 * like a tag that had quietly lost its colour.
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
 * Which of the palette's slots this tag wears, deterministically, for ever.
 *
 * djb2: `h = h * 33 + c`, the loop Dan Bernstein posted to comp.lang.c, held to
 * 32 bits by `Math.imul` and an unsigned shift so it cannot drift into
 * floating-point territory on a long slug. Pure, so the only way a tag's dot
 * changes colour is if someone edits this function or renames the tag.
 */
export function tagHue(slug: string): number {
  let hash = 5381;
  for (let index = 0; index < slug.length; index += 1) {
    hash = (Math.imul(hash, 33) + slug.charCodeAt(index)) >>> 0;
  }
  return hash % TAG_HUES;
}
