/**
 * The /sites data boundary.
 *
 * Same contract as `lib/tools.ts`: `src/data/sites.json` is untrusted until it
 * has been parsed here, everything runs once at build time, and the first bad
 * entry throws instead of rendering.
 *
 * One extra job that /tools does not have. A site entry is mostly a picture,
 * and a picture that 404s is worse than no gallery at all — the card renders,
 * the layout holds, and nothing looks broken until someone scrolls past an
 * empty box. So every shot path is checked against the filesystem while the
 * site is being built. A JSON entry pointing at a missing WebP fails
 * `astro build` and never reaches a deploy.
 *
 * Nothing here uses an `as` cast to skip that work.
 *
 * The generic half of the parse comes from `lib/parse.ts`, shared with the
 * other two boundaries. The shot guard, the domain cross-check and every error
 * message stayed here: they are what /sites knows and the other two do not.
 */

import { existsSync } from "node:fs";
import path from "node:path";

import type { Fail } from "./parse";
import { SLUG, readers, routeSlug } from "./parse";

import rawSites from "../data/sites.json";

export interface SiteShots {
  /** Web path under /shots. Always present: an entry needs a picture. */
  light: string;
  /** null when the site has no dark rendering worth shooting. */
  dark: string | null;
}

export interface Site {
  /** URL-safe id; also the details page path (`/sites/<slug>`). */
  slug: string;
  title: string;
  url: string;
  /** Hostname without `www.`; also the filter page (`/sites/domain/<slug>`). */
  domain: string;
  /** ISO calendar date (YYYY-MM-DD) the site was saved. */
  saved_date: string;
  shots: SiteShots;
}

/**
 * `type` rather than `interface`: this is handed to `getStaticPaths` as a
 * route's props, and only a type alias gets the implicit index signature Astro
 * expects there. Same call as `ToolGroup` in `lib/tools.ts`.
 */
export type DomainGroup = {
  domain: string;
  slug: string;
  sites: Site[];
};

/* ---------------------------------------------------------------------------
   Parsing
   --------------------------------------------------------------------------- */

const SHOT_PATH = /^\/shots\/[a-z0-9][a-z0-9-]*\.webp$/;

const READ = readers("sites.json");
/** Annotated, or TypeScript stops treating a call as the end of control flow. */
const fail: Fail = READ.fail;
const { readString, readDate, isRecord } = READ;

/**
 * `public/` — the web root, so a `/shots/…` path resolves by joining here.
 *
 * Anchored to the working directory, not to `import.meta.url`: by the time
 * this module runs during `astro build` it has been bundled into
 * `dist/.prerender/chunks/`, and a relative walk from there lands nowhere.
 * Astro runs from the project root in both dev and build.
 */
const PUBLIC_DIR = path.join(process.cwd(), "public");

if (!existsSync(PUBLIC_DIR)) {
  throw new Error(
    `src/lib/sites.ts: no public/ directory at ${PUBLIC_DIR}. ` +
      `Astro must run from the project root for the shot guard to work.`,
  );
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
 * The domain is a route, a label, and a filter key at once, so it has to agree
 * with the URL it claims to describe. A typo here would otherwise mint a
 * filter page for a site that does not exist.
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
 * Shot paths are web paths (`/shots/name-light.webp`) and must exist under
 * `public/` right now. This is the build guard: no entry ships without its
 * imagery on disk.
 */
function readShots(
  entry: Record<string, unknown>,
  slug: string,
  where: string,
): SiteShots {
  const value = entry["shots"];
  if (!isRecord(value)) {
    fail(where, `needs "shots" to be an object with "light" and "dark"`);
  }

  const check = (which: "light" | "dark", shot: string): string => {
    if (!SHOT_PATH.test(shot)) {
      fail(
        where,
        `has a ${which} shot that is not a /shots/*.webp path: ${JSON.stringify(shot)}`,
      );
    }
    const onDisk = path.join(PUBLIC_DIR, shot);
    if (!existsSync(onDisk)) {
      fail(
        where,
        `points its ${which} shot at ${shot}, which is missing from public/shots. ` +
          `Re-run: node pipeline/capture.mjs <url> ${slug}`,
      );
    }
    return shot;
  };

  const light = check("light", readString(value, "light", where));

  const rawDark = value["dark"];
  if (rawDark !== null && typeof rawDark !== "string") {
    fail(where, `needs "shots.dark" to be a string or null (got ${JSON.stringify(rawDark)})`);
  }
  const dark = rawDark === null ? null : check("dark", readString(value, "dark", where));

  return { light, dark };
}

export function parseSites(value: unknown): Site[] {
  if (!Array.isArray(value)) fail("root", "must be a JSON array of site entries");
  if (value.length === 0) fail("root", "must hold at least one site entry");

  const slugs = new Set<string>();

  const parsed = value.map((item: unknown, index): Site => {
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

    const url = readUrl(item, where);

    return {
      slug,
      title: readString(item, "title", where),
      // Returned as authored, not as `url.href`, which would rewrite bare
      // origins with a trailing slash and change what the page shows.
      url: readString(item, "url", where),
      domain: readDomain(item, url, where),
      saved_date: readDate(item, "saved_date", where),
      shots: readShots(item, slug, where),
    };
  });

  // Domains become routes too, so two spellings must not land on one page.
  const claimed = new Map<string, string>();
  for (const site of parsed) {
    const slug = domainSlug(site.domain);
    const where = `entry for "${site.slug}"`;
    if (slug === "") {
      fail(where, `has a domain with no URL-safe characters: ${JSON.stringify(site.domain)}`);
    }
    const owner = claimed.get(slug);
    if (owner !== undefined && owner !== site.domain) {
      fail(
        where,
        `has domain ${JSON.stringify(site.domain)}, which collides with ${JSON.stringify(owner)} at /sites/domain/${slug}`,
      );
    }
    claimed.set(slug, site.domain);
  }

  return parsed;
}

/* ---------------------------------------------------------------------------
   Derived views — computed once, at build time
   --------------------------------------------------------------------------- */

/** `designengineer.tools` -> `designengineer-tools`, via the fold in
 *  `lib/parse.ts` that /tools and /reading mint their own filter routes with. */
export function domainSlug(domain: string): string {
  return routeSlug(domain);
}

/** Newest save first; ties keep the order they were written in the JSON. */
export const sites: Site[] = parseSites(rawSites)
  .map((site, index) => ({ site, index }))
  .sort((a, b) =>
    a.site.saved_date === b.site.saved_date
      ? a.index - b.index
      : b.site.saved_date.localeCompare(a.site.saved_date),
  )
  .map(({ site }) => site);

export const domains: DomainGroup[] = (() => {
  const groups = new Map<string, DomainGroup>();

  for (const site of sites) {
    const group = groups.get(site.domain);
    if (group) {
      group.sites.push(site);
    } else {
      groups.set(site.domain, {
        domain: site.domain,
        slug: domainSlug(site.domain),
        sites: [site],
      });
    }
  }

  return [...groups.values()];
})();
