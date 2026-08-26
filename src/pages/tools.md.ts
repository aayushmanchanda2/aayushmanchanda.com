/**
 * /tools.md — every tool in one table, for an agent that asked for markdown.
 *
 * The HTML page splits the same list across a component, a category route and a
 * verdict route, which is right for someone scrolling and wrong for something
 * reading. So this is one flat table, plus the URLs of the filtered views that
 * exist, so an agent can go narrower without guessing a path.
 *
 * Rows come from `lib/tools.ts` in the order that boundary already sorted them,
 * and the note column is Aayush's sentence with nothing done to it but table
 * escaping.
 */
import type { APIRoute } from "astro";

import {
  PAGES,
  linkOrText,
  list,
  markdownDocument,
  section,
  table,
} from "../lib/markdown";
import { absolute } from "../lib/site";
import type { Verdict } from "../lib/tools";
import { VERDICTS, categories, tools, verdictGroups } from "../lib/tools";

/**
 * What the four words mean. A verdict is the whole point of the page and it is
 * one word wide, so an agent reading the table needs the vocabulary spelled out
 * once. Keyed by `Verdict`, so adding a fifth verdict fails the build here
 * rather than shipping an unexplained column value.
 */
const MEANING: Record<Verdict, string> = {
  using: "In the daily stack right now.",
  watching: "Runs fine and has not earned a place in the daily stack.",
  "on-hold": "Testing started, then stopped before reaching a verdict.",
  skipped: "Looked at and set aside. The note says why.",
};

export const GET: APIRoute = () => {
  const rows = tools.map((tool) => [
    linkOrText(tool.name, tool.url),
    tool.verdict,
    tool.category,
    tool.status_date,
    tool.note,
  ]);

  return markdownDocument({
    page: PAGES.tools,
    title: "Tools",
    description:
      "Software Aayush Manchanda installed, ran, and formed an opinion about, with a dated verdict on each one.",
    blocks: [
      table(["Tool", "Verdict", "Category", "Updated", "Note"], rows),
      section(
        "Verdicts",
        list(VERDICTS.map((verdict) => `\`${verdict}\`: ${MEANING[verdict]}`)),
        "Every verdict carries the date it was last true. How stale that makes it is the reader's call to make, not a thing the page decides.",
      ),
      section(
        "Filtered views",
        "By category:",
        list(
          categories.map(
            (group) =>
              `${group.category} (${group.tools.length}): ${absolute(`/tools/category/${group.slug}`)}`,
          ),
        ),
        "By verdict:",
        list(
          verdictGroups.map(
            (group) =>
              `${group.verdict} (${group.tools.length}): ${absolute(`/tools/verdict/${group.verdict}`)}`,
          ),
        ),
      ),
      section(
        "One page per tool",
        list(
          tools.map(
            (tool) => `${tool.name}: ${absolute(`/tools/${tool.slug}`)}`,
          ),
        ),
      ),
    ],
  });
};
