/**
 * readme-site.mjs — the project's own site as its README names it, strictly.
 *
 * A repository's `homepage` field is the first answer (`icon.mjs › siteOf`);
 * this is the fallback, and a wrong answer here is persisted to `tools.json`
 * `url` on a new save. So a link counts only when one of these holds:
 *
 *   (a) its text, or the label right before it ("Docs: …"), is a site word
 *   (b) it is a badge whose alt text is a site word
 *   (c) it is the root of a host named after the repo or its owner (`repo.dev`,
 *       `owner.com`, `repo.owner.io`, or `owner.github.io/repo`)
 *
 * and never when it sits in a sponsor/support section or on a credit line
 * ("powered by", "built by"), or points at GitHub, another owner's github.io, a package registry, a
 * social network, a badge or an image. (a) beats (b) beats (c); within a rule,
 * the first in the file wins.
 */

import { bareHost, squash } from "./util.mjs";

const SITE_WORD = /\b(website|homepage|home|docs|documentation|demo|site)\b/i;
const LABEL_BESIDE = /\b(website|homepage|home|docs|documentation|demo|site)\b[\s*_:：|—–-]*$/i;
const SPONSOR_HEADING = /sponsor|support|donat|backer|funding|powered by|thank|acknowledg|credit/i;
/** Credit lines: "powered by", and "built by <company>", which names the maker, not the product. */
const SPONSOR_LINE = /\b(powered|sponsored|built|made|created|maintained|backed) by\b|\bsponsors?\b/i;

/** Never the project's own site: GitHub, registries, social, badges, image hosts. */
export const NOT_A_SITE = new RegExp(
  "(^|\\.)(" +
    [
      "github\\.com", "githubusercontent\\.com", "githubassets\\.com",
      "npmjs\\.com", "npmjs\\.org", "pypi\\.org", "crates\\.io", "rubygems\\.org", "pkg\\.go\\.dev",
      "packagist\\.org", "nuget\\.org", "hub\\.docker\\.com", "marketplace\\.visualstudio\\.com",
      "skills\\.sh", "chromewebstore\\.google\\.com", "addons\\.mozilla\\.org", "microsoftedge\\.microsoft\\.com",
      "x\\.com", "twitter\\.com", "linkedin\\.com", "youtube\\.com", "youtu\\.be", "discord\\.gg", "discord\\.com",
      "reddit\\.com", "t\\.me", "facebook\\.com", "instagram\\.com", "bsky\\.app",
      "shields\\.io", "badgen\\.net", "star-history\\.com",
      "imgur\\.com", "jsdelivr\\.net", "cloudinary\\.com",
    ].join("|") +
    ")$",
  "i",
);
const IMAGE_FILE = /\.(png|jpe?g|gif|svg|webp|avif|ico)$/i;

/** @param {string} s */

/**
 * @typedef {{ href: string, text: string, alt: string, before: string }} Link
 */

/** Every http(s) link on one line: markdown, badge, `<a>`, or bare. @param {string} line @returns {Link[]} */
function linksOn(line) {
  /** @type {(Link & { at: number })[]} */
  const found = [];
  const add = (/** @type {number} */ at, /** @type {Partial<Link> & { href: string }} */ link) =>
    found.push({ at, text: "", alt: "", before: line.slice(0, at), ...link });

  for (const m of line.matchAll(/\[!\[([^\]]*)\]\([^)]*\)\]\((https?:\/\/[^)\s]+)\)/g))
    add(m.index, { alt: m[1] ?? "", href: m[2] ?? "" });
  for (const m of line.matchAll(/(?<![!\]])\[([^[\]]*)\]\((https?:\/\/[^)\s]+)\)/g))
    add(m.index, { text: m[1] ?? "", href: m[2] ?? "" });
  for (const m of line.matchAll(/<a\b[^>]*?href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const inner = m[2] ?? "";
    add(m.index, { href: m[1] ?? "", text: inner.replace(/<[^>]+>/g, ""), alt: inner.match(/\balt="([^"]*)"/i)?.[1] ?? "" });
  }
  for (const m of line.matchAll(/(?<![("'=[<])https?:\/\/[^\s)<>"'\]]+/g)) add(m.index, { href: m[0].replace(/[.,;:]+$/, "") });

  return found.sort((a, b) => a.at - b.at);
}

/**
 * @param {string} href @param {string} owner @param {string} repo
 * @returns {{ ok: boolean, named: boolean }}  ok: allowed at all; named: rule (c)
 */
function judgeHost(href, owner, repo) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return { ok: false, named: false };
  }
  const host = bareHost(url);
  if (NOT_A_SITE.test(host) || IMAGE_FILE.test(url.pathname)) return { ok: false, named: false };
  const labels = host.split(".");
  const path = url.pathname.split("/").filter(Boolean);
  if (host.endsWith(".github.io")) {
    const own = squash(labels[0] ?? "") === squash(owner);
    return { ok: own, named: own && (path.length === 0 || squash(path[0] ?? "") === squash(repo)) };
  }
  // A homepage, not a page on it: `owner.com/blog/post-about-repo` is the company blog.
  const names = [squash(owner), squash(repo)].filter((n) => n.length >= 3);
  const named = path.length === 0 && labels.slice(0, -1).some((label) => names.includes(squash(label)));
  return { ok: true, named };
}

/**
 * The site a README names for `owner/repo`, or null.
 *
 * @param {string} markdown @param {string} owner @param {string} repo
 * @returns {string | null}
 */
export function siteInReadme(markdown, owner, repo) {
  /** @type {(string | null)[]} */
  const best = [null, null, null];
  let sponsored = false;

  for (const line of markdown.split("\n")) {
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.*)$/);
    if (heading) sponsored = SPONSOR_HEADING.test(heading[1] ?? "");
    if (sponsored || SPONSOR_LINE.test(line)) continue;

    for (const link of linksOn(line)) {
      const { ok, named } = judgeHost(link.href, owner, repo);
      if (!ok) continue;
      const rule = SITE_WORD.test(link.text) || LABEL_BESIDE.test(link.before) ? 0 : SITE_WORD.test(link.alt) ? 1 : named ? 2 : -1;
      if (rule >= 0 && best[rule] === null) best[rule] = link.href;
    }
  }
  return best.find((href) => href !== null) ?? null;
}
