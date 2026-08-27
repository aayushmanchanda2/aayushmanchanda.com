/**
 * Every destination on the site, in one list, built once per build.
 *
 * The palette is the first surface that has to know about *all* five sections
 * at the same time. Every other surface is scoped — /tools reads tools, the nav
 * reads the section manifest — so this is the only place the whole site is
 * enumerated, and it is deliberately the only place: a section that ships
 * without a line in `buildSearchIndex` is a section the palette cannot find,
 * and that failure is visible the first time anyone opens it.
 *
 * Kept apart from `lib/search.ts` because of what it imports. The modules below
 * read JSON and the content layer at load time and only resolve inside the
 * bundler, so this file cannot run under `node --test`; the ranking it feeds
 * has no imports at all and therefore can. See the header there.
 *
 * Cost: this runs once, at module load, and `layouts/Base.astro` awaits the
 * same promise on every page rather than rebuilding per route.
 */

import { getCollection } from "astro:content";

import { experiments } from "./experiments";
import { repoOwner } from "./links";
import { library } from "./library";
import type { SearchEntry } from "./search";
import { collectionLabel, sites } from "./sites";
import type { Tool } from "./tools";
import { tools } from "./tools";

/**
 * Group headings, and the order an empty palette lists them in.
 *
 * Pages first, because the empty state is the answer to "what is on this site"
 * and the section indexes are that answer. Once a reader types anything,
 * relevance takes over and this order stops applying — see `search()`.
 */
const SECTION = {
  pages: "Pages",
  tools: "Tools",
  sites: "Sites",
  library: "Library",
  notes: "Notes",
  experiments: "Experiments",
} as const;

/**
 * The pages that are not a section index and not an entry: home, plus the four
 * colophon pages the footer links.
 *
 * The `terms` on each row are the words someone would actually type looking for
 * it, which are rarely the words in the title: nobody searches "home", they
 * search "about" or their host's name, and nobody searches "privacy" without
 * possibly meaning "cookies" or "tracking".
 */
const STATIC_PAGES: readonly SearchEntry[] = [
  {
    title: "Home",
    section: SECTION.pages,
    href: "/",
    terms: "aayush manchanda index start",
  },
  {
    /*
     * "about" used to be a term on the Home row, back when there was no /about
     * to type it into. It moved here rather than being left in both places: two
     * rows answering the same word is a coin toss over which one the reader
     * gets, and the one they meant is this one.
     */
    title: "About",
    section: SECTION.pages,
    href: "/about",
    terms: "about aayush manchanda who bio orbis vetted",
  },
  {
    title: "Contact",
    section: SECTION.pages,
    href: "/contact",
    terms: "contact email reach hire get in touch x twitter github",
  },
  {
    /*
     * Nobody types "design" looking for a colophon, so the terms are the things
     * that are actually on the page: the wordmark, the tag colours, the type.
     * "colophon" is in there for the one reader who does know the word.
     */
    title: "Design",
    section: SECTION.pages,
    href: "/design",
    terms:
      "design colophon logo wordmark mark favicon colour color tokens palette typography type fonts chips tags accent theme",
  },
  {
    title: "Privacy",
    section: SECTION.pages,
    href: "/privacy",
    terms: "cookies tracking analytics data logo.dev takedown",
  },
];

/**
 * A tool's searchable extras: what it is for, what I decided, and where it
 * lives. The host comes off the URL rather than being typed again, so a tool
 * whose homepage moves cannot keep answering to the old domain.
 *
 * The repository contributes its **owner** and not its host. Every repository
 * on the site is on github.com, so indexing the host would score twenty rows
 * identically for one word that separates none of them, while the owner is the
 * word somebody would actually type: "vercel" should find Eve and "block"
 * should find Buzz, and neither name is anywhere else in the row.
 */
function toolTerms(tool: Tool): string {
  const host = tool.url === null ? "" : hostOf(tool.url);
  const owner = tool.repo === null ? "" : repoOwner(tool.repo);
  return [tool.category, tool.verdict, host, owner].filter(Boolean).join(" ");
}

/** `rareui.com` — the host, without the `www.` that nobody types. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Build the index.
 *
 * Async for one reason: /notes comes from the content layer. Everything else is
 * a module-level constant that was parsed when its file was imported.
 *
 * Entry hrefs point at the site, never off it, including for the two sections
 * that have no per-entry page. A library row and an experiment row each carry
 * an `id`, so `/library#slug` lands on the row in context — with its note, its
 * date and its neighbours — instead of ejecting the reader to a third-party
 * article they did not ask to open from a nav control. The one place the
 * palette will leave the site is a row that says so.
 */
async function build(): Promise<SearchEntry[]> {
  const notes = await getCollection("notes");

  return [
    ...STATIC_PAGES,

    /**
     * The section indexes, from the manifest that already decides which
     * sections exist. Not hand-listed: an empty section is absent from the nav
     * and from the home page index, and it has to be absent from here too or
     * the palette offers a route to a page with nothing on it.
     */
    ...(await sectionPages()),

    ...tools.map(
      (tool): SearchEntry => ({
        title: tool.name,
        section: SECTION.tools,
        href: `/tools/${tool.slug}`,
        terms: toolTerms(tool),
      }),
    ),

    ...sites.map(
      (site): SearchEntry => ({
        title: site.title,
        section: SECTION.sites,
        href: `/sites/${site.slug}`,
        // Collections are stored as slugs; the reader saw the label.
        terms: [site.domain, ...site.collections.map(collectionLabel)].join(" "),
      }),
    ),

    ...library.map(
      (entry): SearchEntry => ({
        title: entry.title,
        section: SECTION.library,
        href: `/library#${entry.slug}`,
        terms: `${entry.domain} ${entry.kind}`,
      }),
    ),

    ...notes.map(
      (note): SearchEntry => ({
        title: note.data.title,
        section: SECTION.notes,
        href: `/notes/${note.id}`,
        terms: note.data.type,
      }),
    ),

    ...experiments.map(
      (experiment): SearchEntry => ({
        title: experiment.name,
        section: SECTION.experiments,
        href: `/experiments#${experiment.slug}`,
        terms: experiment.status,
      }),
    ),
  ];
}

/**
 * The five section indexes as palette rows.
 *
 * Imported lazily inside the function rather than at the top of the file to
 * keep the import graph honest: `lib/sections.ts` imports every data module
 * this file already imports, and a cycle between the two would be the kind of
 * bug that shows up as an empty array at build time with no error.
 */
async function sectionPages(): Promise<SearchEntry[]> {
  const { getSections } = await import("./sections");
  return (await getSections()).map((section) => ({
    title: section.name,
    section: SECTION.pages,
    href: section.href,
    terms: section.blurb,
  }));
}

/**
 * One index for the whole build.
 *
 * `Base.astro` wraps every page on the site, so without this the index would be
 * rebuilt — and /notes re-read — once per route. Caching the promise rather than
 * the value means concurrent routes share the single in-flight build.
 */
let cached: Promise<SearchEntry[]> | null = null;

export function buildSearchIndex(): Promise<SearchEntry[]> {
  cached ??= build();
  return cached;
}
