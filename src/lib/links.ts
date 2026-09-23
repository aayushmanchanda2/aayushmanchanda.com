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
 * `linkLabel` lives here too. They used to sit in `lib/tools.ts`
 * because /tools was the first page to need it, which meant /experiments and
 * /notes imported a tools module to render a link that has nothing to do with a
 * tool. It is about URLs, not about verdicts.
 *
 * `githubRepo` and `markFor` arrived for the same reason. A /tools entry now
 * carries two links — the product's own site and the repository it is built in
 * — and the two questions that split are "is this link a repository" and "what
 * do we draw in the square beside the name".
 */

/*
 * `./site.ts` with the extension, the same deviation `lib/schema.ts` makes and
 * for the same reason: Vite resolves an extensionless relative import and Node
 * does not, and `links.test.mjs` loads this module directly under `node --test`.
 * The rule this file now owns — what counts as a GitHub repository URL — is
 * shared with the publish pipeline, so it has to be testable outside a bundler.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { absolute } from "./site.ts";

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

/* ---------------------------------------------------------------------------
   GitHub repositories
   --------------------------------------------------------------------------- */

/** An owner or a repository name, in the characters GitHub actually allows. */
const GITHUB_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * The canonical `https://github.com/{owner}/{name}` for a URL, or null when it
 * is not a repository.
 *
 * This is the one definition of "is that link a repo", and it is here rather
 * than in `lib/tools.ts` for the same reason `linkLabel` is: it is a fact about
 * a URL, not about a verdict. Three callers lean on it — the /tools parser
 * validates `repo` with it, the same parser refuses a repository that was
 * written into `url`, and `links.test.mjs` holds the publish pipeline's
 * separate copy to the shape this one accepts.
 *
 * **A profile, a branch, a file and a release are all rejected.** Only the two
 * segments count: `github.com/block/buzz` is a repository, and
 * `github.com/block`, `github.com/block/buzz/tree/main` and
 * `gist.github.com/...` are not. The `.git` suffix a clone URL carries is
 * dropped, and so is a trailing slash, because both name the same repository
 * as the bare form and an icon and a link label should not depend on which
 * spelling was pasted.
 */
export function githubRepo(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (parsed.hostname.toLowerCase().replace(/^www\./, "") !== "github.com") return null;
  // A query or a fragment on a repository URL is tracking noise, never part of
  // the identity, so a link carrying one is not written back as canonical.
  if (parsed.search !== "" || parsed.hash !== "") return null;

  const segments = parsed.pathname.split("/").filter((segment) => segment !== "");
  if (segments.length !== 2) return null;

  const owner = segments[0] ?? "";
  const name = (segments[1] ?? "").replace(/\.git$/i, "");
  if (!GITHUB_NAME.test(owner) || !GITHUB_NAME.test(name)) return null;

  return `https://github.com/${owner}/${name}`;
}

/** `block`, off `https://github.com/block/buzz`. `""` when it is not a repo. */
export function repoOwner(url: string): string {
  const canonical = githubRepo(url);
  return canonical === null ? "" : (canonical.split("/")[3] ?? "");
}

/* ---------------------------------------------------------------------------
   The app icon beside an entry
   --------------------------------------------------------------------------- */

/**
 * What to draw in the squircle: the tool's own icon, or a letter.
 *
 * `letter` is allowed to be `""` — a name with no letter or digit anywhere in
 * it has no initial to show — and `AppIcon.astro` renders the same empty tile
 * rather than branching a third time.
 */
export type Mark =
  | { kind: "logo"; src: string }
  | { kind: "initial"; letter: string };

/** The first character worth printing, capitalised by `AppIcon.astro` at render time. */
const FIRST_GLYPH = /[\p{L}\p{N}]/u;

/**
 * The mark for one entry: `public/icons/<slug>.webp` when the pipeline fetched
 * one (`pipeline/icon.mjs`), the initial when it did not.
 *
 * The check is a file on disk at build time, so a page never makes a request
 * to anyone but this domain for a mark. That is the claim /privacy makes, and
 * an image host added here means editing that page in the same commit.
 *
 * **There is deliberately no GitHub avatar anywhere in this path.** A
 * repository-only row could show `github.com/{owner}.png`; most owners here are
 * individuals, whose avatar is a stranger's face or a generated identicon,
 * which is not identity. `pipeline/icon.mjs` refuses GitHub image hosts for the
 * same reason, so a repo-only tool has an icon only when its repository names a
 * homepage of its own.
 */
export function markFor(entry: { slug: string; name: string }): Mark {
  if (existsSync(path.join(process.cwd(), "public", "icons", `${entry.slug}.webp`))) {
    return { kind: "logo", src: `/icons/${entry.slug}.webp` };
  }

  const letter = [...entry.name].find((glyph) => FIRST_GLYPH.test(glyph)) ?? "";
  return { kind: "initial", letter };
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
