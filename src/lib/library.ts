/**
 * The /library data boundary.
 *
 * Same contract as `lib/tools.ts` and `lib/sites.ts`: `src/data/library.json` is
 * untrusted input until it has been parsed here, everything runs once at build
 * time, and the first bad entry throws instead of rendering. Nothing here uses
 * an `as` cast to skip that work.
 *
 * The generic half of the parse comes from `lib/parse.ts`, shared with the other
 * three boundaries. What stayed here is what only /library knows: the kind
 * vocabulary, the note that is allowed to be absent, the domain cross-check, and
 * every error message.
 *
 * One thing /library does that no other section does. Every other entry on the
 * site gets a page of its own — `/tools/<slug>`, `/sites/<slug>`, `/notes/<slug>`
 * — and a library row, by default, does not. A row's destination is the thing
 * itself, so the title links straight out. A page about a link, holding one line
 * I wrote and a button to leave, would be a stop on the way to the thing rather
 * than the thing.
 *
 * A digest changes that answer, because it changes what the page would hold.
 * When the Hermes digest skill has actually read a saved piece and written the
 * cliff notes and a read-it-or-skip-it call, there is something at
 * `/library/<slug>` worth stopping for, so that entry gets a detail page and its
 * row links there instead. Entries without a digest keep the old answer: no
 * page, no stub, nothing "coming soon" — the same honest-absence rule
 * `lib/sections.ts` applies to whole sections.
 *
 * The slug is therefore a URL only for digested entries. It is still parsed and
 * still has to be unique for every entry either way: it is the key the publish
 * pipeline writes into `pipeline/state.json` to remember that a bookmark has
 * already been published.
 *
 * The pipeline still calls this section `reading`, and that is deliberate: its
 * section key is the name of the Raindrop collection Aayush saves into
 * (`Publish/Reading`), which is his to rename and not this repo's. The
 * translation happens once, at the line in `pipeline/state.mjs` that names the
 * file this module reads.
 */

import type { Fail } from "./parse";
import { SLUG, readers, routeSlug } from "./parse";

import rawLibrary from "../data/library.json";

/**
 * What a saved link is. Ordered as the page and the filter bar order them:
 * longest sit-down first, so a reader scanning for something to actually read
 * meets `article` before `post`.
 */
export const KINDS = ["article", "post", "video"] as const;

export type Kind = (typeof KINDS)[number];

/**
 * The plural of each kind, for a heading or a tab.
 *
 * Here rather than in either of the two files that render it: the tab row and
 * the kind page's own `h1` are two surfaces naming the same three things, and
 * the first one to disagree would be the one nobody notices. `Record<Kind, …>`,
 * so a fourth kind will not compile until it has been named.
 */
export const KIND_LABELS: Record<Kind, string> = {
  article: "Articles",
  post: "Posts",
  video: "Videos",
};

/**
 * The digest a saved link may carry: what the piece says, and whether reading
 * it is worth your time. Written by the Hermes digest skill after actually
 * reading the source, never from the title alone, which is why the whole
 * object is optional: an entry either has a real digest or it has none.
 *
 * All four fields are required once the object is there. A digest with bullets
 * and no verdict is a summary, and a summary was never the point — the verdict
 * and the why are what earn the entry its page.
 */
export interface Digest {
  /** Three to five load-bearing claims from the piece, one line each. */
  bullets: string[];
  /** The read-it-or-skip-it call, one sentence, a real opinion. */
  verdict: string;
  /** Why it matters, or doesn't. About the reader's time, not the piece. */
  why: string;
  /** ISO calendar date (YYYY-MM-DD) the digest was written. The opinion's date. */
  digested: string;
}

export interface LibraryEntry {
  /** URL-safe id, and the detail page's URL when the entry is digested. */
  slug: string;
  title: string;
  url: string;
  /** Hostname without `www.`; also the filter page (`/library/domain/<slug>`). */
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
  /**
   * The digest, or null. Null is the ordinary case: most saves have not been
   * read yet, and an undigested entry has no detail page to describe.
   */
  digest: Digest | null;
}

