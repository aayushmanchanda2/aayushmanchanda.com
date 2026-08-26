/**
 * /index.md — the whole site, for an agent that asked for markdown.
 *
 * Same job the home page does for a person: say what this is, then point at the
 * sections. The section list comes from `lib/sections.ts`, the manifest the
 * rail nav and the home-page index already read, so a section that is empty
 * disappears from all three at once instead of from two of them.
 */
import type { APIRoute } from "astro";

import {
  PAGES,
  list,
  markdownDocument,
  section,
  table,
} from "../lib/markdown";
import { getSections } from "../lib/sections";
import { absolute } from "../lib/site";

const VARIANTS = Object.values(PAGES);

export const GET: APIRoute = async () => {
  const sections = await getSections();

  const rows = sections.map((entry) => {
    const variant = VARIANTS.find((page) => page.html === entry.href);
    return [
      entry.name,
      String(entry.count),
      absolute(entry.href),
      // "none" rather than a guessed path: a section can exist without a
      // markdown variant, and inventing a URL for it would send an agent to a 404.
      variant === undefined ? "none" : absolute(variant.md),
      entry.blurb,
    ];
  });

  return markdownDocument({
    page: PAGES.home,
    title: "Aayush Manchanda",
    description:
      "The personal site of Aayush Manchanda: a log of the tools he has run, the sites he likes, his notes, and what he has going.",
    blocks: [
      [
        "Aayush is 28 and runs two AI companies from Canada. Orbis builds AI for",
        "healthcare, and Vetted is his AI consulting practice. Most of his time",
        "goes into agent systems, including the pipeline that publishes this site:",
        "he saves a link from his phone and it turns up here a few hours later.",
      ].join(" "),
      [
        "The site is a log rather than a portfolio. Every entry carries the date",
        "it was written or last checked, and nothing is deleted once it stops",
        "being flattering.",
      ].join(" "),
      section("Sections", table(["Section", "Entries", "Page", "Markdown", "About"], rows)),
      section(
        "For agents",
        list([
          `Every section page has a markdown variant at the same path with \`.md\` on the end. The home page is at ${absolute(PAGES.home.md)}.`,
          `${absolute("/llms.txt")} is a short index of the site written for language models.`,
          `${absolute("/sitemap-index.xml")} lists every URL the site publishes.`,
        ]),
      ),
    ],
  });
};
