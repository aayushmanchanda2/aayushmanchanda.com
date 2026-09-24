/**
 * /now.md: the /now page for an agent that asked for markdown. Same parts as
 * the page (`lib/now.ts`), links made absolute, dated by `NOW_UPDATED`.
 */
import type { APIRoute } from "astro";

import { absolutize } from "../lib/links";
import { PAGES, link, list, markdownDocument, section } from "../lib/markdown";
import { NOW_ASK, NOW_UPDATED, nowDate, nowGroups, toolCounts, type Part } from "../lib/now";
import { tools } from "../lib/tools";

const line = (parts: Part[]) =>
  parts.map((part) => (typeof part === "string" ? part : link(part.text, absolutize(part.href)))).join("");

export const GET: APIRoute = () =>
  markdownDocument({
    page: PAGES.now,
    title: "Now",
    description: "What Aayush Manchanda is building, testing and learning right now.",
    updated: NOW_UPDATED,
    blocks: [
      `Updated ${nowDate()}`,
      ...nowGroups(toolCounts(tools)).map((group) =>
        section(group.head, group.list ? list(group.lines.map(line)) : group.lines.map(line).join("\n\n")),
      ),
      line(NOW_ASK),
    ],
  });
