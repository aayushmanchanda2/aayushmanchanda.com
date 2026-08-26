/**
 * /reading.md — the saved links as a table, for an agent that asked for markdown.
 *
 * This is the one variant whose HTML page has nothing an agent cannot have. The
 * other four either hide something behind a picture (/sites) or spread one list
 * across several routes (/tools); /reading is a table on both sides, so the two
 * renderings are close to the same document.
 *
 * The one thing worth saying out loud here is the absence: an agent that has
 * learned the shape of this site will look for `/reading/<slug>` the way it
 * found `/tools/<slug>`, and there is nothing there. So the closing section says
 * so, rather than letting it find out with a 404.
 *
 * Rows come from `lib/reading.ts` in the order that boundary already sorted
 * them, newest save first.
 */
import type { APIRoute } from "astro";

import {
  PAGES,
  link,
  list,
  markdownDocument,
  section,
  table,
  newest,
} from "../lib/markdown";
import type { Kind } from "../lib/reading";
import { KINDS, kindGroups, reading, readingDomains } from "../lib/reading";
import { absolute } from "../lib/site";

/**
 * What the three words mean. Keyed by `Kind`, so a fourth kind fails the build
 * here rather than shipping an unexplained column value.
 */
const MEANING: Record<Kind, string> = {
  article: "A piece of writing on someone's own site or newsletter.",
  post: "A short thing published on a social timeline.",
  video: "A talk, an interview, or a recorded workshop.",
};

export const GET: APIRoute = () => {
  const rows = reading.map((entry) => [
    link(entry.title, entry.url),
    entry.domain,
    entry.kind,
    entry.saved_date,
    entry.note ?? "",
  ]);

  return markdownDocument({
    page: PAGES.reading,
    title: "Reading",
    description:
      "Articles, posts and talks Aayush Manchanda saved to read properly, with the date he saved each one.",
    updated: newest(reading.map((entry) => entry.saved_date)),
    blocks: [
      table(["Title", "Domain", "Kind", "Saved", "Note"], rows),
      section(
        "Kinds",
        list(KINDS.map((kind) => `\`${kind}\`: ${MEANING[kind]}`)),
        "A saved link is not a read link, and neither is a recommendation. The date is the day it was saved and nothing more.",
      ),
      section(
        "Filtered views",
        "By kind:",
        list(
          kindGroups.map(
            (group) =>
              `${group.kind} (${group.entries.length}): ${absolute(`/reading/kind/${group.kind}`)}`,
          ),
        ),
        "By domain:",
        list(
          readingDomains.map(
            (group) =>
              `${group.domain} (${group.entries.length}): ${absolute(`/reading/domain/${group.slug}`)}`,
          ),
        ),
      ),
      section(
        "No page per entry",
        "Unlike /tools, /sites and /notes, a reading entry has no page of its own. There is nothing at /reading/<slug>, and the table above already holds everything the site knows about a row. Follow the title's URL to reach the source.",
      ),
    ],
  });
};
