/**
 * How a /library post is shown on a card.
 *
 * `lib/library.ts` owns what a post *is* — five fields, all of them required
 * once the object exists — and stops there. This is the presentation half, the
 * same split `lib/tags.ts` makes for a tag, and it is separate for the same
 * reason: the data boundary is already the longest module in `src/lib`, and
 * nothing here needs to see an entry to do its job.
 *
 * Two functions, and both exist because a card has an edge and a post does not.
 *
 * ## The budget
 *
 * `Post.text` is the whole post, and on x.com a post can be twenty-five
 * thousand characters. Two of the twenty-four saved here are: 31,007 and
 * 19,673. Rendered whole in a masonry column that is one of them alone is a
 * fifteen-thousand-pixel card, and the wall stops being a wall.
 *
 * So the card shows the post up to a budget and the rest is one press away, at
 * the post itself. Three things were considered and this is why it is a cut in
 * the component rather than either of the others:
 *
 *   - **A CSS `line-clamp`** hides the overflow from the eye and from nothing
 *     else. The full 31,000 characters still ship, still get read out by a
 *     screen reader, and still sit inside the card's own anchor, whose
 *     accessible name is its text. Clamping visually while announcing endlessly
 *     is a page that says two different things to two readers, which is
 *     design.md §7's parity rule pointing the other way.
 *   - **A "show more" control** would be a second target inside a card that is
 *     already one link, so a press near it is a coin toss between expanding and
 *     leaving. This site has no disclosure idiom and does not need its first one
 *     here: the whole post is at the destination the card already points at.
 *   - **The cut**, which ships what it shows. The card's own link is the way to
 *     the rest, and the ellipsis is what says there is a rest.
 *
 * The budget is 700 code points. That is two and a half times the 280 the row's
 * note already carries (`pipeline/entries.mjs › POST_NOTE_MAX`, X's own free
 * limit), so a card is worth opening over a row; and it is about twelve lines
 * in the wall's widest column and eighteen in its narrowest, which keeps the
 * tallest card inside two thirds of a phone screen. Ten of the twenty-four
 * posts are cut by it today.
 *
 * ## The monogram
 *
 * A tweet opens with a face and this site will not fetch one, so the slot holds
 * an initial. Which letter is the only thing decided here; the circle and the
 * colour are `styles/chip.css › .monogram`, keyed by `lib/tags.ts › hueSlot`.
 */

/**
 * How much of a post a card shows, in code points.
 *
 * A twin of `pipeline/entries.mjs › POST_NOTE_MAX` at a different grain: that
 * one is how much of a post fits on a row, this one is how much fits on a card,
 * and a card that showed the row's 280 would be a card worth nothing.
 */
export const POST_CARD_MAX = 700;

/**
 * `text`, or as much of it as fits, ending on a word.
 *
 * The second copy of `pipeline/entries.mjs › clip`, and deliberately so: that
 * module runs under plain Node with `node:fs` in its imports, and pulling it
 * into the bundler to save eleven lines would put the publish pipeline into the
 * site's build graph. Same call `lib/links.ts › githubRepo` makes about
 * `repoFrom`, and `lib/card.test.mjs` holds the two to the same answers on the
 * same inputs, which is what makes a second copy safe rather than a fork.
 *
 * The trailing-punctuation strip is what stops "three weeks," becoming
 * "three weeks,…". The half-budget floor is for the one input a word-boundary
 * cut cannot handle: a single token longer than the whole allowance, where
 * backing off to the last space would return almost nothing. Then a hard cut is
 * the only cut there is.
 *
 * Counted in code points rather than UTF-16 units, because a post is a place
 * emoji live and slicing a string at an odd index inside a surrogate pair
 * leaves half a character behind and renders a replacement glyph.
 */
export function clipText(text: string, max: number): string {
  const tidy = text.trim();
  const points = [...tidy];
  if (points.length <= max) return tidy;

  const cut = points.slice(0, max).join("");
  const space = cut.lastIndexOf(" ");
  const body = space > max / 2 ? cut.slice(0, space) : cut;

  return `${body.replace(/[\s,.;:!?—–-]+$/u, "")}…`;
}

/** Whether the card is showing the whole post or a cut of it. */
export function isClipped(text: string, max = POST_CARD_MAX): boolean {
  return [...text.trim()].length > max;
}

/**
 * The letter in the monogram: the first one of the display name, uppercased.
 *
 * Read as code points, for the reason `clipText` counts them — a display name
 * is a place emoji live, and `"🤗Alejandro"[0]` is half a character. The name
 * is used rather than the handle because the name is what sits beside the
 * circle, and a circle whose letter is not the first letter of the word next to
 * it reads as a bug rather than as a second fact.
 *
 * A name with no letter or digit in it at all — an emoji, a punctuation mark —
 * gets nothing rather than a mystery glyph in a coloured circle, and the card
 * draws no monogram. `readString` already refuses an empty author, so this is
 * the only remaining hole and it is one the parser cannot close: "🤗" is a
 * non-empty string and somebody's real display name.
 */
export function monogram(author: string): string {
  const first = [...author.trim()].find((point) => /[\p{L}\p{N}]/u.test(point));
  return first === undefined ? "" : first.toUpperCase();
}
