/**
 * How a /library post is shown on a card (`components/PostCard.astro`).
 *
 * `lib/library.ts` owns what a post *is*; this is the presentation half: how
 * much text a grid card ships, how the text becomes paragraphs and links, the
 * link out to X, and the initial that stands in for a missing avatar.
 */
import type { Post, PostLink } from "./library";

/**
 * How much of a post a grid card ships, in code points: X's own 280. The cut
 * happens here rather than only in CSS so a 31,000-character post does not
 * ship whole inside a card that shows seven lines of it. The detail page
 * renders the rest.
 */
export const POST_CARD_MAX = 280;

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

/** A run of post text, linked or not. */
export interface Run {
  text: string;
  href: string | null;
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The text as runs: X's own links by their displayed text, then bare URLs,
 * then @mentions and #tags. Longest displayed text first, so `x.com/a/b` wins over `x.com/a`.
 */
export function runs(text: string, links: readonly PostLink[]): Run[] {
  const shown = links
    .map((link) => link.text)
    .filter((shownText) => shownText !== "")
    .sort((a, b) => b.length - a.length)
    .map(escapeRe);
  const pattern = new RegExp([...shown, "https?://\\S*[^\\s.,;:!?)\"']", "(?<![\\w@])@[A-Za-z0-9_]{1,15}", "(?<![\\w#&])#[A-Za-z][A-Za-z0-9_]{0,49}"].join("|"), "g");

  const out: Run[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const found = match[0];
    const at = match.index;
    if (at > last) out.push({ text: text.slice(last, at), href: null });
    const href =
      links.find((link) => link.text === found)?.href ??
      (found.startsWith("@")
        ? `https://x.com/${found.slice(1)}`
        : found.startsWith("#")
          ? `https://x.com/hashtag/${found.slice(1)}`
          : found);
    out.push({ text: found, href });
    last = at + found.length;
  }
  if (last < text.length) out.push({ text: text.slice(last), href: null });
  return out;
}

/** Blank-line separated paragraphs. A single newline stays inside one (CSS `pre-line`). */
export function postParagraphs(text: string): string[] {
  return text
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");
}

/** A paragraph, or a run of numbered or bulleted lines as a real list (VET-264). */
export type Block = { kind: "p"; text: string } | { kind: "ol" | "ul"; items: string[]; start: number };

const STEP = /^(\d{1,2})[.)/]\s+/;
const BULLET = /^[-•]\s+/;
/** A list marker a scrape flattened into the middle of a line: " - Next" and ". 2) Next". */
const INLINE_BULLET = /(?<=\S) [-•] (?=[A-Z@#"“])/g;
const INLINE_STEP = /(?<=[.!?:"”)]) (?=\d{1,2}[.)/] \S)/g;

/**
 * Line breaks back where a scrape lost them, only when the post plainly is a
 * list: two or more markers counting the ones already on their own line, and
 * bullets only inside a line long enough to be several lines run together.
 * ponytail: a heuristic; a rescrape that keeps the breaks makes it a no-op.
 */
function unflatten(text: string): string {
  const count = (re: RegExp, lineStart: RegExp) => (text.match(re) ?? []).length + (text.match(lineStart) ?? []).length;
  let out = text;
  // Only a long line is a flattened one; "0:00 - Intro" on its own line is a chapter, not a list.
  if (count(INLINE_BULLET, /^[-•]\s/gm) >= 2) {
    out = out.replace(/^.{200,}$/gm, (line) => line.replace(INLINE_BULLET, "\n- "));
  }
  if (count(INLINE_STEP, /^\d{1,2}[.)/]\s/gm) >= 2) out = out.replace(INLINE_STEP, "\n");
  return out;
}

/**
 * The post as blocks. Lines starting "1.", "1)" or "1/" become an `ol`, lines
 * starting "-" or "•" a `ul`; a plain line right under an item belongs to it
 * (steps often carry a line of detail). A list split by blank lines is still
 * one list, and an `ol` keeps the number it started on.
 */
export function postBlocks(text: string): Block[] {
  const out: Block[] = [];
  for (const paragraph of postParagraphs(unflatten(text))) {
    let prose: string[] = [];
    const flush = () => {
      if (prose.length > 0) out.push({ kind: "p", text: prose.join("\n") });
      prose = [];
    };
    paragraph.split("\n").forEach((line, index) => {
      const step = STEP.exec(line);
      const kind = step ? "ol" : BULLET.test(line) ? "ul" : null;
      const last = out.at(-1);
      if (kind === null) {
        if (index > 0 && prose.length === 0 && last !== undefined && last.kind !== "p") {
          last.items[last.items.length - 1] += `\n${line}`;
        } else prose.push(line);
        return;
      }
      flush();
      const item = line.replace(step ? STEP : BULLET, "");
      const start = step ? Number(step[1]) : 1;
      const prev = out.at(-1);
      // A list runs on across blank lines while its numbers do; "1." again starts a new one.
      if (prev?.kind === kind && (kind === "ul" || start === prev.start + prev.items.length)) prev.items.push(item);
      else out.push({ kind, items: [item], start });
    });
    flush();
  }
  return out;
}

/** A run with the keyline flag: `mark` is true inside the post's key line. */
export type Part = Run & { mark: boolean };

/** `text` as runs, with the first exact `keyline` in it marked. */
export function parts(text: string, links: readonly PostLink[], keyline: string | null): Part[] {
  const at = keyline ? text.indexOf(keyline) : -1;
  if (keyline === null || at === -1) return runs(text, links).map((run) => ({ ...run, mark: false }));
  const end = at + keyline.length;
  return [
    ...runs(text.slice(0, at), links).map((run) => ({ ...run, mark: false })),
    ...runs(text.slice(at, end), links).map((run) => ({ ...run, mark: true })),
    ...runs(text.slice(end), links).map((run) => ({ ...run, mark: false })),
  ];
}

/** The post on X, or the saved URL when there is no id to build it from. */
export function originalUrl(post: Pick<Post, "id" | "handle">, fallback: string): string {
  return post.id === null ? fallback : `https://x.com/${post.handle}/status/${post.id}`;
}
