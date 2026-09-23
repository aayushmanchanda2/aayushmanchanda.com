/**
 * The command palette's ranking, with nothing around it.
 *
 * This module is deliberately import-free, for the same reason `lib/parse.ts`
 * is: a file with no imports runs under `node --experimental-strip-types`
 * directly, so the scoring can be tested as arithmetic rather than by driving a
 * browser. `lib/tools.ts` and `lib/sites.ts` read JSON at module load and only
 * resolve inside a bundler; the moment this file imports one of them, its test
 * file stops running. The aggregation that *does* need them lives next door in
 * `lib/search-index.ts`, which is only ever called at build time.
 *
 * The split has a second payoff. The same `search()` the tests exercise is the
 * one the browser runs — `components/CommandPalette.astro` imports it from its
 * client `<script>`, so there is one ranking implementation on the site, not a
 * tested one and a shipped one that drifted.
 */

/** A row's 30px picture: `src`, then `fallback`, then `letter` on its hue. */
export interface RowIcon {
  /** A post's author is a face, so round; a tool or a site is an app icon. */
  shape: "round" | "app";
  src?: string;
  fallback?: string;
  letter: string;
  /** A person's identity hue (`lib/tags.ts › hueSlot`); a tool's or a site's letter tile has none. */
  hue?: number;
}

/** A row with no picture draws one of these (`styles/kind-icon.css`). */
export type Glyph = "article" | "post" | "video" | "note" | "sound";

/** One searchable destination: an entry, or a page. */
export interface SearchEntry {
  /** What the reader sees, and the field that carries the most weight. */
  title: string;
  /** "Tools", "Sites", "Pages": the first half of the row's subline. */
  section: string;
  href: string;
  /**
   * Everything else worth matching on, space-joined: a domain, a category, a
   * verdict, the collections a site belongs to. One string rather than an
   * array because scoring only ever asks "where does this token appear", and a
   * single `indexOf` over the joined text answers that without a loop.
   */
  terms?: string;
  /** The short prose: a TLDR, the highlights, a tool's note. Outranks `body`. */
  lead?: string;
  /** The long prose: a post's whole text, a note's body. Whitespace collapsed at build. */
  body?: string;
  /** Who or where: "Ben Lang @benln", "rareui.com". The subline's second half. */
  sub?: string;
  /** ISO day, printed on the right. */
  date?: string;
  icon?: RowIcon;
  glyph?: Glyph;
  /** A command rather than a destination: the row runs it instead of navigating. */
  action?: "sound";
}

/** A ranked entry. `score` is only meaningful relative to its siblings. */
export interface SearchHit {
  entry: SearchEntry;
  score: number;
}

/**
 * How many rows the palette will show at once.
 *
 * Twelve is what fits the sheet without the list becoming a page you scroll to
 * read — past that, a reader stops scanning and starts typing another letter,
 * which is the faster path anyway. The cap is applied to the ranking, before
 * grouping, so it is twelve *results* rather than twelve per section.
 */
export const RESULT_LIMIT = 12;

/**
 * What each field is worth when a token hits it.
 *
 * The title dominates on purpose. `terms` exists so that "gallery" finds a site
 * filed under a collection by that name, but a site actually *called* Gallery
 * should always beat it. Then the prose: a TLDR or a highlight is what the entry
 * is about, and a word buried in a 3,000-word post body is only evidence.
 */
const FIELD_WEIGHT = { title: 1, lead: 0.5, terms: 0.45, section: 0.3, body: 0.2 } as const;

/**
 * Where in the field the token landed.
 *
 * The middle rung is the one that matters. Plain substring matching puts "rare"
 * in "Rare UI" and in "software" on the same footing, which is how a palette
 * ends up feeling random; scoring the start of a *word* separately is what
 * makes typing the first letters of any word in a title work the way a reader
 * expects, without giving up the loose match entirely.
 */
const MATCH_SCORE = { start: 1, word: 0.72, loose: 0.34 } as const;

const NO_MATCH = 0;

/**
 * Lowercase, and one space between words.
 *
 * Applied to both the query and every field it is compared against, so casing
 * and stray whitespace are gone before any `indexOf` runs and neither side has
 * to think about them again.
 */
export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** The words of a query. Empty for an empty query. */
export function tokenize(query: string): string[] {
  const normalized = normalizeText(query);
  return normalized === "" ? [] : normalized.split(" ");
}

/**
 * True when `char` ends a word, so what follows it starts one.
 *
 * Anything that is not a letter or a digit counts: a space, but also the hyphen
 * in `design-engineer`, the dot in `rareui.com` and the slash in a path. Those
 * are the shapes half the searchable text on this site takes, and a reader
 * typing `com` after seeing `rareui.com` is typing the start of a word as far
 * as they are concerned.
 */
function startsWord(char: string): boolean {
  return !/[a-z0-9]/.test(char);
}

/**
 * What one token is worth against one field, before the field's weight.
 *
 * Returns `NO_MATCH` when the token is absent, which is what lets the caller
 * treat "absent from every field" as a reason to drop the entry rather than as
 * a low score.
 */
function matchScore(field: string, token: string): number {
  const at = field.indexOf(token);
  if (at < 0) return NO_MATCH;
  if (at === 0) return MATCH_SCORE.start;
  return startsWord(field[at - 1]) ? MATCH_SCORE.word : MATCH_SCORE.loose;
}

/**
 * One entry's score for one token: the best any of its fields can do.
 *
 * Best rather than sum, so an entry does not climb the list by repeating a word
 * across its title and its terms. A tool named "Astro" in the "astro" category
 * is one match, not two.
 */
