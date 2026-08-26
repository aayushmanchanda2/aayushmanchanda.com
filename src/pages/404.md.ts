/**
 * The markdown 404.
 *
 * An agent that asked for markdown and hit a dead URL should not get a page of
 * HTML back explaining the problem in a language it did not ask for. It gets
 * this instead, still with a 404 status: the same recovery links `404.astro`
 * shows a person, in the form the client said it wanted.
 *
 * The section list comes from the manifest for the same reason every other
 * surface reads it: a section that empties out must not be offered from the one
 * page whose whole job is to stop dead ends.
 */

import type { APIRoute } from "astro";

import { PAGES } from "../lib/markdown";
import { getSections } from "../lib/sections";
import { absolute } from "../lib/site";

/** `/tools` -> the markdown variant, when one exists. */
const VARIANTS = Object.values(PAGES);

export const GET: APIRoute = async () => {
  const sections = await getSections();

  const rows = sections.map((entry) => {
    const variant = VARIANTS.find((page) => page.html === entry.href);
    const md = variant === undefined ? "" : ` (markdown: ${absolute(variant.md)})`;
    return `- ${entry.name}: ${absolute(entry.href)}${md}`;
  });

  const body = `# Not found

This URL does not exist on aayushmanchanda.com.

## Where to look instead

${rows.join("\n")}

## Start here

- Site summary written for agents: ${absolute("/llms.txt")}
- Every URL the site publishes: ${absolute("/sitemap-index.xml")}
- Home: ${absolute("/")} (markdown: ${absolute("/index.md")})
`;

  return new Response(body, {
    status: 404,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
    },
  });
};
