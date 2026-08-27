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

/**
 * Where the newsletter form posts, or `null` while there is no newsletter.
 *
 * This one string is the entire feature switch. Set it to
 *
 *     https://buttondown.com/api/emails/embed-subscribe/{username}
 *
 * with the Buttondown account's username on the end, and the signup block
 * appears under the section index on the home page and the paragraph describing
 * it appears on /privacy. Leave it `null` and neither of them exists in the
 * built HTML: no box, no disabled control, and nothing on /privacy describing a
 * form the page does not have. That is `design.md` §8, "a control that cannot
 * work is not shown", applied to a control with nowhere to post to, and the
 * second half is the same rule pointed at the copy: a privacy page that is wrong
 * about its own build is worth less than no page at all.
 *
 * The URL shape is Buttondown's documented HTML embed endpoint. The form is a
 * plain POST on purpose, not a `fetch`: Buttondown's docs say not to send the
 * request from JavaScript, because the response is sometimes a CAPTCHA or a
 * validation error the subscriber has to see and act on. A form POST navigates
 * to it; `fetch` swallows it. It is also why this needs no client script at all,
 * and works with scripting off.
 *
 * The field names that go with the endpoint live in `lib/newsletter.ts`, which
 * is the only thing that builds the form, so activation stays one line here.
 */
export const NEWSLETTER_ACTION: string | null = null;
