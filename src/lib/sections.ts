/**
 * The section manifest — what the site currently has enough content to show.
 *
 * The plan's empty-state rule: "sections render only if they have entries — no
 * coming soon pages". Two surfaces have to agree about that, the rail nav in
 * `layouts/Base.astro` and the index on the home page, and before this file
 * they each kept their own hand-written list. Adding a section meant editing
 * both, and emptying one meant remembering to edit both again.
 *
 * So the list lives here once, with the count attached, and an empty section
 * drops out of everything downstream by construction rather than by discipline.
 *
 * Counts come from the same boundaries the pages read, so the nav cannot
 * disagree with the page it points at.
 */

import { getCollection } from "astro:content";

import { experiments } from "./experiments";
import { markdownVariantFor } from "./markdown";
import { library } from "./library";
import { sites } from "./sites";
import { tools } from "./tools";

/** The five sections, in the order every list of them shows them. */
export const SECTION_HREFS = [
  "/tools",
  "/sites",
  "/library",
  "/notes",
  "/experiments",
] as const;

export type SectionHref = (typeof SECTION_HREFS)[number];

/**
 * Dash weight in the rail nav, and how loudly an item reads in the mobile
 * panel. `title` is the home entry; the three pipeline-fed sections carry more
 * visual weight than the two hand-written ones.
 */
export type NavKind = "title" | "subtitle" | "section" | "body";

/**
 * One entry in either nav surface.
 *
 * Lives here rather than in one of the two components that render it: the rail
 * and the mobile panel are peers, and a shared vocabulary that one peer owns is
 * a vocabulary the other has to import a component to speak.
 */
export interface NavItem {
  href: string;
  label: string;
  kind?: NavKind;
}

export interface Section {
  href: SectionHref;
  name: string;
  /** One line for the home-page index. Not used in the nav. */
  blurb: string;
  kind: Extract<NavKind, "subtitle" | "section">;
  /** Entries the section has right now. Never zero in a returned Section. */
  count: number;
  /**
   * This section's markdown variant, or null when it has none.
   *
   * Looked up from `lib/markdown.ts`, never derived from `href`: a section
   * without a variant has to be able to say so, and `${href}.md` cannot.
   */
  md: string | null;
}

/** Keyed by href, so a lookup of a section's name cannot miss. */
export const CATALOGUE: Record<SectionHref, Omit<Section, "href" | "count" | "md">> = {
  "/tools": {
    name: "Tools",
    blurb: "Things I actually installed and ran, with an honest verdict.",
    kind: "subtitle",
  },
  "/sites": {
    name: "Sites",
    blurb: "Design and craft I keep coming back to.",
    kind: "subtitle",
  },
  "/library": {
    name: "Library",
    blurb: "Articles, posts and videos I saved to get to properly.",
    kind: "subtitle",
  },
  "/notes": {
    name: "Notes",
    blurb: "A commonplace book. Short thoughts, kept as they come.",
    kind: "section",
  },
  "/experiments": {
    name: "Experiments",
    blurb: "What's running right now, including what I killed.",
    kind: "section",
  },
};

/** The sections with a feed. /experiments has no per-entry pages to link. */
export const FEED_SECTIONS = ["/notes", "/library", "/tools", "/sites"] as const satisfies readonly SectionHref[];

export type FeedSection = (typeof FEED_SECTIONS)[number];

/** "Aayush Manchanda · Notes", or the bare name for the combined feed. */
export function feedTitle(section?: FeedSection): string {
  const site = "Aayush Manchanda";
  return section ? `${site} · ${CATALOGUE[section].name}` : site;
}

/** The combined feed, and every section's own: `<link rel=alternate>` and /llms.txt. */
export const FEEDS: readonly { title: string; path: string; href: string }[] = [
  { title: feedTitle(), path: "/", href: "/rss.xml" },
  ...FEED_SECTIONS.map((section) => ({
    title: feedTitle(section),
    path: section,
    href: `${section}/rss.xml`,
  })),
];

/**
 * Async because the notes count comes from the content layer. Astro caches the
 * collection, so calling this from every page costs one read for the build.
 */
export async function getSections(): Promise<Section[]> {
  const notes = await getCollection("notes");

  const counts: Record<SectionHref, number> = {
    "/tools": tools.length,
    "/sites": sites.length,
    "/library": library.length,
    "/notes": notes.length,
    "/experiments": experiments.length,
  };

  return SECTION_HREFS.map((href) => ({
    href,
    ...CATALOGUE[href],
    count: counts[href],
    md: markdownVariantFor(href),
  })).filter((section) => section.count > 0);
}
