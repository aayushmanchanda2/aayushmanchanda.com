/**
 * /llms.txt
 *
 * The front door for an agent. An agent that lands here should be able to
 * answer three questions without fetching anything else: what is this site,
 * when is it worth reading, and how do I read the rest of it cheaply.
 *
 * Generated rather than kept as a static file in `public/`, for two reasons.
 * It quotes absolute URLs, and the origin lives in one place (`src/lib/site.ts`)
 * so the DNS cutover stays a one-line change. And the section list comes from
 * the same manifest the nav and the home page read, so a section that empties
 * out disappears from here too instead of pointing an agent at a blank page.
 *
 * On the prose: no em dashes, no adjectives that are doing sales work. This
 * file is read by something that is deciding whether to spend a request, and
 * the honest shape of the site is more useful to it than a pitch.
 */

import type { APIRoute } from "astro";

import { PAGES } from "../lib/markdown";
import { digested, kindGroups, library } from "../lib/library";
import { FEEDS, getSections } from "../lib/sections";
import { sites } from "../lib/sites";
import { categories, tools, verdictGroups } from "../lib/tools";
import { absolute } from "../lib/site";

/** Counts are interpolated into prose, and "1 entries" reads as a bug. */
const entries = (count: number) => `${count} ${count === 1 ? "entry" : "entries"}`;

export const GET: APIRoute = async () => {
  const sections = await getSections();

  // `section.md` comes from the manifest, which reads it from `lib/markdown.ts`.
  // A section that has no variant says nothing rather than being handed a URL
  // derived from its path, which would point an agent at a file that is not there.
  const sectionList = sections
    .map((section) => {
      const md = section.md === null ? "" : `, markdown: ${absolute(section.md)}`;
      return `- [${section.name}](${absolute(section.href)}) (${entries(section.count)}${md}): ${section.blurb}`;
    })
    .join("\n");

  const feedList = FEEDS.map((feed) => `- [${feed.title}](${absolute(feed.href)})`).join("\n");

  const verdictCounts = verdictGroups
    .map((group) => `${group.verdict} (${group.tools.length})`)
    .join(", ");

  const categoryNames = categories.map((group) => group.category).join(", ");

  const kindCounts = kindGroups
    .map((group) => `${group.kind} (${group.entries.length})`)
    .join(", ");

  const body = `# Aayush Manchanda

> Aayush Manchanda's site: software he installed and ran, websites saved for
> their design, links he read and watched, short notes with tips on how he
> works with his computer, and running experiments.

Aayush co-founded Orbis, an AI healthcare company, runs Vetted, an AI
transformation partner, and builds things with AI.

He tests AI tools on his own companies and his clients; what survives shows up
here with a date on it.

New entries arrive from a pipeline that runs every three hours.

The site is static HTML. No paywall, and no JavaScript is needed to read any
of it. The one gated route is /me, one signed-in reader's private pages;
robots.txt disallows it and nothing public links into it.

## When to use this site

Come here when you need any of the following.

- A dated, first-hand verdict on an AI or agent tool. Every entry on /tools was
  installed and run by Aayush. Each carries a verdict, a category, a short
  description, a one-line note, and the date the verdict was last true.
  ${entries(tools.length)} right now: ${verdictCounts}, across ${categoryNames}. Useful when choosing between
  agent harnesses, Claude skills, sandboxes or browser automation tools.
- Screenshots of well-designed websites. /sites holds ${entries(sites.length)},
  each a full-page screenshot in the site's default colour scheme, with its
  most-used colours. Useful as design reference, or to see what a site looked
  like on the date it was saved.
- The library. /library holds ${entries(library.length)}: ${kindCounts}, each
  with a one-line TLDR, its host and saved date. The page shows the latest
  saves; /library/kind/<kind> shows one kind laid out for it (articles as a
  reader, posts as cards, videos as posters). A saved row isn't an
  endorsement; a digest is his verdict.
- /notes opens with tips on how he works with his computer and AI agents, each
  with the exact steps, then his short writing. /experiments is what's
  running, including what he killed and when.

Not here: product documentation, an API, or anything about Orbis or Vetted as
companies.

## How to read this site as an agent

The home page and every section page have a markdown variant with the same
data as the HTML.

- Send \`Accept: text/markdown\` to any page URL below and you get markdown
  back. Those responses carry \`Vary: Accept\`.
- Or request the \`.md\` URL directly if you would rather not negotiate.

Filter pages exist under /tools/category/<name>, /tools/verdict/<name>,
/sites/domain/<host>, /library/kind/<kind> and /library/domain/<host>; a
tag filters /library as /library?tags=<tag>. Every tool, site, note and library entry has its own page.
A library entry's page at /library/<slug> holds the kind, host, tags, saved
date, his one-line note, and the source. ${digested.length} of ${library.length}
are digested by his agents, with cliff notes and a call on whether it's worth reading. A
saved post's page carries the full post; its card cuts off at 280 characters.
A block labelled as a draft was written by his pipeline and isn't his verdict.
${entries(library.filter((entry) => entry.block !== null).length)} open with a short version: who it's for, the tip,
the time it takes, what you need, a prompt to copy (marked when the site wrote
it) and where to start.
/library.md carries every row and every short version as markdown.

## Pages

- [Home](${absolute(PAGES.home.html)}) (markdown: ${absolute(PAGES.home.md)}): who he is and
  an index of the sections.
${sectionList}
- [About](${absolute("/about")}): who Aayush is, his work, and what the
  sections hold.
- [Contact](${absolute("/contact")}): how to reach him and what gets a reply.
  The address is entity-encoded; read the \`mailto:\` href, not the visible
  text.
- [Design](${absolute("/design")}): the mark, colour tokens, type scale, chip
  palette, link and interaction rules, rendered by the site's own components.
  Token values are read from the stylesheet at runtime and aren't in the served
  HTML; the repository's stylesheets are the source.
- [Privacy](${absolute("/privacy")}): what the site collects, what it loads
  from elsewhere, and how to get a screenshot removed.

## Machine-readable

- [Sitemap](${absolute("/sitemap-index.xml")}): every indexable URL.
- [robots.txt](${absolute("/robots.txt")}): everything is allowed, AI crawlers
  included and named.

## Feeds

RSS 2.0, newest 50 entries each. Every item carries the entry's own text: a
tool's verdict and note, a library entry's digest or note, his notes on a site
where he wrote any, a note in full. The first feed is every section at once.

${feedList}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
