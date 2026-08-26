/**
 * The canonical origin, in one place.
 *
 * Everything that needs an absolute URL reads it from here: `astro.config.mjs`
 * (which feeds `Astro.site`, the sitemap, and the canonical link in the head),
 * the markdown variants under `src/pages/*.md.ts`, `/llms.txt`, `/robots.txt`,
 * and the JSON-LD on the home page.
 *
 * ---------------------------------------------------------------------------
 * DNS CUTOVER: done. The apex resolves to this deployment and the line below
 * is the apex, so every canonical, og:url, sitemap <loc>, robots Sitemap line
 * and llms.txt link now advertises it. `aayushmanchandacom.vercel.app` still
 * serves the same build, but nothing on the site points at it any more.
 *
 * If the origin ever moves again, this one line is still the whole change:
 * /llms.txt and /robots.txt are generated rather than kept as static files for
 * exactly that reason.
 * ---------------------------------------------------------------------------
 */
export const SITE_URL = "https://aayushmanchanda.com";

/**
 * Absolute URL for a site-relative path.
 *
 * `new URL` rather than string concatenation so a missing or doubled slash
 * cannot mint a broken link in the sitemap or the markdown variants.
 */
export function absolute(path: string): string {
  return new URL(path, SITE_URL).href;
}
