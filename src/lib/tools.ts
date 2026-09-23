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
 * The generic half of the parse (slug, date, non-empty string, display name)
 * comes from `lib/parse.ts`. What stays here is what only /tools knows: the
 * verdicts, the URL rule, the product-versus-repository split (the repo shape
 * itself is `lib/links.ts › githubRepo`), the category-collision check, and
 * every error message, written for the person who has to fix the file.
 */

import { githubRepo, readLogoDomain } from "./links";
import type { Fail } from "./parse";
import { SLUG, readers, routeSlug } from "./parse";

import rawTools from "../data/tools.json";

export const VERDICTS = ["using", "watching", "on-hold", "skipped"] as const;

export type Verdict = (typeof VERDICTS)[number];

/** A verdict as a reader sees it: the /tools/verdict heading and the feed line. */
export const VERDICT_LABELS: Record<Verdict, string> = {
  using: "Using",
  watching: "Watching",
  "on-hold": "On hold",
  skipped: "Skipped",
};

export interface Tool {
  /** URL-safe id; also the details page path (`/tools/<slug>`). */
  slug: string;
  name: string;
  /**
   * The product's own site, and only that; null when its only home is a repo.
   * A repository here fails the build: filed as `url` it showed the GitHub
   * logo and "github.com" where the product's name and real site should be.
   */
  url: string | null;
  /** `https://github.com/{owner}/{name}`, canonical, or null. Independent of `url`. */
  repo: string | null;
  /** The repository was moved or archived after the verdict: labelled so on the page. */
  repo_moved: boolean;
  /** logo.dev's domain when `url`'s host is the wrong brand; null for none (`links.ts › logoDomain`). */
  logoDomain?: string | null;
  category: string;
  verdict: Verdict;
  /** One line, in Aayush's voice. Rendered as-is; never editorialised. */
  note: string;
  /** What the tool is, in a sentence. Not parsed yet (briOS T2): rows fall back to `note`. */
  description?: string;
  /** ISO calendar date (YYYY-MM-DD) the verdict was last true. */
  status_date: string;

  /* --- the voice fields: four optional sentences, null on most entries, written
     by hand only. A null renders nothing; a stand-in sentence would be the site
     putting words in his mouth, and the pipeline cannot know what he thought. */

  /** What is good about it. */
  like: string | null;
  /** What is not. Named "what I don't" on the page, because it is rarely hate. */
  dislike: string | null;
  /** When to reach for this one instead of the next one along. */
  why: string | null;
  /** One command or link, so a reader can go and find out for themselves. */
  try: string | null;
}

/** `type`, not `interface`: route props need the implicit index signature `GetStaticPaths` asks for. */
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
const { readString, readDate, readOptional, readName, isRecord } = READ;

/**
 * Where new saves land (`pipeline/entries.mjs › NEW_TOOL_CATEGORY`): an inbox,
 * not a category. Allowed, so a publish never breaks the build, but warned
 * about, and shown to readers as "new" rather than as a filing failure.
 */
const INBOX = "unsorted";

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

    const category = readString(item, "category", where);
    if (category === INBOX) console.warn(`src/data/tools.json: ${where} "${slug}" is still ${INBOX}; give it a category`);

    const verdict = item["verdict"];
    if (!isVerdict(verdict)) {
      fail(
        where,
        `needs "verdict" to be one of ${VERDICTS.join(", ")} (got ${JSON.stringify(verdict)})`,
      );
    }

    return {
      slug,
      name: readName(item, "name", where),
      url: readUrl(item, where),
      repo: readRepo(item, where),
      repo_moved: item["repo_moved"] === true,
      ...readLogoDomain(item, (problem) => fail(where, problem)),
      category: category === INBOX ? "new" : category,
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
