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

import { linkLabel } from "../lib/links";
import {
  PAGES,
  link,
  linkOrText,
  list,
  markdownDocument,
  section,
  table,
  newest,
  voiceSection,
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
  /*
   * Two link columns, because a tool has two places to go and an agent asking
   * for markdown is the reader least able to guess the missing one. `Tool`
   * links what the HTML row links — the product when there is one, the
   * repository when there is not — and `Repo` is filled only when it is a
   * second destination, so the same URL never appears twice in one row.
   */
  const rows = tools.map((tool) => [
    linkOrText(tool.name, tool.url ?? tool.repo),
    tool.url === null || tool.repo === null ? "" : link(linkLabel(tool.repo), tool.repo),
    tool.verdict,
    tool.category,
    tool.status_date,
    tool.note,
  ]);

  /**
   * The voice fields do not go in the table. They are paragraphs, and four more
   * columns of paragraph would make every row unreadable to pay for the two
   * entries that have anything in them. They get their own section instead, and
   * no section at all on the day none of them do.
   */
  const words = voiceSection(
    tools.map((tool) => ({ name: tool.name, voice: tool })),
  );

  return markdownDocument({
    page: PAGES.tools,
    title: "Tools",
    description:
      "Software Aayush Manchanda installed, ran, and formed an opinion about, with a dated verdict on each one.",
    updated: newest(tools.map((tool) => tool.status_date)),
    blocks: [
      table(["Tool", "Repo", "Verdict", "Category", "Updated", "Note"], rows),
      ...(words === null ? [] : [words]),
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
