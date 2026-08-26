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
import { sites } from "./sites";
import { tools } from "./tools";

export type SectionHref = "/tools" | "/sites" | "/notes" | "/experiments";

export interface Section {
  href: SectionHref;
  name: string;
  /** One line for the home-page index. Not used in the nav. */
  blurb: string;
  /**
   * Dash weight in the rail nav. The two pipeline-fed sections carry more
   * visual weight than the two hand-written ones.
   */
  kind: "subtitle" | "section";
  /** Entries the section has right now. Never zero in a returned Section. */
  count: number;
}

const CATALOGUE: readonly Omit<Section, "count">[] = [
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
    "/notes": notes.length,
    "/experiments": experiments.length,
  };

  return CATALOGUE.map((section) => ({
    ...section,
    count: counts[section.href],
  })).filter((section) => section.count > 0);
}