function tokenScore(fields: ScoredFields, token: string): number {
  let best = NO_MATCH;
  for (const key of FIELDS) {
    best = Math.max(best, matchScore(fields[key], token) * FIELD_WEIGHT[key]);
  }
  return best;
}

const FIELDS = ["title", "lead", "terms", "section", "body"] as const;

type ScoredFields = Record<(typeof FIELDS)[number], string>;

/**
 * An entry's fields, normalised once and kept for as long as the entry is (QA
 * phase 2, B12): the index is fetched once and searched on every keystroke,
 * and folding every post's full text per key was the whole cost of a search.
 */
const normalized = new WeakMap<SearchEntry, ScoredFields>();

function fieldsOf(entry: SearchEntry): ScoredFields {
  let fields = normalized.get(entry);
  if (!fields) {
    fields = Object.fromEntries(FIELDS.map((key) => [key, normalizeText(entry[key] ?? "")])) as ScoredFields;
    normalized.set(entry, fields);
  }
  return fields;
}

/**
 * An entry's total, or `NO_MATCH` when it is out.
 *
 * Every token has to land somewhere. Typing more words narrows the list, which
 * is the only behaviour that makes a palette worth typing into: if tokens were
 * OR-ed, a second word would *widen* the results and the reader would be
 * further from what they wanted than when they started.
 */
export function scoreEntry(entry: SearchEntry, tokens: readonly string[]): number {
  const fields = fieldsOf(entry);

  let total = 0;
  for (const token of tokens) {
    const score = tokenScore(fields, token);
    if (score === NO_MATCH) return NO_MATCH;
    total += score;
  }
  return total;
}

/**
 * Rank, then cap.
 *
 * An empty query is not an empty result: opening the palette and seeing the
 * first twelve destinations tells a reader what is in here, which is most of
 * why they opened it. Order in that case is the order `entries` arrives in,
 * which `lib/search-index.ts` sets deliberately.
 *
 * One flat list, best first, across sections. Each row names its section in
 * its subline, so a heading per section would say it twice and would reorder
 * the ranking into runs (G1, VET-247).
 */
export function search(
  entries: readonly SearchEntry[],
  query: string,
  limit: number = RESULT_LIMIT,
): SearchHit[] {
  const tokens = tokenize(query);

  const ranked: SearchHit[] =
    tokens.length === 0
      ? entries.map((entry) => ({ entry, score: 0 }))
      : entries
          .map((entry) => ({ entry, score: scoreEntry(entry, tokens) }))
          .filter((hit) => hit.score > NO_MATCH)
          .sort(compareHits);

  return ranked.slice(0, limit);
}

/**
 * Better first.
 *
 * The tiebreak is length, and it earns its place: "tools" scores identically
 * against the Tools page and against a tool whose title merely starts with the
 * word, and the shorter title is the more general destination, which is what
 * someone typing a bare section name is after. Titles that tie on length fall
 * back to alphabetical so the order is stable across builds rather than
 * dependent on how the engine happened to sort.
 */
function compareHits(a: SearchHit, b: SearchHit): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.entry.title.length !== b.entry.title.length) {
    return a.entry.title.length - b.entry.title.length;
  }
  return a.entry.title.localeCompare(b.entry.title);
}

/** A run of excerpt text, marked when it is one of the query's words. */
export interface Part {
  text: string;
  mark: boolean;
}

/** Characters of context either side of the word an excerpt is centred on. */
const EXCERPT_RADIUS = 60;

/**
 * Why a row matched, when the title does not say: a window of the lead or the
 * body around the first query word the title lacks, every query word in it
 * marked. Null when the title holds every word, or when the match was in the
 * terms (a domain, a category), which the subline already shows.
 *
 * Parts rather than HTML: the caller builds text nodes and `<mark>`s from
 * them, so there is no escaping step to get wrong.
 */
export function excerptFor(entry: SearchEntry, tokens: readonly string[]): Part[] | null {
  const title = normalizeText(entry.title);
  const anchor = tokens.find((token) => !title.includes(token));
  if (anchor === undefined) return null;
  const text = [entry.lead, entry.body].find((field) => field?.toLowerCase().includes(anchor));
  return text === undefined ? null : excerpt(text, anchor, tokens);
}

/** `text` cut to a window around `anchor`, on word boundaries, with `tokens` marked. */
export function excerpt(text: string, anchor: string, tokens: readonly string[]): Part[] {
  const lower = text.toLowerCase();
  const at = lower.indexOf(anchor);
  let start = Math.max(0, at - EXCERPT_RADIUS);
  let end = Math.min(text.length, at + anchor.length + EXCERPT_RADIUS);
  if (start > 0) start = lower.indexOf(" ", start) + 1 || start;
  if (start > at) start = at;
  if (end < text.length) end = Math.max(lower.lastIndexOf(" ", end), at + anchor.length);

  const parts: Part[] = [];
  let from = start;
  while (from < end) {
    let hit = -1;
    let size = 0;
    for (const token of tokens) {
      const found = lower.indexOf(token, from);
      if (found >= 0 && found + token.length <= end && (hit < 0 || found < hit)) {
        hit = found;
        size = token.length;
      }
    }
    if (hit < 0) hit = end;
    if (hit > from) parts.push({ text: text.slice(from, hit), mark: false });
    if (size > 0) parts.push({ text: text.slice(hit, hit + size), mark: true });
    from = hit + size;
  }
  if (start > 0) parts.unshift({ text: "… ", mark: false });
  if (end < text.length) parts.push({ text: " …", mark: false });
  return parts;
}
