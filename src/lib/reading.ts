/**
 * The /reading data boundary.
 *
 * Same contract as `lib/tools.ts` and `lib/sites.ts`: `src/data/reading.json` is
 * untrusted input until it has been parsed here, everything runs once at build
 * time, and the first bad entry throws instead of rendering. Nothing here uses
 * an `as` cast to skip that work.
 *
 * The generic half of the parse comes from `lib/parse.ts`, shared with the other
 * three boundaries. What stayed here is what only /reading knows: the kind
 * vocabulary, the note that is allowed to be absent, the domain cross-check, and
 * every error message.
 *
 * One thing /reading does that no other section does. Every other entry on the
 * site gets a page of its own — `/tools/<slug>`, `/sites/<slug>`, `/notes/<slug>`
 * — and a reading row does not. A row's destination is the article, so the title
 * links straight out and there is nothing at `/reading/<slug>`. A page about a
 * link, holding one line I wrote and a button to leave, would be a stop on the
 * way to the thing rather than the thing.
 *
 * The slug survives that decision anyway, and is still parsed and still has to
 * be unique. It is the key the publish pipeline writes into `pipeline/state.json`
 * to remember that a bookmark has already been published, so it is a real
 * identifier even though it is not currently a URL.
 */

import type { Fail } from "./parse";
import { SLUG, readers, routeSlug } from "./parse";

import rawReading from "../data/reading.json";

/**
 * What a saved link is. Ordered as the page and the filter bar order them:
 * longest sit-down first, so a reader scanning for something to actually read
 * meets `article` before `post`.
 */
export const KINDS = ["article", "post", "video"] as const;

export type Kind = (typeof KINDS)[number];

export interface ReadingEntry {
  /** URL-safe id. Not a page — see the note at the top of this file. */
  slug: string;
  title: string;
  url: string;
  /** Hostname without `www.`; also the filter page (`/reading/domain/<slug>`). */
  domain: string;
  /** ISO calendar date (YYYY-MM-DD) the link was saved. */
  saved_date: string;
  kind: Kind;
  /**
   * One line in Aayush's voice, rendered as-is, or null.
   *
   * Null is a real answer rather than an empty string: the pipeline publishes a
   * bookmark whether or not Raindrop gave it an excerpt, and a row with nothing
   * to say should say nothing instead of reserving a blank line to say it in.
   */
  note: string | null;
}

/**
 * Both groups are `type` rather than `interface` for the reason spelled out in
 * `lib/tools.ts`: they are handed to `getStaticPaths` as a route's props, and
 * only a type alias gets the implicit index signature Astro expects there.
 */
export type KindGroup = {
  kind: Kind;
  entries: ReadingEntry[];
};

export type ReadingDomainGroup = {
  domain: string;
  slug: string;
  entries: ReadingEntry[];
};

/* ---------------------------------------------------------------------------
   Parsing
   --------------------------------------------------------------------------- */

const KIND_NAMES: readonly string[] = KINDS;

const READ = readers("reading.json");
/** Annotated, or TypeScript stops treating a call as the end of control flow. */
const fail: Fail = READ.fail;
const { readString, readDate, isRecord } = READ;

function isKind(value: unknown): value is Kind {
  return typeof value === "string" && KIND_NAMES.includes(value);
}

/** Returns the parsed URL so the caller can cross-check the domain against it. */
function readUrl(entry: Record<string, unknown>, where: string): URL {
  const value = readString(entry, "url", where);

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail(where, `has a "url" that does not parse: ${JSON.stringify(value)}`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    fail(where, `has a "url" that is not http(s): ${JSON.stringify(value)}`);
  }
  return parsed;
}

/**
 * The domain is a route, a label and a filter key at once, so it has to agree
 * with the URL it claims to describe. Same rule as /sites, for the same reason:
 * a typo here would mint a filter page for a host nothing links to.
 */
function readDomain(
  entry: Record<string, unknown>,
  url: URL,
  where: string,
): string {
  const value = readString(entry, "domain", where);
  const expected = url.hostname.replace(/^www\./, "");

  if (value !== expected) {
    fail(
      where,
      `has "domain" ${JSON.stringify(value)} but its url points at ${JSON.stringify(expected)}`,
    );
  }
  return value;
}

