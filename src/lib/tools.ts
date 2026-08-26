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
 */

import rawTools from "../data/tools.json";

export const VERDICTS = ["using", "watching", "on-hold", "skipped"] as const;

export type Verdict = (typeof VERDICTS)[number];

export interface Tool {
  /** URL-safe id; also the details page path (`/tools/<slug>`). */
  slug: string;
  name: string;
  /** null when the tool has no public URL worth linking. Renders unlinked. */
  url: string | null;
  category: string;
  verdict: Verdict;
  /** One line, in Aayush's voice. Rendered as-is; never editorialised. */
  note: string;
  /** ISO calendar date (YYYY-MM-DD) the verdict was last true. */
  status_date: string;
}

export interface ToolGroup {
  category: string;
  slug: string;
  tools: Tool[];
}

export interface VerdictGroup {
  verdict: Verdict;
  tools: Tool[];
}

/* ---------------------------------------------------------------------------
   Parsing
   --------------------------------------------------------------------------- */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VERDICT_NAMES: readonly string[] = VERDICTS;

function fail(where: string, problem: string): never {
  throw new Error(`src/data/tools.json: ${where} ${problem}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

  // Returned as authored, not as `parsed.toString()`, which would rewrite bare
  // origins with a trailing slash and change what the page shows.
  return value;
}

function readDate(entry: Record<string, unknown>, where: string): string {
  const value = readString(entry, "status_date", where);
  const time = Date.parse(`${value}T00:00:00Z`);
  const isRealDate =
    ISO_DATE.test(value) &&
    !Number.isNaN(time) &&
    new Date(time).toISOString().slice(0, 10) === value;

  if (!isRealDate) {
    fail(where, `needs "status_date" as a real YYYY-MM-DD date (got ${JSON.stringify(value)})`);
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
      category: readString(item, "category", where),
      verdict,
      note: readString(item, "note", where),
      status_date: readDate(item, where),
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

export function categorySlug(category: string): string {
  return category
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Google's favicon service. The only third-party host the site touches. */
export function faviconUrl(url: string): string {
  const host = new URL(url).hostname;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
}

/** `github.com/block/buzz` — the link without the protocol noise. */
export function linkLabel(url: string): string {
  const parsed = new URL(url);
  const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  return `${parsed.hostname.replace(/^www\./, "")}${path}${parsed.search}`;
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
