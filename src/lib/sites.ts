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

export interface Site {
  /** URL-safe id; also the details page path (`/sites/<slug>`). */
  slug: string;
  title: string;
  url: string;
  /** Hostname without `www.`; also the filter page (`/sites/domain/<slug>`). */
  domain: string;
  /** ISO calendar date (YYYY-MM-DD) the site was saved. */
  saved_date: string;
  /**
   * Web path under /shots — one full-page capture in the site's own default
   * colour scheme. Always present: an entry needs a picture.
   */
  shot: string;
  /**
   * The colours that capture is mostly made of, dominant first. Read off the
   * pixels by `pipeline/palette.mjs`, never authored by hand.
   */
  palette: string[];
  /**
   * Curated groupings this site belongs to, each also a filter route
   * (`/sites/collection/<slug>`). Many-to-many and unordered: a site can be in
   * none, one, or several, and a collection is simply every site naming it.
   *
   * Written by the pipeline from the bookmark's Raindrop tags, and meant to be
   * edited by hand afterwards — unlike `palette`, this is a judgement about the
   * site rather than a measurement of it. Empty is the normal case.
   */
  collections: string[];

  /* --- the voice fields ----------------------------------------------------
     The same optional sentences /tools carries, for the same reason: a
     screenshot shows what a site looks like and says nothing about what he
     thought of it. Null on most entries, and null renders nothing.

     /sites gets two of the four. `why` and `try` are questions about a tool you
     might install; a gallery entry is a page you either like the look of or do
     not, and there is no command to run against it. */

  /** What is good about how it looks or how it is built. */
  like: string | null;
  /** What is not. */
  dislike: string | null;
}

/**
 * A collection, and everything in it.
 *
 * `type` rather than `interface` for the same reason as `DomainGroup`: it is
 * handed to `getStaticPaths` as route props.
 */
export type CollectionGroup = {
  /** The route segment, and what the JSON entries actually store. */
  slug: string;
  /** The slug as prose — `reference-libraries` reads "reference libraries". */
  label: string;
  sites: Site[];
};

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

/** Lowercase six-digit hex. The capture writes nothing else, so nothing else parses. */
const HEX_COLOUR = /^#[0-9a-f]{6}$/;

/** Six swatches is a row. More than that is not a palette, it is a histogram. */
const MAX_PALETTE = 6;

const READ = readers("sites.json");
/** Annotated, or TypeScript stops treating a call as the end of control flow. */
const fail: Fail = READ.fail;
const { readString, readDate, readOptional, isRecord } = READ;

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
 * The pre-VET-23 shape, caught early and named.
 *
 * `shots: { light, dark }` became `shot` plus `palette`, and every field of the
 * old shape is absent from the new one — so an un-migrated entry would otherwise
 * fail on `"shot" is missing`, which is true and tells you nothing. This says
 * which schema the file is written in and what turns it into the other one.
 */
function rejectLegacyShots(entry: Record<string, unknown>, where: string): void {
  if (!("shots" in entry)) return;
  fail(
    where,
    `uses the retired "shots" object (light/dark pair). Entries now carry a single ` +
      `full-page "shot" plus a "palette" array. Re-capture to migrate: ` +
      `node pipeline/capture.mjs <url> <slug>, then replace "shots" with ` +
      `"shot": "/shots/<slug>.webp" and the printed "palette".`,
  );
}

/**
 * The shot path is a web path (`/shots/name.webp`) and must exist under
 * `public/` right now. This is the build guard: no entry ships without its
 * imagery on disk.
 */
function readShot(
  entry: Record<string, unknown>,
  slug: string,
  where: string,
): string {
  const shot = readString(entry, "shot", where);

  if (!SHOT_PATH.test(shot)) {
    fail(where, `has a "shot" that is not a /shots/*.webp path: ${JSON.stringify(shot)}`);
  }

  const onDisk = path.join(PUBLIC_DIR, shot);
  if (!existsSync(onDisk)) {
    fail(
      where,
      `points its shot at ${shot}, which is missing from public/shots. ` +
        `Re-run: node pipeline/capture.mjs <url> ${slug}`,
    );
  }

  return shot;
}

/**
 * The palette is machine-written, so this is checking the pipeline rather than a
 * human: a malformed colour here means `extractPalette` changed shape and every
 * swatch downstream would render as nothing at all.
 */
