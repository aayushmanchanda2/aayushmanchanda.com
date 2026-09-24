// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import { fileURLToPath } from 'node:url';

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

/**
 * The /me harness (`src/fixtures/MeFixture.astro`): a route under `astro dev`
 * only, so it is never part of a build. It renders the signed-in pages from
 * synthetic rows for screenshots.
 */
/** @type {import('astro').AstroIntegration} */
const meFixture = {
  name: 'me-fixture',
  hooks: {
    'astro:config:setup': ({ command, injectRoute }) => {
      if (command === 'dev') injectRoute({ pattern: '/me/fixture/[view]', entrypoint: './src/fixtures/MeFixture.astro', prerender: false });
    },
  },
};

/**
 * `@clerk/astro/components` imports a virtual module that only Clerk's own
 * integration provides, and that integration injects Clerk's script into every
 * page, public ones included. So the integration stays out and this answers
 * the one question the module asks: /me is rendered on demand.
 * @type {import('vite').Plugin}
 */
const clerkConfig = {
  name: 'clerk-astro-config',
  resolveId: (id) => (id === 'virtual:@clerk/astro/config' ? '\0clerk-astro-config' : undefined),
  load: (id) => (id === '\0clerk-astro-config' ? 'export const isStaticOutput = (forceStatic) => forceStatic ?? false;' : undefined),
};

/**
 * The signed-in module (`src/lib/signed-in.ts`) at a fixed address,
 * `/signed-in.js`, because the one thing that loads it is an inline script
 * (`lib/signed-in-check.ts`), which Vite never sees and so cannot hand a
 * hashed name. Emitted as its own entry, so nothing on a public page imports
 * it; its imports keep their hashed `/_astro/` names. Outside `/_astro/`, so
 * Vercel revalidates it instead of caching it for a year.
 * @type {import('vite').Plugin}
 */
const signedInEntry = {
  name: 'signed-in-entry',
  apply: 'build',
  applyToEnvironment: (environment) => environment.name === 'client',
  buildStart() {
    this.emitFile({ type: 'chunk', id: fileURLToPath(new URL('./src/lib/signed-in.ts', import.meta.url)), fileName: 'signed-in.js' });
  },
};

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
   * On demand under /me only (VET-274); every other page stays prerendered.
   * `build.client: './'` keeps the prerendered site at `dist/` exactly where
   * it was before the adapter, which `validate:schema`, the leak scan and the
   * verify-site skill all read. `src/lib/assets.ts` reads `public/` and
   * `src/data/link-previews.json` at import time; the adapter's file tracing
   * ships both with the /me function. The adapter has no preview server, so
   * `astro preview` no longer runs; serve `dist/` statically instead
   * (`.claude/skills/verify-site/SKILL.md`), or use `astro dev` for /me.
   */
  adapter: vercel(),
  build: { client: './' },

  /**
   * No Shiki. It paints every fenced block in an inline `github-dark` style
   * that no stylesheet can theme, so a code block in a note was a black slab
   * on the light page. `styles/prose.css › .prose pre` draws it in the site's
   * own surface and ink in both themes instead, monochrome like the rest.
   */
  markdown: { syntaxHighlight: false },

  /**
   * Opt-in only: a link prefetches when it carries `data-astro-prefetch`,
   * which the index rows do (`hover`), so the page a pointer rests on is
   * cached before the click. Nothing else on the site prefetches.
   */
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },

  vite: { plugins: [clerkConfig, signedInEntry] },

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
        !page.endsWith('/robots.txt') && !page.endsWith('/llms.txt') && !new URL(page).pathname.startsWith('/me/'),
    }),
    meFixture,
  ],
});
