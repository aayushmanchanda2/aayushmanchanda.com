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
  voiceSection,
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

  /** Prose, so it goes under the table rather than into another column of it. */
  const words = voiceSection(
    sites.map((site) => ({ name: site.title, voice: site })),
  );

  return markdownDocument({
    page: PAGES.sites,
    title: "Sites",
    description:
      "Websites Aayush Manchanda saved for how they look, each a full-page screenshot from the day it was saved.",
    updated: newest(sites.map((site) => site.saved_date)),
    blocks: [
      table(
        ["Site", "Domain", "Saved", "Page", "Screenshot", "Palette", "Collections"],
        rows,
      ),
      ...(words === null ? [] : [words]),
      section(
        "About the screenshots",
        "Screenshots of other people's sites, taken the day each was saved. Every row links to the original.",
        "Each shot is the whole page in the site's default colour scheme, cut off after 12,000 pixels.",
        "The palette is the screenshot's most-used colours, measured from the pixels, not the designer's swatches.",
      ),
      section(
        "About the pages",
        "Every row is one saved page. Pages saved from the same domain share one card on /sites and are listed together on each of their pages; each still has its own /sites/<slug>.",
      ),
      section(
        "About the collections",
        "Collections are hand-made groupings. A site can be in several or none.",
        "Each is at /sites/collection/<slug>, using the slug in the column.",
      ),
    ],
  });
};
