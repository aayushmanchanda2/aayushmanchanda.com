/**
 * The site's data as feed items: every /notes, /library, /tools and /sites
 * entry, carrying its real text rather than a "read more" link.
 *
 * Read by the five `rss.xml` endpoints and the home page's "Latest" list, so
 * they agree on what is newest. The list of feeds is `lib/sections.ts › FEEDS`. The XML itself is `lib/rss.ts`.
 */

import { getCollection } from "astro:content";

import { isoDay } from "./date";
import { library, rowSummary } from "./library";
import { VOICE_FIELDS, type Voice } from "./markdown";
import { clock, watchAt } from "./reader.mjs";
import { newestFirst, paragraphs, renderFeed, escapeXml, type FeedItem } from "./rss";
import { CATALOGUE, FEED_SECTIONS, feedTitle, type FeedSection } from "./sections";
import { SITE_URL } from "./site";
import { sites } from "./sites";
import { VERDICT_LABELS, tools } from "./tools";

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
    // The TLDR says what the piece is; a digest is his agents' call on it and follows.
    const text = entry.digest
      ? paragraphs(entry.tldr, entry.digest.verdict, entry.digest.why)
      : paragraphs(entry.why, rowSummary(entry));
    // Quoted passages only, never the piece (VET-246), and a video's moments at their time (VET-264).
    const quotes = [
      ...entry.highlights.map((highlight) => escapeXml(highlight.text)),
      ...entry.moments.map(
        (moment) => `<a href="${escapeXml(watchAt(moment.video, moment.t))}">${clock(moment.t)}</a> ${escapeXml(moment.text)}`,
      ),
    ]
      .map((quote) => `<blockquote><p>${quote}</p></blockquote>`)
      .join("");
    return {
      title: entry.title,
      path: `/library/${entry.slug}`,
      date: entry.digest?.digested ?? entry.saved_date,
      section: "Library",
      html: (text || paragraphs(`Saved from ${entry.domain}.`)) + quotes + source(entry.url),
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
      paragraphs(tool.description, `${VERDICT_LABELS[tool.verdict]}. ${tool.note}`, ...voice(tool)) +
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
      title: feedTitle(section),
      description: section
        ? CATALOGUE[section].blurb
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
