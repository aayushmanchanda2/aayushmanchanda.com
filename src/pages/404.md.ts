/**
 * The markdown 404.
 *
 * An agent that asked for markdown and hit a dead URL should not get a page of
 * HTML back explaining the problem in a language it did not ask for. It gets
 * this instead, still with a 404 status: the same recovery links `404.astro`
 * shows a person, in the form the client said it wanted.
 *
 * Built through `markdownDocument()` like the other five. It used to hand-roll
 * its own `Response`, which made it the one markdown document on the site with
 * no frontmatter, no canonical URL and no index of the other pages — exactly
 * the document that most needs to say where else to go.
 *
 * The section list comes from the manifest for the same reason every other
 * surface reads it: a section that empties out must not be offered from the one
 * page whose whole job is to stop dead ends.
 */

import type { APIRoute } from "astro";

import type { MarkdownPage } from "../lib/markdown";
import { list, markdownDocument, section } from "../lib/markdown";
import { getSections } from "../lib/sections";
import { absolute } from "../lib/site";

/**
 * Declared here rather than added to `PAGES`, deliberately.
 *
 * `PAGES` is the list of variants every other document links to in its footer
 * and the sitemap advertises by hand. A 404 belongs in neither. It is still a
 * document with a URL of its own, though, and the shared machinery has to be
 * told which one.
 */
const NOT_FOUND: MarkdownPage = {
  html: "/404",
  md: "/404.md",
  name: "Not found",
};

export const GET: APIRoute = async () => {
  const sections = await getSections();

  const rows = sections.map((entry) => {
    const md = entry.md === null ? "" : ` (markdown: ${absolute(entry.md)})`;
    return `${entry.name}: ${absolute(entry.href)}${md}`;
  });

  return markdownDocument({
    page: NOT_FOUND,
    status: 404,
    title: "Not found",
    description:
      "This URL does not exist on aayushmanchanda.com. What follows is everything the site actually has.",
    blocks: [section("Where to look instead", list(rows))],
  });
};
