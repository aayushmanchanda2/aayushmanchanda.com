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

/** One searchable destination: an entry, or a page. */
export interface SearchEntry {
  /** What the reader sees, and the field that carries the most weight. */
  title: string;
  /** Display label for the group heading — "Tools", "Sites", "Pages". */
  section: string;
  href: string;
  /**
   * Everything else worth matching on, space-joined: a domain, a category, a
   * verdict, the collections a site belongs to. One string rather than an
   * array because scoring only ever asks "where does this token appear", and a
   * single `indexOf` over the joined text answers that without a loop.
   */
  terms?: string;
}

/** A ranked entry. `score` is only meaningful relative to its siblings. */
export interface SearchHit {
  entry: SearchEntry;
  score: number;
}

/** Hits under one section heading, best first. */
export interface SearchGroup {
  section: string;
  hits: SearchHit[];
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
 * should always beat it, and a weight of 0.45 means no amount of term matching
 * adds up to a title match.
 */
const FIELD_WEIGHT = { title: 1, terms: 0.45, section: 0.3 } as const;

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
  return Math.max(
    matchScore(fields.title, token) * FIELD_WEIGHT.title,
    matchScore(fields.terms, token) * FIELD_WEIGHT.terms,
    matchScore(fields.section, token) * FIELD_WEIGHT.section,
  );
}

interface ScoredFields {
  title: string;
  terms: string;
  section: string;
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
  const fields: ScoredFields = {
    title: normalizeText(entry.title),
    terms: normalizeText(entry.terms ?? ""),
    section: normalizeText(entry.section),
  };

  let total = 0;
  for (const token of tokens) {
    const score = tokenScore(fields, token);
    if (score === NO_MATCH) return NO_MATCH;
    total += score;
  }
  return total;
}

/**
 * Rank, cap, then group.
 *
 * An empty query is not an empty result: opening the palette and seeing the
 * first twelve destinations tells a reader what is in here, which is most of
 * why they opened it. Order in that case is the order `entries` arrives in,
 * which `lib/search-index.ts` sets deliberately.
 *
 * Grouping happens *after* the cap so the twelve rows are the twelve best
 * results overall rather than a quota per section. Groups are then ordered by
 * their strongest hit, which keeps the best result inside the first heading —
 * a palette whose top answer sits under the third heading is a palette that
 * makes you read it.
 */
export function search(
  entries: readonly SearchEntry[],
  query: string,
  limit: number = RESULT_LIMIT,
): SearchGroup[] {
  const tokens = tokenize(query);

  const ranked: SearchHit[] =
    tokens.length === 0
      ? entries.map((entry) => ({ entry, score: 0 }))
      : entries
          .map((entry) => ({ entry, score: scoreEntry(entry, tokens) }))
          .filter((hit) => hit.score > NO_MATCH)
          .sort(compareHits);

  return groupHits(ranked.slice(0, limit));
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

/**
 * Contiguous runs by section, in first-seen order.
 *
 * First-seen rather than a fixed section order, because `ranked` is already
 * sorted by relevance and the first section to appear is the one holding the
 * best hit. Reordering here would undo the ranking the sort just did.
 */
function groupHits(ranked: readonly SearchHit[]): SearchGroup[] {
  const groups: SearchGroup[] = [];
  const bySection = new Map<string, SearchGroup>();

  for (const hit of ranked) {
    let group = bySection.get(hit.entry.section);
    if (!group) {
      group = { section: hit.entry.section, hits: [] };
      bySection.set(hit.entry.section, group);
      groups.push(group);
    }
    group.hits.push(hit);
  }

  return groups;
}

/**
 * The rows of a grouped result in the order the keyboard walks them.
 *
 * The palette renders groups but navigates a flat list, and those two orders
 * have to be the same one or the arrow keys land on a different row than the
 * highlight. Deriving the flat order from the groups — rather than keeping a
 * second list alongside them — is what makes that impossible to get wrong.
 */
export function flatten(groups: readonly SearchGroup[]): SearchHit[] {
  return groups.flatMap((group) => group.hits);
}
