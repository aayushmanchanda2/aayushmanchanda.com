/**
 * /robots.txt
 *
 * Generated rather than dropped in `public/` because it has to name the
 * sitemap by absolute URL, and the origin lives in exactly one place
 * (`src/lib/site.ts`) so the DNS cutover stays a one-line change.
 *
 * The policy is "yes" and the file says so twice: once with a wildcard, and
 * once per named AI crawler. The wildcard already permits them, so the named
 * blocks are redundant to a parser. They are not redundant to a person or an
 * agent auditing whether this site objects to being read, which is the actual
 * question being asked when someone opens this file.
 */

import type { APIRoute } from "astro";

import { absolute } from "../lib/site";

/**
 * The crawlers worth naming: the ones that fetch on behalf of an assistant,
 * and the ones that gather training or search corpora for one. Listed by the
 * token each vendor documents, not by company, because the token is what a
 * robots parser matches on.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "cohere-ai",
  "meta-externalagent",
] as const;

const BODY = `# aayushmanchanda.com
#
# Everything here is public and meant to be read, by people and by agents
# alike. There are no accounts, no paywall, and no private routes, so there is
# nothing here to disallow.
#
# Every page also has a markdown variant. Send "Accept: text/markdown" to any
# page URL, or append .md to it. Start at ${absolute("/llms.txt")}.

User-agent: *
Allow: /

# Named explicitly so there is no ambiguity: AI crawlers are welcome.
${AI_CRAWLERS.map((agent) => `User-agent: ${agent}\nAllow: /`).join("\n\n")}

Sitemap: ${absolute("/sitemap-index.xml")}
`;

export const GET: APIRoute = () =>
  new Response(BODY, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
