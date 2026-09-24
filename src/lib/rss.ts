/**
 * RSS 2.0, written by hand.
 *
 * A feed is one small XML document, so there is no library here: the only
 * parts that can go wrong are escaping and dates, and both are tested in
 * `lib/rss.test.mjs`. Pure on purpose, importing only `lib/date.ts`, so the
 * test runs it without Astro. `lib/feeds.ts` turns the site's data into
 * `FeedItem`s.
 */

// With the extension: `rss.test.mjs` loads this module under plain `node --test`.
import { rfc822 } from "./date.ts";

/** One entry in a feed, or in the home page's "Latest" list. */
export interface FeedItem {
  title: string;
  /** Site-relative path to the entry's page. Also its guid, once absolute. */
  path: string;
  /** ISO calendar day (YYYY-MM-DD): the date the entry was written or last true. */
  date: string;
  /** Section name, "Notes". The item's `<category>`. */
  section: string;
  /** The entry's real text as an HTML fragment. Escaped once more on the way out. */
  html: string;
}

export interface Channel {
  title: string;
  description: string;
  /** Site-relative path of the page the feed follows, "/notes". */
  path: string;
  /** Site-relative path of the feed itself, "/notes/rss.xml". */
  self: string;
  /** Already newest first and capped: `newestFirst` does both. */
  items: readonly FeedItem[];
}

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

/**
 * Text made safe for XML, and for HTML, which needs the same five.
 * Control characters XML 1.0 cannot carry at all are dropped, not escaped.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}

/** Newest first, capped. Same-day entries keep the order they came in. */
export function newestFirst(items: readonly FeedItem[], cap = 50): FeedItem[] {
  return [...items].sort((a, b) => b.date.localeCompare(a.date)).slice(0, cap);
}

/** Plain sentences as `<p>` elements, nulls skipped. */
export function paragraphs(...texts: readonly (string | null | undefined)[]): string {
  return texts
    .filter((text): text is string => Boolean(text))
    .map((text) => `<p>${escapeXml(text)}</p>`)
    .join("");
}

/**
 * Root-relative `href` and `src` values made absolute. A reader shows the
 * item away from the site, where `/tools` means nothing. `//host` is left alone.
 */
export function absolutizeHtml(html: string, origin: string): string {
  return html.replace(/\b(href|src)="\/(?!\/)/g, `$1="${origin}/`);
}

export function renderFeed(channel: Channel, origin: string): string {
  const url = (path: string) => escapeXml(new URL(path, origin).href);
  // The link is the page's canonical URL, no trailing slash (VET-281). The
  // guid keeps the slashed spelling it shipped with: it still resolves (a
  // 308), and changing it would show every reader every item again as new.
  const page = (path: string) => url(path.length > 1 ? path.replace(/\/$/, "") : path);
  const guid = (path: string) => url(path.replace(/\/?$/, "/"));
  const items = channel.items.map(
    (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${page(item.path)}</link>
      <guid isPermaLink="true">${guid(item.path)}</guid>
      <pubDate>${rfc822(item.date)}</pubDate>
      <category>${escapeXml(item.section)}</category>
      <description>${escapeXml(absolutizeHtml(item.html, origin))}</description>
    </item>`,
  );
  // The newest item's day, not the clock, so a rebuild with nothing new
  // produces the same bytes and no reader sees a phantom update.
  const built = channel.items[0] ? `\n    <lastBuildDate>${rfc822(channel.items[0].date)}</lastBuildDate>` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${page(channel.path)}</link>
    <description>${escapeXml(channel.description)}</description>
    <language>en</language>
    <atom:link href="${url(channel.self)}" rel="self" type="application/rss+xml" />${built}
${items.join("\n")}
  </channel>
</rss>
`;
}
