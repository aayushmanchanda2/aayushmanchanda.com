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
import { reading } from "./reading";
import { sites } from "./sites";
import { tools } from "./tools";

export type SectionHref =
  | "/tools"
  | "/sites"
  | "/reading"
  | "/notes"
  | "/experiments";

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

const CATALOGUE: readonly Omit<Section, "count" | "md">[] = [
  {
    href: "/tools",
    name: "Tools",
    blurb: "Things I actually installed and ran, with an honest verdict.",
    kind: "subtitle",
  },
  {
    href: "/sites",
    name: "Sites",
    blurb: "Design and craft I keep coming back to.",
    kind: "subtitle",
  },
  {
    href: "/reading",
    name: "Reading",
    blurb: "Articles, posts and talks I saved to read properly.",
    kind: "subtitle",
  },
  {
    href: "/notes",
    name: "Notes",
    blurb: "A commonplace book. Short thoughts, kept as they come.",
    kind: "section",
  },
  {
    href: "/experiments",
    name: "Experiments",
    blurb: "What's running right now, including what I killed.",
    kind: "section",
  },
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
    "/reading": reading.length,
    "/notes": notes.length,
    "/experiments": experiments.length,
  };

  return CATALOGUE.map((section) => ({
    ...section,
    count: counts[section.href],
    md: markdownVariantFor(section.href),
  })).filter((section) => section.count > 0);
}
