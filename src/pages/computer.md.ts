/**
 * /computer.md: every tip in full, in the index's order, for an agent that
 * asked for markdown. Same shape as /notes.md, for the same reason: the text
 * is the tip, so a table of titles would send an agent on four more errands.
 */
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

import { PAGES, markdownDocument } from "../lib/markdown";
import { absolute } from "../lib/site";

export const GET: APIRoute = async () => {
  const tips = (await getCollection("computer")).sort((a, b) => a.data.order - b.data.order);

  const blocks = tips.map((tip) =>
    [
      `## ${tip.data.emoji} ${tip.data.title}`,
      [tip.data.summary, `Page: ${absolute(`/computer/${tip.id}`)}`].join("\n"),
      tip.body?.trim() ?? "",
    ]
      .filter((part) => part !== "")
      .join("\n\n"),
  );

  return markdownDocument({
    page: PAGES.computer,
    title: "Computer",
    description:
      "Tips from Aayush Manchanda on how he works with his computer and the AI agents on it, in full.",
    blocks: blocks.length === 0 ? ["No tips yet."] : blocks,
  });
};
