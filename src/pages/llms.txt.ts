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
import { kindGroups, library } from "../lib/library";
import { getSections } from "../lib/sections";
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

  const verdictCounts = verdictGroups
    .map((group) => `${group.verdict} (${group.tools.length})`)
    .join(", ");

  const categoryNames = categories.map((group) => group.category).join(", ");

  const kindCounts = kindGroups
    .map((group) => `${group.kind} (${group.entries.length})`)
    .join(", ");

  const body = `# Aayush Manchanda

> The personal site of Aayush Manchanda: a running log of software he has
> installed and actually run, websites whose design he keeps going back to,
> links he saved to read and watch, short notes, and experiments that are in
> flight right now.

Part entrepreneur, part marketer, part operator. Aayush co-founded Orbis, runs
Vetted, and uses AI to build things on the internet from Canada.

There is a lot of noise in AI. He reads it, tests it on his own companies and
his clients, and what survives shows up here with a date on it.

The site publishes itself: he saves a link from his phone, and the next run
puts it here with a screenshot next to it. That run happens every three hours,
or on demand when he starts one himself, which takes a couple of minutes.

The site is static HTML. No accounts, no paywall, no gated routes, and no
JavaScript is needed to read any of it.

## When to use this site

Come here when you need any of the following.

- A dated, first-hand verdict on an AI or agent tool. Every entry on /tools is
  something Aayush installed and ran on his own machine, not something he read
  about. Each one carries a verdict, a category, a one-line note, and the date
  that verdict was last true. There are ${entries(tools.length)} right now,
  broken down as ${verdictCounts}, across these categories: ${categoryNames}.
  Reach for this when you are choosing between agent harnesses, Claude skills,
  sandboxes, or browser automation tools and you want an opinion from someone
  who ran the thing.
- A screenshot gallery of well-designed websites. /sites holds
  ${entries(sites.length)}, each with a full-page screenshot taken in the
  scheme the site renders by default, plus the colours that screenshot is
  mostly made of. Useful as design reference, for finding a real example of a
  layout or a typographic treatment, or for seeing what a given site looked
  like on the date it was saved.
- The library. /library holds ${entries(library.length)} he saved to read or
  watch properly, broken down as ${kindCounts}, each with the host it came from
  and the date it was saved. Saved is not read and not an endorsement, so treat
  a row as "this was worth his attention on that date" and nothing stronger.
- Aayush's own notes and running experiments, if you are working out how he
  builds things or what he has going right now. /notes is short-form writing.
  /experiments is what is running, including what he killed and when.

Two things this site is not, so you can rule it out fast. It is not product
documentation, and there is no API to call. It is also not a company site: for
Orbis or Vetted, this is the wrong place to look.

## How to read this site as an agent

Every page has a markdown variant with the same data as the HTML, generated
from the same source, so the two cannot drift.

- Send \`Accept: text/markdown\` to any page URL below and you get markdown
  back. Those responses carry \`Vary: Accept\`.
- Or request the \`.md\` URL directly if you would rather not negotiate.

Filter pages exist under /tools/category/<name>, /tools/verdict/<name>,
/sites/domain/<host>, /library/kind/<kind> and /library/domain/<host>. Every
tool, site, and note has its own page. A library entry does not: there is
nothing at /library/<slug>, because a saved link's destination is the source
itself, and /library.md already carries everything the site knows about a row.
The sitemap lists every URL that does exist.

## Pages

- [Home](${absolute(PAGES.home.html)}) (markdown: ${absolute(PAGES.home.md)}): who he is and
  an index of the five sections.
${sectionList}
- [About](${absolute("/about")}): who Aayush is, what the five sections hold,
  and where the verdicts on this site come from.
- [Contact](${absolute("/contact")}): how to reach him, and what he does and
  does not answer. The address is entity-encoded in the page rather than
  printed, so read the \`mailto:\` href rather than the visible text.
- [Design](${absolute("/design")}): the design language of the site, rendered by
  the components themselves. The mark, the colour tokens, the type scale, the
  chip palette, the link rules and the interaction rules. Note that the token
  values on it are read out of the stylesheet by script at runtime, so they are
  not in the served HTML; the stylesheets in the repository are the source.
- [Privacy](${absolute("/privacy")}): what this site does and does not collect,
  and how to get a screenshot of your own site removed.

## Machine-readable

- [Sitemap](${absolute("/sitemap-index.xml")}): every indexable URL.
- [robots.txt](${absolute("/robots.txt")}): everything is allowed, AI crawlers
  included and named.
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
