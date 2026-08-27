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
   * Opt-in prefetching, for the library's kind tabs and nothing else so far.
   *
   * `prefetchAll` stays off deliberately. Turning it on would have the browser
   * fetch every link in view, which on a page that is a list of forty rows is
   * forty requests nobody asked for, and on /tools most of those links leave
   * the site. So a link prefetches only where the markup says `data-astro-prefetch`,
   * and the default strategy for one is `hover`: the tabs are four adjacent
   * targets, and a reader crossing the row on the way to the third one should
   * not pull the first two down with them the way `viewport` or `load` would.
   *
   * It costs one small module on the pages that carry a prefetching link, and
   * nothing on the pages that do not. No page needs it to be readable, which is
   * the claim /llms.txt makes about JavaScript on this site.
   */
  prefetch: { defaultStrategy: 'hover' },

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
