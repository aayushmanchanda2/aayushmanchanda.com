/**
 * The /experiments data boundary.
 *
 * Same contract as `lib/tools.ts` and `lib/sites.ts`: `src/data/experiments.json`
 * is untrusted input until it has been parsed here, everything runs once at
 * build time, and the first bad entry throws instead of rendering. Nothing here
 * uses an `as` cast to skip that work.
 *
 * One deliberate difference from the other two. An empty array is legal here.
 * /tools and /sites refuse to be empty because they are seeded and pipeline-fed,
 * so an empty file means something broke. /experiments is hand-written, and the
 * empty-state rule in the plan says a section with no entries drops out of the
 * nav and the home index rather than shipping a "coming soon" page. That rule
 * needs a section that can legally reach zero.
 */

import rawExperiments from "../data/experiments.json";

/** Rank order, not alphabetical: this is also the order the page renders in. */
export const STATUSES = ["running", "paused", "shipped", "killed"] as const;

export type Status = (typeof STATUSES)[number];

export interface Experiment {
  /** URL-safe id. Not a page today; kept as the stable key for links to it. */
  slug: string;
  name: string;
  status: Status;
  /** One line, in Aayush's voice. Rendered as-is; never editorialised. */
  one_liner: string;
  /** ISO calendar date (YYYY-MM-DD) the experiment started. */
  started: string;
  /** Site-relative paths (`/sites`) or absolute http(s) URLs. Never empty. */
  links: string[];
}

/* ---------------------------------------------------------------------------
   Parsing
   --------------------------------------------------------------------------- */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const INTERNAL_PATH = /^\/[a-z0-9][a-z0-9\-/]*$/;
const STATUS_NAMES: readonly string[] = STATUSES;

function fail(where: string, problem: string): never {
  throw new Error(`src/data/experiments.json: ${where} ${problem}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStatus(value: unknown): value is Status {
  return typeof value === "string" && STATUS_NAMES.includes(value);
}

function readString(
  entry: Record<string, unknown>,
  key: string,
  where: string,
): string {
  const value = entry[key];
  if (typeof value !== "string" || value.trim() === "") {
    fail(where, `needs a non-empty string "${key}" (got ${JSON.stringify(value)})`);
  }
  return value;
}

function readDate(entry: Record<string, unknown>, where: string): string {
  const value = readString(entry, "started", where);
  const time = Date.parse(`${value}T00:00:00Z`);
  const isRealDate =
    ISO_DATE.test(value) &&
    !Number.isNaN(time) &&
    new Date(time).toISOString().slice(0, 10) === value;

  if (!isRealDate) {
    fail(where, `needs "started" as a real YYYY-MM-DD date (got ${JSON.stringify(value)})`);
  }
  return value;
}

/**
 * Links are optional in the JSON and always an array past this point, so the
 * page renders `links.length` instead of juggling undefined.
 *
 * Two shapes are allowed: a site-relative path, which is how an experiment
 * points at the section it produced, and an http(s) URL for anything outside.
 * A relative path with no leading slash would silently resolve against the
 * current page, so it is rejected rather than guessed at.
 */
function readLinks(entry: Record<string, unknown>, where: string): string[] {
  const value = entry["links"];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    fail(where, `needs "links" to be an array of paths or URLs (got ${JSON.stringify(value)})`);
  }

  return value.map((link: unknown, index): string => {
    if (typeof link !== "string" || link.trim() === "") {
      fail(where, `has an empty link at position ${index}`);
    }

    if (link.startsWith("/")) {
      if (!INTERNAL_PATH.test(link)) {
        fail(where, `has an internal link that is not a plain path: ${JSON.stringify(link)}`);
      }
      return link;
    }

    let parsed: URL;
    try {
      parsed = new URL(link);
    } catch {
      fail(
        where,
        `has a link that is neither a site path nor a URL: ${JSON.stringify(link)}`,
      );
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      fail(where, `has a link that is not http(s): ${JSON.stringify(link)}`);
    }
    return link;
  });
}

export function parseExperiments(value: unknown): Experiment[] {
  if (!Array.isArray(value)) {
    fail("root", "must be a JSON array of experiment entries");
  }

  const slugs = new Set<string>();

  return value.map((item: unknown, index): Experiment => {
    const where = `entry ${index}`;
    if (!isRecord(item)) fail(where, "must be an object");

    const slug = readString(item, "slug", where);
    if (!SLUG.test(slug)) {
      fail(where, `has a slug that is not URL-safe: ${JSON.stringify(slug)}`);
    }
    if (slugs.has(slug)) {
      fail(where, `repeats the slug "${slug}"; slugs are link targets and must be unique`);
    }
    slugs.add(slug);

    const status = item["status"];
    if (!isStatus(status)) {
      fail(
        where,
        `needs "status" to be one of ${STATUSES.join(", ")} (got ${JSON.stringify(status)})`,
      );
    }

    return {
      slug,
      name: readString(item, "name", where),
      status,
      one_liner: readString(item, "one_liner", where),
      started: readDate(item, where),
      links: readLinks(item, where),
    };
  });
}

/* ---------------------------------------------------------------------------
   Derived views — computed once, at build time
   --------------------------------------------------------------------------- */

const RANK = new Map(STATUSES.map((status, index) => [status, index]));

/**
 * Live work first, dead work last, newest first inside each band.
 *
 * Killed experiments stay on the page on purpose, but a page that opens with
 * them would be a graveyard rather than a record of what is going on.
 */
export const experiments: Experiment[] = parseExperiments(rawExperiments).sort(
  (a, b) => {
    const byStatus = (RANK.get(a.status) ?? 0) - (RANK.get(b.status) ?? 0);
    return byStatus !== 0 ? byStatus : b.started.localeCompare(a.started);
  },
);
