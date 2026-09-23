/**
 * screens.ts — several saved pages of one site, shown as one /sites card.
 *
 * Pure, so `screens.test.mjs` runs it without the JSON import `lib/sites.ts`
 * carries. `lib/sites.ts › siteGroups` is the gallery's grouping.
 */
import type { Site } from "./sites.ts";

/** One saved page inside a group, named by its path. */
export type Screen = { site: Site; label: string };

/**
 * A gallery card. `screens` holds every saved page of the domain, primary
 * first; a card with one screen is an ordinary site.
 */
export type SiteGroup = { primary: Site; screens: Screen[] };

/**
 * `https://brianlovin.com/` -> "Home", `/about` -> "About", `/notes/4` ->
 * "Notes 4". The path is the only thing that tells two screens of one site
 * apart: the titles are the site's name on every one of them.
 */
export function screenLabel(url: string): string {
  const words = new URL(url).pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment).replace(/[-_]+/g, " "));
  if (words.length === 0) return "Home";
  const label = words.join(" ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const isHome = (site: Site) => new URL(site.url).pathname.replace(/\/+$/, "") === "";

/**
 * `list` folded by domain, in the order each domain first appears. The primary
 * is the home page, else the earliest save; the other screens follow in
 * `list` order. Data is untouched: every screen keeps its own `/sites/<slug>`.
 *
 * ponytail: the key is the hostname, so two unrelated pages on one host
 * (github.com repos, a gallery listing) would fold together. None do today;
 * key on host plus first path segment for those hosts if they start to.
 */
export function groupByDomain(list: Site[]): SiteGroup[] {
  const byDomain = new Map<string, Site[]>();
  for (const site of list) byDomain.set(site.domain, [...(byDomain.get(site.domain) ?? []), site]);

  return [...byDomain.values()].map((members) => {
    const primary =
      members.find(isHome) ??
      members.reduce((a, b) => (b.saved_date < a.saved_date ? b : a));
    const ordered = [primary, ...members.filter((site) => site !== primary)];
    return { primary, screens: ordered.map((site) => ({ site, label: screenLabel(site.url) })) };
  });
}

