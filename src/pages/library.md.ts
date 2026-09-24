/**
 * /library.md — the saved links as a table, for an agent that asked for markdown.
 *
 * The HTML /library is a notes-style view since VET-258: a list pane beside a
 * main area whose layout follows the kind (latest saves, an article reader, a
 * post grid, a video grid). An agent needs none of that layout, only the rows,
 * so this is every entry as one table with the TLDR each row shows.
 *
 * The thing worth saying out loud here used to be which slugs are URLs, because
 * only digested entries had a page and an agent that had learned the shape of
 * this site would look for `/library/<slug>` the way it found `/tools/<slug>`
 * and get a 404. Every entry has one now, so the table names both: `Title`
 * links the page and `Source` is the thing itself.
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
  quote,
} from "../lib/markdown";
import type { Kind, LibraryEntry } from "../lib/library";
import {
  KINDS,
  alsoSaved,
  digested,
  kindGroups,
  library,
  libraryDomains,
  libraryTags,
} from "../lib/library";
import { clock, watchAt } from "../lib/reader.mjs";
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

/** An entry's block as plain markdown (VET-273), under its title. */
function blockMarkdown(entry: LibraryEntry & { block: NonNullable<LibraryEntry["block"]> }): string {
  const { block } = entry;
  const time = block.time && `${block.time.text}${block.time.source === "estimate" ? " (estimate)" : ""}`;
  return [
    `### ${entry.title}`,
    list([
      `Best for: ${block.best_for}`,
      `The tip: ${block.tip}`,
      ...(time ? [`Time it takes: ${time}`] : []),
      ...(block.needs.length > 0 ? [`What you need: ${block.needs.join(", ")}`] : []),
    ]),
    ...(block.prompt
      ? [`The prompt${block.prompt.ours ? " (our prompt, not the source's words)" : ""}:`, "```text\n" + block.prompt.text + "\n```"]
      : []),
    "Start here:",
    block.start_here.map((step, index) => `${index + 1}. ${step}`).join("\n"),
    `Page: ${absolute(`/library/${entry.slug}`)}`,
  ].join("\n\n");
}

export const GET: APIRoute = () => {
  // Tags as the slugs rather than as the words the chips read, because a slug
  // is what `/library?tags=<slug>` filters by and an agent reading this table
  // is being handed the route, not the prose.
  const rows = library.map((entry) => [
    link(entry.title, absolute(`/library/${entry.slug}`)),
    entry.url,
    entry.tags.join(", "),
    entry.domain,
    entry.kind,
    entry.saved_date,
    entry.tldr ?? "",
    entry.note ?? "",
  ]);

  // Null when nothing has been digested yet, and the document simply has no
  // such section — the markdown twin of the honest-absence rule the HTML
  // routes follow.
  const digests = digestSection(digested);
  const blocked = library.filter((entry): entry is LibraryEntry & { block: NonNullable<LibraryEntry["block"]> } => entry.block !== null);
  const highlighted = library.filter((entry) => entry.highlights.length + entry.moments.length > 0);

  return markdownDocument({
    page: PAGES.library,
    title: "Library",
    description:
      "Articles, posts and videos Aayush Manchanda saved to read or watch, with the date he saved each one.",
    // A digest is the newest thing that can happen to this page, so its date
    // counts alongside the saves.
    updated: newest([
      ...library.map((entry) => entry.saved_date),
      ...digested.map((entry) => entry.digest.digested),
    ]),
    blocks: [
      table(["Title", "Source", "Tags", "Domain", "Kind", "Saved", "TLDR", "Note"], rows),
      section(
        "Kinds",
        list(KINDS.map((kind) => `\`${kind}\`: ${MEANING[kind]}`)),
        "The date is the day the link was saved.",
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
              `${group.slug} (${group.entries.length}): ${absolute(`/library?tags=${group.slug}`)}`,
          ),
        ),
      ),
      ...(digests === null ? [] : [digests]),
      ...(blocked.length === 0
        ? []
        : [
            section(
              "Blocks",
              "The short version of an entry: who it's for, the tip, the time it takes, what you need, a prompt to copy and where to start. A prompt marked as ours was written for this site, not quoted.",
              ...blocked.map(blockMarkdown),
            ),
          ]),
      ...(alsoSaved.length === 0
        ? []
        : [
            section(
              "Also saved",
              "Kept but not featured: each still has its page and is in the table above.",
              list(alsoSaved.map((entry) => `${link(entry.title, absolute(`/library/${entry.slug}`))} (${entry.domain}, ${entry.saved_date})`)),
            ),
          ]),
      section(
        "Highlights",
        "Passages quoted from the source, never the whole piece. Videos list their moments, each linked to the second it starts.",
        ...highlighted.map((entry) =>
          [
            `### ${entry.title}`,
            ...(entry.tldr ? [`TLDR: ${entry.tldr}`] : []),
            ...entry.highlights.map((highlight) => quote(highlight.text)),
            ...entry.moments.map((moment) => quote(`${link(clock(moment.t), watchAt(moment.video, moment.t))} ${moment.text}`)),
            `Page: ${absolute(`/library/${entry.slug}`)}`,
          ].join("\n\n"),
        ),
      ),
      section(
        "Pages per entry",
        // The rule reversed with VET-63 and this is where an agent finds out.
        // The second sentence exists because the shape of a page is no longer
        // one thing: an article nobody has read yet is a catalogue card, and a
        // post carries the whole post.
        `Every entry has a page at /library/<slug>, linked from the Title column. It holds the kind, host, tags, saved date and note, plus a one-sentence TLDR of the source, up to five passages quoted from it and its opening lines, a saved post's full text, a saved video's poster, a digest where one exists, and a draft where the pipeline wrote one and Aayush hasn't read the piece yet. A draft is labelled as one and isn't his verdict. ${
          digests === null
            ? "Nothing has been digested yet."
            : "Digested entries are listed under Digests above."
        } The Source column is the original, off this site.`,
      ),
    ],
  });
};