function readPalette(entry: Record<string, unknown>, where: string): string[] {
  const value = entry["palette"];
  if (!Array.isArray(value)) {
    fail(where, `needs "palette" to be an array of hex colours`);
  }
  if (value.length === 0) {
    fail(where, `has an empty "palette"; a capture always yields at least one colour`);
  }
  if (value.length > MAX_PALETTE) {
    fail(where, `has ${value.length} palette colours; the cap is ${MAX_PALETTE}`);
  }

  return value.map((colour: unknown, index): string => {
    if (typeof colour !== "string" || !HEX_COLOUR.test(colour)) {
      fail(
        where,
        `has a "palette" entry at ${index} that is not a lowercase #rrggbb colour: ` +
          JSON.stringify(colour),
      );
    }
    return colour;
  });
}

/**
 * Optional, and absent means none — a site with no collections is the ordinary
 * case, not an incomplete entry, so there is nothing to fall back to.
 *
 * Every member has to be a slug already, because the value IS the route segment
 * and the join key at once: `/sites/collection/<x>` is built from it verbatim,
 * and two entries land in the same collection only if their strings match
 * exactly. Folding "Reference Libraries" down to `reference-libraries` here
 * instead of rejecting it would make the file's contents and the site's routes
 * two different things, and a typo would quietly mint a collection of one.
 *
 * Deliberately uncapped. The pipeline writes this from however many tags a
 * bookmark carries, and `pipeline/entries.mjs` promises that everything it
 * writes is something this parser accepts — a ceiling here that the pipeline
 * did not also enforce would turn an enthusiastic tagging session into a failed
 * build.
 */
function readCollections(entry: Record<string, unknown>, where: string): string[] {
  const value = entry["collections"];
  if (value === undefined) return [];

  if (!Array.isArray(value)) {
    fail(where, `needs "collections" to be an array of slugs, or to leave it out entirely`);
  }

  const seen = new Set<string>();

  return value.map((name: unknown, index): string => {
    if (typeof name !== "string" || !SLUG.test(name)) {
      fail(
        where,
        `has a "collections" entry at ${index} that is not a URL-safe slug ` +
          `(lowercase, digits, single hyphens): ${JSON.stringify(name)}`,
      );
    }
    if (seen.has(name)) {
      fail(where, `lists the collection "${name}" twice`);
    }
    seen.add(name);
    return name;
  });
}

export function parseSites(value: unknown): Site[] {
  if (!Array.isArray(value)) fail("root", "must be a JSON array of site entries");
  if (value.length === 0) fail("root", "must hold at least one site entry");

  const slugs = new Set<string>();

  const parsed = value.map((item: unknown, index): Site => {
    const where = `entry ${index}`;
    if (!isRecord(item)) fail(where, "must be an object");

    // Before anything else, so a stale file is told it is stale rather than
    // told that one of its fields is missing.
    rejectLegacyShots(item, where);

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
      shot: readShot(item, slug, where),
      palette: readPalette(item, where),
      collections: readCollections(item, where),
      like: readOptional(item, "like", where),
      dislike: readOptional(item, "dislike", where),
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
 *  `lib/parse.ts` that /tools and /library mint their own filter routes with. */
export function domainSlug(domain: string): string {
  return routeSlug(domain);
}

/**
 * `reference-libraries` -> `reference libraries`.
 *
 * The hyphens are there to make the slug a route, and a reader has no use for
 * them. Nothing round-trips this back into a slug — the slug is what the JSON
 * stores and what every href is built from — so a collection whose name really
 * did contain a hyphen loses it in the label only, which is a cosmetic price
 * worth paying to stop every chip reading like a filename.
 */
export function collectionLabel(slug: string): string {
  return slug.replace(/-/g, " ");
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

/**
 * Every collection named by at least one site, alphabetically.
 *
 * Alphabetical rather than by size: this list is rendered as a row of links on
 * /sites, and a row that reorders itself every time an entry is tagged asks the
 * reader to re-find the one they wanted. Alphabetical is the order that holds
 * still.
 *
 * A collection exists because something is in it, so there is no registry to
 * keep and no way to end up with an empty one. Sites inside a group keep the
 * gallery's own newest-first order.
 */
export const collectionGroups: CollectionGroup[] = (() => {
  const groups = new Map<string, CollectionGroup>();

  for (const site of sites) {
    for (const slug of site.collections) {
      const group = groups.get(slug);
      if (group) {
        group.sites.push(site);
      } else {
        groups.set(slug, { slug, label: collectionLabel(slug), sites: [site] });
      }
    }
  }

  return [...groups.values()].sort((a, b) => a.slug.localeCompare(b.slug));
})();

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
