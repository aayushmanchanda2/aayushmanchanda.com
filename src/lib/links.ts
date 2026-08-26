/**
 * One answer to "is this link ours", in one place.
 *
 * Four sections carry links they did not author: an experiment points at what
 * it produced, a note points at what it is about, and both may point off the
 * site entirely. Every one of those surfaces had to answer the same question —
 * is this a path on this site, or is it somewhere else — and each had grown its
 * own answer. Eight of them, across two `.astro` pages, two markdown endpoints,
 * one data boundary and the content schema. Four spellings of the same regex,
 * four `startsWith("/")` checks, two "make it absolute" helpers.
 *
 * They agreed, which is exactly why it was worth collapsing: eight copies that
 * agree today are eight chances to disagree the first time the rule changes.
 * The rule itself is unchanged.
 *
 * `linkLabel` and `faviconUrl` live here too. They used to sit in `lib/tools.ts`
 * because /tools was the first page to need them, which meant /experiments and
 * /notes imported a tools module to render a link that has nothing to do with a
 * tool. They are about URLs, not about verdicts.
 */

import { absolute } from "./site";

/**
 * A link into this site: absolute path, lowercase, no scheme and no host.
 *
 * A bare `tools` would resolve against whatever page happens to be rendering
 * it, so the leading slash is required rather than guessed at.
 */
export const INTERNAL_PATH = /^\/[a-z0-9][a-z0-9\-/]*$/;

/** An http(s) URL — the only other shape a link is allowed to take. */
export const EXTERNAL_URL = /^https?:\/\/\S+$/;

/**
 * Site path or not.
 *
 * The leading slash alone, deliberately: shape validation happened at the data
 * boundary, and by the time a page is rendering a link the only question left
 * is which of the two kinds it is.
 */
export function isInternal(link: string): boolean {
  return link.startsWith("/");
}

/**
 * The form a link takes outside an HTML page — in a markdown variant, say,
 * where there is no current document for a path to resolve against.
 *
 * A site path becomes absolute; anything else is already a full URL.
 */
export function absolutize(link: string): string {
  return isInternal(link) ? absolute(link) : link;
}

/** `github.com/block/buzz` — the link without the protocol noise. */
export function linkLabel(url: string): string {
  const parsed = new URL(url);
  const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  return `${parsed.hostname.replace(/^www\./, "")}${path}${parsed.search}`;
}

/**
 * logo.dev logo service. The only third-party host the site touches, and
 * /privacy names it as exactly that — changing this host requires changing
 * that page in the same commit, or the privacy page lies about which third
 * party sees a reader's IP.
 *
 * No `onerror` fallback: logo.dev answers every request with an image and
 * falls back to a generated monogram for a domain it does not know (verified
 * against a nonsense domain). The `pk_` half of a logo.dev key pair is meant
 * to ship in public HTML, so it belongs here rather than in an env var that
 * would buy no secrecy.
 */
export function faviconUrl(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return `https://img.logo.dev/${encodeURIComponent(host)}?token=pk_YsFOVGNeRx6b1C0u0e0yTw&size=64&format=webp`;
}

/**
 * A pathname in the one spelling the nav compares against.
 *
 * Astro builds directory-format routes, so the current page arrives as
 * `/tools/` while the nav holds `/tools`, and `/` must keep its slash. Both nav
 * surfaces and the layout have to agree about that or a page highlights itself
 * in one of them and not the other.
 */
export function normalize(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}
