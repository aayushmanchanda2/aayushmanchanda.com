/**
 * The canonical origin, in one place.
 *
 * Everything that needs an absolute URL reads it from here: `astro.config.mjs`
 * (which feeds `Astro.site`, the sitemap, and the canonical link in the head),
 * the markdown variants under `src/pages/*.md.ts`, `/llms.txt`, `/robots.txt`,
 * and the JSON-LD on the home page.
 *
 * ---------------------------------------------------------------------------
 * DNS CUTOVER: when aayushmanchanda.com points at this deployment, change the
 * one line below and nothing else. Every absolute URL on the site is derived
 * from it, including the ones inside /llms.txt and /robots.txt, which are
 * generated rather than kept as static files for exactly this reason.
 * ---------------------------------------------------------------------------
 */
export const SITE_URL = "https://aayushmanchandacom.vercel.app";

/**
 * Absolute URL for a site-relative path.
 *
 * `new URL` rather than string concatenation so a missing or doubled slash
 * cannot mint a broken link in the sitemap or the markdown variants.
 */
export function absolute(path: string): string {
  return new URL(path, SITE_URL).href;
}
