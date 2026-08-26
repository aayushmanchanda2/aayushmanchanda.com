/**
 * /sites.md — the gallery as a table, for an agent that asked for markdown.
 *
 * The HTML page is almost entirely pictures, which is the one thing a markdown
 * variant cannot carry across. So the shot is given as a URL instead: an agent
 * that wants to look at one can fetch it, and an agent that does not still gets
 * the title, the domain, the date and the link to the original.
 *
 * The palette rides along as text, which is the one part of the picture markdown
 * CAN carry: an agent asking "what does this site's colour scheme look like"
 * gets an answer without downloading a megabyte of WebP to find out.
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
import { sites } from "../lib/sites";

export const GET: APIRoute = () => {
  const rows = sites.map((site) => [
    link(site.title, site.url),
    site.domain,
    site.saved_date,
    absolute(`/sites/${site.slug}`),
    link("shot", absolute(site.shot)),
    site.palette.join(" "),
    // Space-separated slugs, as stored, rather than the prose labels the HTML
    // page shows: an agent asking "what else is in this collection" needs the
    // string that builds `/sites/collection/<slug>`, and most entries are in
    // none, so the usual cell here is empty.
    site.collections.join(" "),
  ]);

  return markdownDocument({
    page: PAGES.sites,
    title: "Sites",
    description:
      "Websites Aayush Manchanda saved for how they look, each one captured as a full-page screenshot on the day it was saved.",
    updated: newest(sites.map((site) => site.saved_date)),
    blocks: [
      table(
        ["Site", "Domain", "Saved", "Page", "Screenshot", "Palette", "Collections"],
        rows,
      ),
      section(
        "About the screenshots",
        "These are screenshots of other people's sites, captured automatically on the day the site was saved. Every row credits the original with a link to it.",
        "Each shot is the whole page, top to bottom, in whatever colour scheme the site itself renders by default. Very long pages are cut off after 12,000 pixels.",
        "The palette is read off the pixels of that screenshot, most-used colour first. It is measured, not chosen, so it is a description of the capture rather than the designer's own swatches.",
      ),
      section(
        "About the collections",
        "Collections are groupings I made by hand. They overlap: a site can be in several of them, or in none, and the column is empty for most entries.",
        "Each one is browsable at /sites/collection/<slug>, using the slug exactly as it appears in the column.",
      ),
    ],
  });
};
