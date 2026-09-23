/**
 * /index.md — the whole site, for an agent that asked for markdown.
 *
 * Same job the home page does for a person: say what this is, then point at the
 * sections. The section list comes from `lib/sections.ts`, the manifest the
 * menu panel and the home-page index already read, so a section that is empty
 * disappears from all three at once instead of from two of them.
 */
import type { APIRoute } from "astro";

import { getCollection } from "astro:content";

import { isoDay } from "../lib/date";
import { experiments } from "../lib/experiments";
import { feedItems } from "../lib/feeds";
import {
  PAGES,
  link,
  list,
  markdownDocument,
  newest,
  section,
  table,
} from "../lib/markdown";
import { newestFirst } from "../lib/rss";
import { getSections } from "../lib/sections";
import { absolute } from "../lib/site";
import { sites } from "../lib/sites";
import { tools } from "../lib/tools";

export const GET: APIRoute = async () => {
  const sections = await getSections();

  const rows = sections.map((entry) => [
    entry.name,
    String(entry.count),
    absolute(entry.href),
    // "none" rather than a guessed path: a section can exist without a markdown
    // variant, and inventing a URL for it would send an agent to a 404. The
    // manifest already carries the answer, so this page does not re-derive it.
    entry.md === null ? "none" : absolute(entry.md),
    entry.blurb,
  ]);

  // The home page's "Latest" list, the same five.
  const latest = newestFirst(await feedItems(), 5).map(
    (item) => `${link(item.title, absolute(item.path))} (${item.section}, ${item.date})`,
  );

  return markdownDocument({
    page: PAGES.home,
    title: "Aayush Manchanda",
    // `markdownDocument` renders this as the lede under the h1, so it carries
    // the identity beat and the first block picks up at the purpose beat. Both
    // here would print the same sentence twice in a row.
    description:
      "Aayush Manchanda co-founded Orbis, runs Vetted, and builds things with AI from Canada.",
    // The home page summarises every section, so its freshness is the freshest
    // thing any section has.
    updated: newest([
      ...tools.map((tool) => tool.status_date),
      ...sites.map((site) => site.saved_date),
      ...experiments.map((experiment) => experiment.started),
      ...(await getCollection("notes")).map((note) => isoDay(note.data.date)),
    ]),
    blocks: [
      [
        "He tests AI tools on his own companies and his clients; what survives",
        "shows up here with a date on it.",
      ].join(" "),
      section("Sections", table(["Section", "Entries", "Page", "Markdown", "About"], rows)),
      ...(latest.length > 0 ? [section("Latest", list(latest))] : []),
      section(
        "For agents",
        list([
          `Every section page has a markdown variant at the same path with \`.md\` on the end. The home page is at ${absolute(PAGES.home.md)}.`,
          `${absolute("/llms.txt")} is a short index of the site written for language models.`,
          `${absolute("/sitemap-index.xml")} lists every URL the site publishes.`,
          `${absolute("/rss.xml")} is an RSS feed of every section; each section has its own at \`/<section>/rss.xml\`.`,
        ]),
      ),
    ],
  });
};
