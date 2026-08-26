/**
 * /sites.md — the gallery as a table, for an agent that asked for markdown.
 *
 * The HTML page is almost entirely pictures, which is the one thing a markdown
 * variant cannot carry across. So the shots are given as URLs instead: an agent
 * that wants to look at one can fetch it, and an agent that does not still gets
 * the title, the domain, the date and the link to the original.
 *
 * Rows come from `lib/sites.ts` in the order that boundary already sorted them,
 * newest save first.
 */
import type { APIRoute } from "astro";

import {
  PAGES,
  link,
  markdownDocument,
  section,
  table,
  newest,
} from "../lib/markdown";
import { absolute } from "../lib/site";
import type { SiteShots } from "../lib/sites";
import { sites } from "../lib/sites";

/** Dark is genuinely absent for some sites, so the cell shrinks rather than
 *  carrying a placeholder an agent would have to learn to ignore. */
function shotLinks(shots: SiteShots): string {
  const light = link("light", absolute(shots.light));
  if (shots.dark === null) return light;
  return `${light} ${link("dark", absolute(shots.dark))}`;
}

export const GET: APIRoute = () => {
  const rows = sites.map((site) => [
    link(site.title, site.url),
    site.domain,
    site.saved_date,
    absolute(`/sites/${site.slug}`),
    shotLinks(site.shots),
  ]);

  return markdownDocument({
    page: PAGES.sites,
    title: "Sites",
    description:
      "Websites Aayush Manchanda saved for how they look, each one screenshotted in light and dark on the day it was saved.",
    updated: newest(sites.map((site) => site.saved_date)),
    blocks: [
      table(["Site", "Domain", "Saved", "Page", "Screenshots"], rows),
      section(
        "About the screenshots",
        "These are screenshots of other people's sites, captured automatically on the day the site was saved. Every row credits the original with a link to it.",
        "A row with one screenshot instead of two is a site with no separate dark rendering to capture.",
      ),
    ],
  });
};