/**
 * Absent, explicitly null, or a sentence. A present-but-empty note is rejected
 * rather than quietly folded into null: it means something upstream wrote a
 * blank where it meant to write nothing, and that is worth hearing about.
 */
function readNote(entry: Record<string, unknown>, where: string): string | null {
  const value = entry["note"];
  if (value === undefined || value === null) return null;

  if (typeof value !== "string" || value.trim() === "") {
    fail(
      where,
      `needs "note" to be a non-empty string, null, or absent (got ${JSON.stringify(value)})`,
    );
  }
  return value;
}

export function parseReading(value: unknown): ReadingEntry[] {
  if (!Array.isArray(value)) fail("root", "must be a JSON array of reading entries");
  if (value.length === 0) fail("root", "must hold at least one reading entry");

  const slugs = new Set<string>();

  const parsed = value.map((item: unknown, index): ReadingEntry => {
    const where = `entry ${index}`;
    if (!isRecord(item)) fail(where, "must be an object");

    const slug = readString(item, "slug", where);
    if (!SLUG.test(slug)) {
      fail(where, `has a slug that is not URL-safe: ${JSON.stringify(slug)}`);
    }
    if (slugs.has(slug)) {
      fail(where, `repeats the slug "${slug}"; slugs are the pipeline's key and must be unique`);
    }
    slugs.add(slug);

    const kind = item["kind"];
    if (!isKind(kind)) {
      fail(where, `needs "kind" to be one of ${KINDS.join(", ")} (got ${JSON.stringify(kind)})`);
    }

    const url = readUrl(item, where);

    return {
      slug,
      title: readString(item, "title", where),
      // Returned as authored, not as `url.href`, which would rewrite a bare
      // origin with a trailing slash and change what the row shows.
      url: readString(item, "url", where),
      domain: readDomain(item, url, where),
      saved_date: readDate(item, "saved_date", where),
      kind,
      note: readNote(item, where),
    };
  });

  // Domains become routes too, so two spellings must not land on one page.
  const claimed = new Map<string, string>();
  for (const entry of parsed) {
    const slug = routeSlug(entry.domain);
    const where = `entry for "${entry.slug}"`;
    if (slug === "") {
      fail(where, `has a domain with no URL-safe characters: ${JSON.stringify(entry.domain)}`);
    }
    const owner = claimed.get(slug);
    if (owner !== undefined && owner !== entry.domain) {
      fail(
        where,
        `has domain ${JSON.stringify(entry.domain)}, which collides with ${JSON.stringify(owner)} at /reading/domain/${slug}`,
      );
    }
    claimed.set(slug, entry.domain);
  }

  return parsed;
}

/* ---------------------------------------------------------------------------
   Derived views — computed once, at build time
   --------------------------------------------------------------------------- */

/** Newest save first; ties keep the order they were written in the JSON. */
export const reading: ReadingEntry[] = parseReading(rawReading)
  .map((entry, index) => ({ entry, index }))
  .sort((a, b) =>
    a.entry.saved_date === b.entry.saved_date
      ? a.index - b.index
      : b.entry.saved_date.localeCompare(a.entry.saved_date),
  )
  .map(({ entry }) => entry);

/** Kinds in vocabulary order, empty ones dropped: no page without entries. */
export const kindGroups: KindGroup[] = KINDS.map((kind) => ({
  kind,
  entries: reading.filter((entry) => entry.kind === kind),
})).filter((group) => group.entries.length > 0);

export const readingDomains: ReadingDomainGroup[] = (() => {
  const groups = new Map<string, ReadingDomainGroup>();

  for (const entry of reading) {
    const group = groups.get(entry.domain);
    if (group) {
      group.entries.push(entry);
    } else {
      groups.set(entry.domain, {
        domain: entry.domain,
        slug: routeSlug(entry.domain),
        entries: [entry],
      });
    }
  }

  return [...groups.values()];
})();
