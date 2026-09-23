// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import { PAGES } from './src/lib/markdown.ts';
import { SITE_URL, absolute } from './src/lib/site.ts';

/**
 * The markdown variants, which the sitemap does not find on its own.
 *
 * `@astrojs/sitemap` walks the HTML pages the build emitted, and a static file
 * endpoint (`src/pages/tools.md.ts`) is not one, so every one of them would be
 * invisible to anything that discovers the site through its sitemap. They are
 * added back by hand because an agent reading the sitemap should be able to see
 * that a markdown version of each page exists without knowing to guess a `.md`
 * suffix or to negotiate on `Accept`.
 *
 * Read from `src/lib/markdown.ts`, the one list of variants the site has. This
 * file used to keep its own copy, and a copy goes stale quietly: /library's
 * variant would have shipped, worked, and stayed invisible to the sitemap.
 *
 * A search engine reads the same sitemap, and to it each variant is a duplicate
 * of the HTML page it mirrors. So every `.md` response carries a
 * `Link: rel="canonical"` header naming its HTML page (`vercel.json`): the
 * variant stays discoverable here, and the HTML page is the one that gets
 * indexed. Dropping the variants from the sitemap instead would have kept
 * search engines tidy by hiding the markdown from every agent that starts at
 * the sitemap, which is backwards for this site.
 */
const MARKDOWN_VARIANTS = Object.values(PAGES).map((page) => absolute(page.md));

// https://astro.build/config
export default defineConfig({
  /**
   * The origin, from the one module that owns it. `site` is what makes
   * `Astro.site` real, which is what the canonical link and the sitemap are
   * built from, so reading it from `src/lib/site.ts` rather than writing it
   * inline keeps every absolute URL on the site derived from a single line.
   * See that file for the DNS cutover note.
   */
  site: SITE_URL,

  /**
   * No Shiki. It paints every fenced block in an inline `github-dark` style
   * that no stylesheet can theme, so a code block in a note was a black slab
   * on the light page. `styles/prose.css › .prose pre` draws it in the site's
   * own surface and ink in both themes instead, monochrome like the rest.
   */
  markdown: { syntaxHighlight: false },

  integrations: [
    sitemap({
      customPages: MARKDOWN_VARIANTS,

      /**
       * A build-time `lastmod` on every entry, so an agent can tell how stale
       * the site is without fetching each page.
       *
       * Build time rather than per-page content dates: this site rebuilds when
       * its content changes (the publish pipeline commits, Vercel rebuilds), so
       * the two are the same date in practice, and Astro does not hand the
       * integration a per-route content date to use instead. The markdown
       * variants carry a real per-section `last-updated` in their frontmatter
       * for anything that needs the precise answer.
       */
      lastmod: new Date(),

      /**
       * `/robots.txt` and `/llms.txt` are instructions to a crawler, not
       * content for one to index. The integration already skips them today
       * because they are endpoints rather than pages; this keeps them out if
       * that ever changes.
       */
      filter: (page) =>
        !page.endsWith('/robots.txt') && !page.endsWith('/llms.txt'),
    }),
  ],
});
