/**
 * /library.md — the saved links as a table, for an agent that asked for markdown.
 *
 * This is the one variant whose HTML page has nothing an agent cannot have. The
 * other four either hide something behind a picture (/sites) or spread one list
 * across several routes (/tools); /library is a table on both sides, so the two
 * renderings are close to the same document.
 *
 * The thing worth saying out loud here used to be which slugs are URLs, because
 * only digested entries had a page and an agent that had learned the shape of
 * this site would look for `/library/<slug>` the way it found `/tools/<slug>`
 * and get a 404. Every entry has one now, so the table names both: `Title`
 * links the page and `Source` is the thing itself, which is the same pair of
 * offers the HTML row makes and in the same order.
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
    link(entry.title, absolute(`/library/${entry.slug}`)),
    entry.url,
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
      table(["Title", "Source", "Tags", "Domain", "Kind", "Saved", "Note"], rows),
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
        // The rule reversed with VET-63 and this is where an agent finds out.
        // The second sentence exists because the shape of a page is no longer
        // one thing: an article nobody has read yet is a catalogue card, and a
        // post carries the whole post.
        `Every entry has a page of its own at /library/<slug>, and the Title column above links it. A page holds the kind, the host, the tags, the saved date and the note in the table, plus whatever else that entry carries: a saved post's full text, a saved video's poster, a digest where one has been written, and a draft where the pipeline has written one and Aayush has not read the piece yet. A drafted block is labelled as a draft on the page and is not his verdict. ${
          digests === null
            ? "Nothing has been digested yet."
            : "The digested entries are listed in the Digests section above."
        } The Source column is the thing itself, which is off this site.`,
      ),
    ],
  });
};
