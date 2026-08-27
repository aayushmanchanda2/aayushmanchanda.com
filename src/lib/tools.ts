/**
 * The /tools data boundary.
 *
 * `src/data/tools.json` is hand-edited today and appended to by the publish
 * pipeline later, so it is untrusted input until it has been parsed. Everything
 * below runs once at build time and throws on the first bad entry: broken data
 * must fail `astro build` loudly rather than render as a half-empty row.
 *
 * Past this module the types are earned, so the rest of the site can trust
 * them. Nothing here uses an `as` cast to skip that work.
 *
 * The generic half of the parse — the slug shape, the date check, "is this a
 * non-empty string" — comes from `lib/parse.ts`, which all three data
 * boundaries share. What stayed here is what only /tools knows: the verdict
 * vocabulary, the http(s) URL rule, the product-versus-repository split, the
 * category-collision check, and every error message, which are written for the
 * person who has to go and fix the file.
 *
 * The shape of a repository URL is not one of those. It is a fact about a URL,
 * so it lives in `lib/links.ts › githubRepo` alongside `linkLabel`, and the
 * publish pipeline is held to the same rule from the other side.
 */

import { githubRepo } from "./links";
import type { Fail } from "./parse";
import { SLUG, readers, routeSlug } from "./parse";

import rawTools from "../data/tools.json";

export const VERDICTS = ["using", "watching", "on-hold", "skipped"] as const;

export type Verdict = (typeof VERDICTS)[number];

export interface Tool {
  /** URL-safe id; also the details page path (`/tools/<slug>`). */
  slug: string;
  name: string;
  /**
   * The product's own site, and only that.
   *
   * null is the ordinary answer for half this list, because half of it is
   * software whose only home is a repository. A repository goes in `repo`; a
   * repository written here fails the build, which is the whole point of the
   * split — a row whose `url` was `github.com/owner/name` showed the GitHub
   * logo, said "github.com" where the product's name should be, and hid the
   * real site of every tool that had one.
   */
  url: string | null;
  /**
   * `https://github.com/{owner}/{name}`, canonically spelled, or null.
   *
   * Independent of `url` in both directions: a tool can have a product site and
   * no public source, source and no site, both, or neither. The pages render
   * whichever it has.
   */
  repo: string | null;
  category: string;
  verdict: Verdict;
  /** One line, in Aayush's voice. Rendered as-is; never editorialised. */
  note: string;
  /** ISO calendar date (YYYY-MM-DD) the verdict was last true. */
  status_date: string;

  /* --- the voice fields ----------------------------------------------------
     Four optional sentences that say more than a verdict can. All four are null
     on most entries and that is the intended state: a tool earns one of these
     when there is a real opinion to record, and the details page renders
     nothing at all for the ones that are null. There is no fallback text,
     because a stand-in sentence would be the site putting words in his mouth.

     Written by hand only. `pipeline/entries.mjs` does not author any of them —
     it can tell you a bookmark exists, not what he thought of it. */

  /** What is good about it. */
  like: string | null;
  /** What is not. Named "what I don't" on the page, because it is rarely hate. */
  dislike: string | null;
  /** When to reach for this one instead of the next one along. */
  why: string | null;
  /** One command or link, so a reader can go and find out for themselves. */
  try: string | null;
}

/**
 * Both groups are `type` rather than `interface` on purpose.
 *
 * They are handed straight to `getStaticPaths` as a route's props, and Astro
 * types props as an index-signature record. TypeScript gives an object *type
 * alias* an implicit index signature and an *interface* none, so an interface
 * here fails to satisfy `GetStaticPaths` for a reason that has nothing to do
 * with the shape. The alternative was to spread the group at every call site.
 */
export type ToolGroup = {
  category: string;
  slug: string;
  tools: Tool[];
};

export type VerdictGroup = {
  verdict: Verdict;
  tools: Tool[];
};

/* ---------------------------------------------------------------------------
   Parsing
   --------------------------------------------------------------------------- */

const VERDICT_NAMES: readonly string[] = VERDICTS;

const READ = readers("tools.json");
/** Annotated, or TypeScript stops treating a call as the end of control flow. */
const fail: Fail = READ.fail;
const { readString, readDate, readOptional, isRecord } = READ;

