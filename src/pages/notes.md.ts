/**
 * /notes.md — every note in full, for an agent that asked for markdown.
 *
 * The other four variants summarise a section into a table. This one does not,
 * because a note has no fields worth tabulating: the text is the note. They are
 * short, there are few of them, and an agent that has to fetch each one
 * separately to read three paragraphs has been sent on an errand for nothing.
 *
 * Each body is the raw markdown source, copied byte for byte. That means a note
 * that writes its own headings keeps whatever level it wrote them at, which can
 * sit alongside the `##` used for note titles here. Renumbering them would be
 * editing Aayush's text, and this file does not do that.
 */
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

import { PAGES, markdownDocument } from "../lib/markdown";
import { absolute } from "../lib/site";

/** Dates are stored as dates and shown as `YYYY-MM-DD`, same as every page. */
const day = (date: Date): string => date.toISOString().slice(0, 10);

/** Site paths become absolute; anything else is already a full URL. */
const target = (path: string): string =>
  path.startsWith("/") ? absolute(path) : path;

export const GET: APIRoute = async () => {
  const notes = (await getCollection("notes")).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );

  const blocks = notes.map((note) => {
    const meta = [`date: ${day(note.data.date)}`, `type: ${note.data.type}`];

    // A scratch note is mostly its picture, so a variant that dropped the image
    // would leave an agent reading a caption with nothing above it.
    if (note.data.image !== undefined) {
      meta.push(`image: ${absolute(note.data.image)}`);
    }

    const parts = [
      `## ${note.data.title}`,
      [meta.join(", "), `Page: ${absolute(`/notes/${note.id}`)}`].join("\n"),
    ];

    const body = note.body?.trim() ?? "";
    if (body !== "") parts.push(body);

    const links = note.data.links ?? [];
    if (links.length > 0) {
      parts.push(`See also: ${links.map(target).join(" ")}`);
    }

    return parts.join("\n\n");
  });

  return markdownDocument({
    page: PAGES.notes,
    title: "Notes",
    description:
      "Every note Aayush Manchanda has published, newest first, with the full text of each one.",
    blocks:
      blocks.length === 0
        ? ["No notes yet."]
        : [
            // The bodies are verbatim, so their links are the site paths Aayush
            // wrote. Out here there is no page for those to resolve against.
            "Note bodies are reproduced as written. A link inside one that starts with a slash is a path on this site, so resolve it against the Source URL above.",
            ...blocks,
          ],
  });
};
