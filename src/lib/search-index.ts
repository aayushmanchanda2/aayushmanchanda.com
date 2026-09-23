/**
 * Every destination on the site, in one list, built once per build.
 *
 * The palette is the first surface that has to know about *all* the sections
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
 * It ships as one static file, `/search.json` (`pages/search.json.ts`), which
 * the palette fetches the first time it opens (VET-247). It carries the full
 * text of every post, so it no longer rides inline on every page.
 */

import { getCollection } from "astro:content";

import { isoDay } from "./date";
import { experiments } from "./experiments";
import { markFor, repoOwner } from "./links";
import type { Post } from "./library";
import { entryHref, library } from "./library";
import { monogram } from "./post";
import type { RowIcon, SearchEntry } from "./search";
import { getSections } from "./sections";
import { collectionLabel, sites } from "./sites";
import { hueSlot } from "./tags";
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
  computer: "Computer",
  settings: "Settings",
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
    terms:
      "cookies tracking analytics vercel page views data icons takedown",
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
 * Prose for the index: the parts that exist, one space between words, or
 * `undefined` so `JSON.stringify` drops the key. Collapsing here is what lets
 * the excerpt index into the lowercased text without drifting.
 */
function squash(...parts: (string | null | undefined)[]): string | undefined {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || undefined;
}

/** A tool's or a site's AppIcon layers (`lib/links.ts › markFor`), as data. */
function appIcon(entry: { slug: string; name: string; url?: string | null; logoDomain?: string | null }): RowIcon {
  const mark = markFor(entry);
  return {
    shape: "app",
    src: mark.logo ?? mark.icon ?? undefined,
    fallback: mark.logo ? (mark.icon ?? undefined) : undefined,
    letter: mark.letter.toUpperCase(),
    hue: hueSlot(entry.slug),
  };
}

/** The poster's self-hosted avatar, over the same monogram `PostCard` draws. */
function postIcon(post: Post): RowIcon {
  return {
    shape: "round",
    src: post.avatar ?? undefined,
    letter: monogram(post.author),
    hue: hueSlot(post.handle),
  };
}

/** Markdown down to the words a reader sees: link text kept, syntax gone. */
function plain(markdown: string): string {
  return markdown.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[#*_>`|~-]+/g, " ");
}

/**
 * Build the index. Async for one reason: /notes comes from the content layer.
 *
 * Entry hrefs point at the site, never off it: ejecting a reader to a
 * third-party article from a nav control is not something a palette should
 * do, and every library entry has a page. `/experiments#slug` is the one
 * anchor left, because that section has no per-entry page.
 */
async function build(): Promise<SearchEntry[]> {
  const notes = await getCollection("notes");
  const tips = await getCollection("computer");

  return [
    ...STATIC_PAGES.map((page) => ({ ...page, glyph: "article" as const })),

    /**
     * The section indexes, from the manifest that already decides which
     * sections exist. Not hand-listed: an empty section is absent from the nav
     * and from the home page index, and it has to be absent from here too or
     * the palette offers a route to a page with nothing on it.
     */
    ...(await sectionPages()),

    // After the ten pages, so an empty palette still shows it (the cap is 12).
    {
      title: "Sound",
      section: SECTION.settings,
      href: "#sound",
      terms: "audio click tick mute unmute",
      glyph: "sound",
      action: "sound",
    },

    ...tools.map(
      (tool): SearchEntry => ({
        title: tool.name,
        section: SECTION.tools,
        href: `/tools/${tool.slug}`,
        terms: toolTerms(tool),
        lead: squash(tool.description, tool.note),
        body: squash(tool.like, tool.dislike, tool.why, tool.try),
        sub: tool.url ? hostOf(tool.url) : tool.repo ? repoOwner(tool.repo) : undefined,
        date: tool.status_date,
        icon: appIcon(tool),
      }),
    ),

    ...sites.map(
      (site): SearchEntry => ({
        title: site.title,
        section: SECTION.sites,
        href: `/sites/${site.slug}`,
        // Collections are stored as slugs; the reader saw the label.
        terms: [site.domain, ...site.collections.map(collectionLabel)].join(" "),
        lead: squash(site.like, site.dislike),
        sub: site.domain,
        date: site.saved_date,
        icon: appIcon({ ...site, name: site.title }),
      }),
    ),

    ...library.map(
      (entry): SearchEntry => ({
        title: entry.title,
        section: SECTION.library,
        href: entryHref(entry),
        terms: `${entry.domain} ${entry.kind}`,
        lead: squash(entry.tldr, ...entry.highlights.map((h) => h.text), entry.note, entry.why),
        body: squash(entry.post?.text, entry.post?.quoted?.text, entry.excerpt, ...(entry.digest?.bullets ?? [])),
        sub: entry.post ? `${entry.post.author} @${entry.post.handle}` : entry.domain,
        date: entry.saved_date,
        ...(entry.post ? { icon: postIcon(entry.post) } : { glyph: entry.kind }),
      }),
    ),

    ...notes.map(
      (note): SearchEntry => ({
        title: note.data.title,
        section: SECTION.notes,
        href: `/notes/${note.id}`,
        terms: note.data.type,
        body: squash(plain(note.body ?? "")),
        date: isoDay(note.data.date),
        glyph: "note",
      }),
    ),

    ...tips.map(
      (tip): SearchEntry => ({
        title: tip.data.title,
        section: SECTION.computer,
        href: `/computer/${tip.id}`,
        lead: tip.data.summary,
        body: squash(plain(tip.body ?? "")),
        glyph: "note",
      }),
    ),

    ...experiments.map(
      (experiment): SearchEntry => ({
        title: experiment.name,
        section: SECTION.experiments,
        href: `/experiments#${experiment.slug}`,
        terms: experiment.status,
        lead: squash(experiment.one_liner),
        sub: experiment.status,
        date: experiment.started,
        glyph: "article",
      }),
    ),
  ];
}

/** The section indexes as palette rows. */
async function sectionPages(): Promise<SearchEntry[]> {
  return (await getSections()).map((section) => ({
    title: section.name,
    section: SECTION.pages,
    href: section.href,
    terms: section.blurb,
    glyph: "article",
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
