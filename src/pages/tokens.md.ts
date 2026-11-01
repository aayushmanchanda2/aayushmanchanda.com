/**
 * /tokens.md: the /tokens numbers for an agent that asked for markdown.
 */
import type { APIRoute } from "astro";

import { PAGES, list, markdownDocument, section } from "../lib/markdown";
import { nowDate } from "../lib/now";
import { appTotals, compact, summary } from "../lib/tokens";
import { tokens } from "../lib/tokens-data";

const { tokens: total, cost, activeDays, streak } = summary(tokens);

export const GET: APIRoute = () =>
  markdownDocument({
    page: PAGES.tokens,
    title: "Tokens",
    description: "How many tokens Aayush Manchanda's coding agents have used, by app.",
    updated: tokens.generated,
    blocks: [
      `Updated ${nowDate(tokens.generated)}`,
      `${compact(total)} tokens, $${compact(cost)} at list price, ${activeDays} active days, a ${streak}-day streak. Claude Code deletes logs after 30 days, so the real number's higher.`,
      section("By app", list(appTotals(tokens).map(({ app, tokens: count }) => `${app}: ${compact(count)}`))),
    ],
  });
