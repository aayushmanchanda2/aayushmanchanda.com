/**
 * What the palette shows before anything is typed (VET-267): five groups, in
 * this order, each row carrying its heading as `group`.
 *
 *   Go to          every section, with its glyph
 *   Browse         filtered views: /tools by verdict, /library by kind, the
 *                  three biggest /sites collections
 *   Recent saves   the newest five library entries and sites, by saved date
 *   Actions        theme, sound, copy this page's link (`lib/palette.ts` runs them)
 *   Try searching  four queries from the content itself; pressing one types it
 *
 * Built at build time from the index rows `lib/search-index.ts` already made,
 * so a recent save is the same row a search would find. `search()` shows
 * grouped rows only for an empty query and never ranks them.
 */

import { kindGroups, KIND_LABELS, libraryTags } from "./library";
import { nowDate } from "./now";
import type { Glyph, SearchEntry } from "./search";
import { search } from "./search";
import type { Section, SectionHref } from "./sections";
import { collectionGroups } from "./sites";
import { tagLabel } from "./tags";
import type { Verdict } from "./tools";
import { categories, verdictGroups } from "./tools";

const SECTION_GLYPHS: Record<SectionHref, Glyph> = {
  "/tools": "grid",
  "/sites": "window",
  "/library": "book",
  "/notes": "note",
  "/experiments": "flask",
};

const VERDICT_TITLES: Record<Verdict, string> = {
  using: "Tools I use",
  watching: "Tools I'm watching",
  "on-hold": "Tools on hold",
  skipped: "Tools I skipped",
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const bySize = <T>(list: readonly T[], size: (item: T) => number) => [...list].sort((a, b) => size(b) - size(a));

/** Four queries from real content (the busiest library tags, tool category and site collection), each finding something. */
function suggestions(index: readonly SearchEntry[]): string[] {
  const tags = bySize(libraryTags, (group) => group.entries.length).map((group) => tagLabel(group.slug));
  const category = bySize(categories, (group) => group.tools.length)[0]?.category;
  const collection = bySize(collectionGroups, (group) => group.sites.length)[0]?.label;
  const picks = [tags[0], category, collection, tags[1]];
  return [...new Set(picks)].filter((query): query is string => !!query && search(index, query, 1).length > 0);
}

export function paletteHome(sections: readonly Section[], index: readonly SearchEntry[]): SearchEntry[] {
  const row = (group: string, entry: Omit<SearchEntry, "group">): SearchEntry => ({ ...entry, group });

  const goTo = [
    ...sections.map((section) =>
      row("Go to", { title: section.name, section: "", href: section.href, sub: section.blurb, glyph: SECTION_GLYPHS[section.href] }),
    ),
    // After the sections, as in the nav (VET-57).
    row("Go to", { title: "Now", section: "", href: "/now", sub: `Updated ${nowDate()}`, glyph: "note" }),
  ];

  const browse = [
    ...verdictGroups.map((group) =>
      row("Browse", {
        title: VERDICT_TITLES[group.verdict],
        section: "Tools",
        href: `/tools?verdict=${group.verdict}`,
        sub: count(group.tools.length, "tool", "tools"),
        glyph: "grid",
      }),
    ),
    ...kindGroups.map((group) =>
      row("Browse", {
        title: KIND_LABELS[group.kind],
        section: "Library",
        href: `/library/kind/${group.kind}`,
        sub: count(group.entries.length, "entry", "entries"),
        glyph: group.kind,
      }),
    ),
    ...bySize(collectionGroups, (group) => group.sites.length)
      .slice(0, 3)
      .map((group) =>
        row("Browse", {
          title: group.label[0]!.toUpperCase() + group.label.slice(1),
          section: "Sites",
          href: `/sites/collection/${group.slug}`,
          sub: count(group.sites.length, "site", "sites"),
          glyph: "window",
        }),
      ),
  ];

  const recent = index
    .filter((entry) => (entry.section === "Library" || entry.section === "Sites") && entry.date)
    .sort((a, b) => b.date!.localeCompare(a.date!))
    .slice(0, 5)
    .map((entry) => row("Recent saves", entry));

  const actions = [
    row("Actions", { title: "Theme", section: "", href: "#theme", glyph: "theme", action: "theme" }),
    row("Actions", { title: "Sound", section: "", href: "#sound", glyph: "sound", action: "sound" }),
    row("Actions", { title: "Copy link", section: "", href: "#copy", glyph: "link", action: "copy" }),
  ];

  const tries = suggestions(index).map((query) =>
    row("Try searching", {
      title: query,
      section: "",
      href: "#search",
      sub: count(search(index, query, Infinity).length, "match", "matches"),
      glyph: "search",
      query,
    }),
  );

  return [...goTo, ...browse, ...recent, ...actions, ...tries];
}
