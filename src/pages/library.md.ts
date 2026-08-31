/**
 * /library.md — the saved links as a table, for an agent that asked for markdown.
 *
 * This is the one variant whose HTML page has nothing an agent cannot have. The
 * other four either hide something behind a picture (/sites) or spread one list
 * across several routes (/tools); /library is a table on both sides, so the two
 * renderings are close to the same document.
 *
 * The thing worth saying out loud here is which slugs are URLs: an agent that
 * has learned the shape of this site will look for `/library/<slug>` the way
 * it found `/tools/<slug>`, and only the digested entries have one. So the
 * digest section carries each page's URL and the closing section states the
 * rule, rather than letting an agent find the other rows out with a 404.
 *
 * Rows come from `lib/library.ts` in the order that boundary already sorted
 * them, newest save first.
 */
import type { APIRoute } from "astro";

import {
  PAGES,
  digestSection,
  link,
  list,
  markdownDocument,
  section,
  table,
  newest,
} from "../lib/markdown";
import type { Kind } from "../lib/library";
import {
  KINDS,
  digested,
  kindGroups,
  library,
  libraryDomains,
  libraryTags,
} from "../lib/library";
import { absolute } from "../lib/site";

/**
 * What the three words mean. Keyed by `Kind`, so a fourth kind fails the build
 * here rather than shipping an unexplained column value.
 */
const MEANING: Record<Kind, string> = {
  article: "A piece of writing on someone's own site or newsletter.",
  post: "A short thing published on a social timeline.",
  video: "A talk, an interview, or a recorded workshop.",
};

export const GET: APIRoute = () => {
  // Tags as the slugs rather than as the words the chips read, because a slug
  // is what `/library/tag/<slug>` is built from and an agent reading this table
  // is being handed the route, not the prose.
  const rows = library.map((entry) => [
    link(entry.title, entry.url),
    entry.tags.join(", "),
    entry.domain,
    entry.kind,
    entry.saved_date,
    entry.note ?? "",
  ]);

  // Null when nothing has been digested yet, and the document simply has no
  // such section — the markdown twin of the honest-absence rule the HTML
  // routes follow.
  const digests = digestSection(digested);

  return markdownDocument({
    page: PAGES.library,
    title: "Library",
    description:
      "Articles, posts and videos Aayush Manchanda saved to read or watch properly, with the date he saved each one.",
    // A digest is the newest thing that can happen to this page, so its date
    // counts alongside the saves.
    updated: newest([
      ...library.map((entry) => entry.saved_date),
      ...digested.map((entry) => entry.digest.digested),
    ]),
    blocks: [
      table(["Title", "Tags", "Domain", "Kind", "Saved", "Note"], rows),
      section(
        "Kinds",
        list(KINDS.map((kind) => `\`${kind}\`: ${MEANING[kind]}`)),
        "A saved link is not a finished one, and neither is a recommendation. The date is the day it was saved and nothing more.",
      ),
      section(
        "Filtered views",
        "By kind:",
        list(
          kindGroups.map(
            (group) =>
              `${group.kind} (${group.entries.length}): ${absolute(`/library/kind/${group.kind}`)}`,
          ),
        ),
        "By domain:",
        list(
          libraryDomains.map(
            (group) =>
              `${group.domain} (${group.entries.length}): ${absolute(`/library/domain/${group.slug}`)}`,
          ),
        ),
        "By tag:",
        list(
          libraryTags.map(
            (group) =>
              `${group.slug} (${group.entries.length}): ${absolute(`/library/tag/${group.slug}`)}`,
          ),
        ),
      ),
      ...(digests === null ? [] : [digests]),
      section(
        "Pages per entry",
        // The pointer at the digest section only exists while that section
        // does; with nothing digested, the rule is stated without a reference
        // to a heading that is not there.
        digests === null
          ? "A library entry gets a page of its own at /library/<slug> only once it has been digested, and nothing has been yet. No entry has a page: nothing at its slug, no stub. The table above already holds everything the site knows about a row. Follow the title's URL to reach the source."
          : "A library entry gets a page of its own only once it has been digested: those pages are listed in the Digests section above, at /library/<slug>. Every other entry has no page, nothing at its slug, no stub. The table above already holds everything the site knows about it. Follow the title's URL to reach the source.",
      ),
    ],
  });
};
