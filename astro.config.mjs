// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import { SITE_URL, absolute } from './src/lib/site.ts';

/**
 * The markdown variants, which the sitemap does not find on its own.
 *
 * `@astrojs/sitemap` walks the HTML pages the build emitted, and a static file
 * endpoint (`src/pages/tools.md.ts`) is not one, so all five would be invisible
 * to anything that discovers the site through its sitemap. They are added back
 * by hand because an agent reading the sitemap should be able to see that a
 * markdown version of each page exists without knowing to guess a `.md` suffix
 * or to negotiate on `Accept`.
 *
 * This list mirrors `src/pages/*.md.ts` one to one. Adding a sixth variant
 * means adding it here too.
 */
const MARKDOWN_VARIANTS = [
  '/index.md',
  '/tools.md',
  '/sites.md',
  '/notes.md',
  '/experiments.md',
].map(absolute);

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
