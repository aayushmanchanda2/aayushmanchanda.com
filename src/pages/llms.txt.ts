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

import { getSections } from "../lib/sections";
import { sites } from "../lib/sites";
import { categories, tools, verdictGroups } from "../lib/tools";
import { absolute } from "../lib/site";

/** `/tools` -> `/tools.md`. The markdown variant of a section page. */
const markdownUrl = (href: string) => absolute(`${href}.md`);

/** Counts are interpolated into prose, and "1 entries" reads as a bug. */
const entries = (count: number) => `${count} ${count === 1 ? "entry" : "entries"}`;

export const GET: APIRoute = async () => {
  const sections = await getSections();

  const sectionList = sections
    .map(
      (section) =>
        `- [${section.name}](${absolute(section.href)}) (${entries(section.count)}, markdown: ${markdownUrl(section.href)}): ${section.blurb}`,
    )
    .join("\n");

  const verdictCounts = verdictGroups
    .map((group) => `${group.verdict} (${group.tools.length})`)
    .join(", ");

  const categoryNames = categories.map((group) => group.category).join(", ");

  const body = `# Aayush Manchanda

> The personal site of Aayush Manchanda: a running log of software he has
> installed and actually run, websites whose design he keeps going back to,
> short notes, and experiments that are in flight right now.

Aayush is 28 and runs two AI companies from Canada. Orbis builds AI for
healthcare. Vetted is his AI consulting practice. Most of his time goes into
agent systems, including the pipeline that publishes this site: he saves a link
from his phone and it shows up here a few hours later with a screenshot next
to it.

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
  ${entries(sites.length)}, each with a full-page screenshot in light and,
  where the site has one, dark. Useful as design reference, for finding a real
  example of a layout or a typographic treatment, or for seeing what a given
  site looked like on the date it was saved.
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

Verdict and category filter pages exist under /tools/category/<name> and
/tools/verdict/<name>, and every tool, site, and note has its own page. The
sitemap lists all of them.

## Pages

- [Home](${absolute("/")}) (markdown: ${absolute("/index.md")}): who he is and
  an index of the four sections.
${sectionList}
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