/** An entry that has earned its page. What `/library/[slug]` builds from. */
export type DigestedEntry = LibraryEntry & { digest: Digest };

/**
 * Both groups are `type` rather than `interface` for the reason spelled out in
 * `lib/tools.ts`: they are handed to `getStaticPaths` as a route's props, and
 * only a type alias gets the implicit index signature Astro expects there.
 */
export type KindGroup = {
  kind: Kind;
  entries: LibraryEntry[];
};

export type LibraryDomainGroup = {
  domain: string;
  slug: string;
  entries: LibraryEntry[];
};

/* ---------------------------------------------------------------------------
   Parsing
   --------------------------------------------------------------------------- */

const KIND_NAMES: readonly string[] = KINDS;

const READ = readers("library.json");
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

/**
 * Absent, explicitly null, or the whole thing. A digest is one judgement, so a
 * partial one — bullets with no verdict, a verdict with no date — is a
 * half-finished edit and stops the build the way every other half-finished
 * edit here does.
 *
 * Bullets are held to one line each. The detail page renders them as list
 * items and the markdown variant renders them as `- ` lines, and a newline
 * inside one would quietly become a second, unmarked bullet in the second
 * rendering only.
 */
function readDigest(entry: Record<string, unknown>, where: string): Digest | null {
  const value = entry["digest"];
  if (value === undefined || value === null) return null;

  if (!isRecord(value)) {
    fail(where, `needs "digest" to be an object, null, or absent (got ${JSON.stringify(value)})`);
  }

  const raw = value["bullets"];
  if (!Array.isArray(raw) || raw.length === 0) {
    fail(where, `needs "digest.bullets" to be a non-empty array of one-line strings`);
  }
  const bullets = raw.map((bullet: unknown, index): string => {
    if (typeof bullet !== "string" || bullet.trim() === "" || bullet.includes("\n")) {
      fail(
        where,
        `needs "digest.bullets" entry ${index} to be one non-empty line (got ${JSON.stringify(bullet)})`,
      );
    }
    return bullet;
  });

  return {
    bullets,
    verdict: readString(value, "verdict", `${where} digest`),
    why: readString(value, "why", `${where} digest`),
    digested: readDate(value, "digested", `${where} digest`),
  };
}

export function parseLibrary(value: unknown): LibraryEntry[] {
  if (!Array.isArray(value)) fail("root", "must be a JSON array of library entries");
  if (value.length === 0) fail("root", "must hold at least one library entry");

  const slugs = new Set<string>();

  const parsed = value.map((item: unknown, index): LibraryEntry => {
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
      digest: readDigest(item, where),
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
        `has domain ${JSON.stringify(entry.domain)}, which collides with ${JSON.stringify(owner)} at /library/domain/${slug}`,
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
export const library: LibraryEntry[] = parseLibrary(rawLibrary)
  .map((entry, index) => ({ entry, index }))
  .sort((a, b) =>
    a.entry.saved_date === b.entry.saved_date
      ? a.index - b.index
      : b.entry.saved_date.localeCompare(a.entry.saved_date),
  )
  .map(({ entry }) => entry);

/**
 * The entries with detail pages, in the order the /library list renders them.
 *
 * This is the whole route table for `/library/[slug]`, and it is also the ring
 * the keyboard nav walks — one order, so pressing → on a detail page moves the
 * way the eye moved down the list. The filter narrows `digest` from
 * `Digest | null` to `Digest`, which is what lets the page read
 * `entry.digest.bullets` without a runtime check it has already done here.
 */
export const digested: DigestedEntry[] = library.filter(
  (entry): entry is DigestedEntry => entry.digest !== null,
);

/** Kinds in vocabulary order, empty ones dropped: no page without entries. */
export const kindGroups: KindGroup[] = KINDS.map((kind) => ({
  kind,
  entries: library.filter((entry) => entry.kind === kind),
})).filter((group) => group.entries.length > 0);

export const libraryDomains: LibraryDomainGroup[] = (() => {
  const groups = new Map<string, LibraryDomainGroup>();

  for (const entry of library) {
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