function isVerdict(value: unknown): value is Verdict {
  return typeof value === "string" && VERDICT_NAMES.includes(value);
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function readUrl(entry: Record<string, unknown>, where: string): string | null {
  const value = entry["url"];
  if (value === null) return null;
  if (typeof value !== "string") {
    fail(where, `needs "url" to be a string or null (got ${JSON.stringify(value)})`);
  }

  const parsed = safeUrl(value);
  if (parsed === null) {
    fail(where, `has a "url" that does not parse: ${JSON.stringify(value)}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    fail(where, `has a "url" that is not http(s): ${JSON.stringify(value)}`);
  }

  if (githubRepo(value) !== null) {
    fail(
      where,
      `has a GitHub repository in "url": ${JSON.stringify(value)}. A repository ` +
        `goes in "repo"; "url" is the product's own site, or null when there is not one.`,
    );
  }

  // Returned as authored, not as `parsed.toString()`, which would rewrite bare
  // origins with a trailing slash and change what the page shows.
  return value;
}

/**
 * The repository, or null.
 *
 * Stricter than `url` on purpose, in the one way that matters: the value has to
 * already be canonical. `githubRepo` will happily fold `.../buzz.git` and
 * `.../buzz/` down to the same repository, and accepting either here would let
 * three spellings of one repo sit in the file and render three different link
 * labels. So a non-canonical spelling stops the build and the message says what
 * to write instead, which is a five-second fix rather than a hunt.
 */
function readRepo(entry: Record<string, unknown>, where: string): string | null {
  const value = entry["repo"];
  if (value === undefined || value === null) return null;

  if (typeof value !== "string") {
    fail(where, `needs "repo" to be a string or null (got ${JSON.stringify(value)})`);
  }

  const canonical = githubRepo(value);
  if (canonical === null) {
    fail(
      where,
      `has a "repo" that is not a github.com/{owner}/{name} URL: ${JSON.stringify(value)}. ` +
        `A profile, a branch, a file and a gist are none of them a repository.`,
    );
  }
  if (canonical !== value) {
    fail(
      where,
      `has a "repo" that is not written canonically: ${JSON.stringify(value)}. ` +
        `Write it as ${JSON.stringify(canonical)}.`,
    );
  }

  return value;
}

export function parseTools(value: unknown): Tool[] {
  if (!Array.isArray(value)) fail("root", "must be a JSON array of tool entries");
  if (value.length === 0) fail("root", "must hold at least one tool entry");

  const slugs = new Set<string>();

  const parsed = value.map((item: unknown, index): Tool => {
    const where = `entry ${index}`;
    if (!isRecord(item)) fail(where, "must be an object");

    const slug = readString(item, "slug", where);
    if (!SLUG.test(slug)) {
      fail(where, `has a slug that is not URL-safe: ${JSON.stringify(slug)}`);
    }
    if (slugs.has(slug)) {
      fail(where, `repeats the slug "${slug}"; slugs are page URLs and must be unique`);
    }
    slugs.add(slug);

    const verdict = item["verdict"];
    if (!isVerdict(verdict)) {
      fail(
        where,
        `needs "verdict" to be one of ${VERDICTS.join(", ")} (got ${JSON.stringify(verdict)})`,
      );
    }

    return {
      slug,
      name: readString(item, "name", where),
      url: readUrl(item, where),
      repo: readRepo(item, where),
      category: readString(item, "category", where),
      verdict,
      note: readString(item, "note", where),
      status_date: readDate(item, "status_date", where),
      like: readOptional(item, "like", where),
      dislike: readOptional(item, "dislike", where),
      why: readOptional(item, "why", where),
      try: readOptional(item, "try", where),
    };
  });

  // Categories become routes too, so two spellings must not land on one page.
  const claimed = new Map<string, string>();
  for (const tool of parsed) {
    const slug = categorySlug(tool.category);
    const where = `entry for "${tool.slug}"`;
    if (slug === "") {
      fail(where, `has a category with no URL-safe characters: ${JSON.stringify(tool.category)}`);
    }
    const owner = claimed.get(slug);
    if (owner !== undefined && owner !== tool.category) {
      fail(
        where,
        `has category ${JSON.stringify(tool.category)}, which collides with ${JSON.stringify(owner)} at /tools/category/${slug}`,
      );
    }
    claimed.set(slug, tool.category);
  }

  return parsed;
}

/* ---------------------------------------------------------------------------
   Derived views — computed once, at build time
   --------------------------------------------------------------------------- */

/** Via the fold in `lib/parse.ts` that /sites and /library share. */
export function categorySlug(category: string): string {
  return routeSlug(category);
}

/** Groups in the order the categories first appear in the JSON. */
export function groupByCategory(list: readonly Tool[]): ToolGroup[] {
  const groups = new Map<string, ToolGroup>();

  for (const tool of list) {
    const group = groups.get(tool.category);
    if (group) {
      group.tools.push(tool);
    } else {
      groups.set(tool.category, {
        category: tool.category,
        slug: categorySlug(tool.category),
        tools: [tool],
      });
    }
  }

  return [...groups.values()];
}

export const tools: Tool[] = parseTools(rawTools);

export const categories: ToolGroup[] = groupByCategory(tools);

/** Verdicts in rank order, empty ones dropped: no page without entries. */
export const verdictGroups: VerdictGroup[] = VERDICTS.map((verdict) => ({
  verdict,
  tools: tools.filter((tool) => tool.verdict === verdict),
})).filter((group) => group.tools.length > 0);
