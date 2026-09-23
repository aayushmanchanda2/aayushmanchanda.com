/**
 * The site's data as feed items: every /notes, /library, /tools and /sites
 * entry, carrying its real text rather than a "read more" link.
 *
 * Read by the five `rss.xml` endpoints, the feed `<link>`s in `Base.astro`,
 * /llms.txt, and the home page's "Latest" list, so all of them agree on what
 * is newest. The XML itself is `lib/rss.ts`.
 */

import { getCollection } from "astro:content";

import { isoDay } from "./date";
import { library, rowSummary } from "./library";
import { VOICE_FIELDS, type Voice } from "./markdown";
import { newestFirst, paragraphs, renderFeed, escapeXml, type FeedItem } from "./rss";
import { CATALOGUE, type SectionHref } from "./sections";
import { SITE_URL } from "./site";
import { sites } from "./sites";
import { VERDICT_LABELS, tools } from "./tools";

/** The sections with a feed. /experiments has no per-entry pages to link. */
export const FEED_SECTIONS = ["/notes", "/library", "/tools", "/sites"] as const;

export type FeedSection = (typeof FEED_SECTIONS)[number];

const SITE_NAME = "Aayush Manchanda";

/** The combined feed, and every section's own. */
export const FEEDS: readonly { title: string; path: string; href: string }[] = [
  { title: SITE_NAME, path: "/", href: "/rss.xml" },
  ...FEED_SECTIONS.map((section) => ({
    title: feedTitle(section),
    path: section,
    href: `${section}/rss.xml`,
  })),
];

function catalogue(section: SectionHref) {
  const entry = CATALOGUE.find((item) => item.href === section);
  if (!entry) throw new Error(`${section} is not in the section manifest`);
  return entry;
}

function feedTitle(section: FeedSection): string {
  return `${SITE_NAME} · ${catalogue(section).name}`;
}

/** The "What I like: ..." lines an entry has, in the order its page shows them. */
function voice(entry: Voice): string[] {
  return VOICE_FIELDS.flatMap(({ key, label }) => {
    const value = entry[key];
    return value ? [`${label}: ${value}`] : [];
  });
}

/** The way out to the thing itself, labelled with its host. */
function source(url: string | null): string {
  if (!url) return "";
  const host = new URL(url).hostname.replace(/^www\./, "");
  return `<p>Source: <a href="${escapeXml(url)}">${escapeXml(host)}</a></p>`;
}

async function notes(): Promise<FeedItem[]> {
  return (await getCollection("notes")).map((note) => ({
    title: note.data.title,
    path: `/notes/${note.id}`,
    date: isoDay(note.data.date),
    section: "Notes",
    html:
      (note.data.image ? `<p><img src="${escapeXml(note.data.image)}" alt="" /></p>` : "") +
      (note.rendered?.html ?? ""),
  }));
}

function libraryItems(): FeedItem[] {
  return library.map((entry) => {
    // A digest is his call on the piece, so it leads when there is one.
    const text = entry.digest
      ? paragraphs(entry.digest.verdict, entry.digest.why)
      : paragraphs(entry.why, rowSummary(entry) ?? entry.post?.text);
    return {
      title: entry.title,
      path: `/library/${entry.slug}`,
      date: entry.digest?.digested ?? entry.saved_date,
      section: "Library",
      html: (text || paragraphs(`Saved from ${entry.domain}.`)) + source(entry.url),
    };
  });
}

function toolItems(): FeedItem[] {
  return tools.map((tool) => ({
    title: tool.name,
    path: `/tools/${tool.slug}`,
    date: tool.status_date,
    section: "Tools",
    html:
      paragraphs(`${VERDICT_LABELS[tool.verdict]}. ${tool.note}`, ...voice(tool)) +
      source(tool.url ?? tool.repo),
  }));
}

function siteItems(): FeedItem[] {
  return sites.map((site) => ({
    title: site.title,
    path: `/sites/${site.slug}`,
    date: site.saved_date,
    section: "Sites",
    html:
      (paragraphs(...voice(site)) ||
        paragraphs(`A full-page screenshot of ${site.domain}, saved for its design.`)) +
      source(site.url),
  }));
}

/** One section's entries, or every section's when `section` is omitted. */
export async function feedItems(section?: FeedSection): Promise<FeedItem[]> {
  const all: Record<FeedSection, () => FeedItem[] | Promise<FeedItem[]>> = {
    "/notes": notes,
    "/library": libraryItems,
    "/tools": toolItems,
    "/sites": siteItems,
  };
  const sections = section ? [section] : FEED_SECTIONS;
  return (await Promise.all(sections.map((key) => all[key]()))).flat();
}

/** The whole `rss.xml` response for one section, or the combined feed. */
export async function feedResponse(section?: FeedSection): Promise<Response> {
  const xml = renderFeed(
    {
      title: section ? feedTitle(section) : SITE_NAME,
      description: section
        ? catalogue(section).blurb
        : "Everything new on the site: tools I ran, sites I keep going back to, things I saved to read, and notes.",
      path: section ?? "/",
      self: section ? `${section}/rss.xml` : "/rss.xml",
      items: newestFirst(await feedItems(section)),
    },
    SITE_URL,
  );
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
