# aayushmanchanda.com

Personal digital mindscape — who I am, tools I test, sites that inspire me, notes and experiments.

Astro 5 static site, git-as-database, deployed on Vercel. Content publishes via a Raindrop → GitHub Actions → Playwright screenshot pipeline (see `pipeline/`).

Runbook: TBD (filled in at ship).

## Reading this site as an agent

Every section page has a markdown variant generated from the same parsed data
the HTML page renders, so the two cannot drift. `src/lib/markdown.ts` holds the
shared shape; `src/pages/*.md.ts` are the endpoints.

Two ways to get one:

- Send `Accept: text/markdown` to the page's own URL. `vercel.json` rewrites to
  the `.md` file when the header matches.
- Or fetch the `.md` URL directly.

`/llms.txt` and `/robots.txt` are generated too, because they quote absolute
URLs and the origin lives in exactly one place.

### Why vercel.json carries no comments

Vercel validates that file against a strict schema and rejects any property it
does not recognise, a `_comment` key included. It fails the deployment rather
than ignoring the key, so the reasoning lives here instead.

- The `has` condition on `accept` is what makes negotiation work on a static
  deployment. No server, no adapter, no middleware. The `.*text/markdown.*`
  regex is deliberately loose because real clients send a q-weighted list
  rather than a bare type.
- `Vary: Accept` is attached to the **source** paths, not the destinations,
  because Vercel applies `headers` by incoming request path. One rule therefore
  covers both variants of a URL. Without it a CDN can hand cached HTML to an
  agent that asked for markdown, depending on which variant landed in the cache
  first.
- `Content-Type` is set explicitly on the `.md` routes rather than left to
  extension sniffing, so the negotiated response is unambiguous.

### Flipping the domain

The canonical origin is `SITE_URL` in `src/lib/site.ts`, and nothing else. At
DNS cutover, change that one line to `https://aayushmanchanda.com`. The Astro
config, the canonical tags, the sitemap, the JSON-LD, `/llms.txt`, `/robots.txt`
and every absolute URL in the markdown variants all follow from it.

### Regenerating the social card

`npm run og` rewrites `public/og.png` (1200x630). It renders through Playwright
rather than an SVG rasteriser so the card is actually set in Geist instead of
falling back to whatever sans the build machine happens to have. The output is
committed.
