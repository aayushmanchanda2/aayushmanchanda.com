/**
 * Synthetic private rows for the dev-only /me fixture (VET-274). Made up
 * whole: nothing here comes from the private archive.
 */
import type { PrivateRow } from "../lib/private";

export const FIXTURE_ROWS: PrivateRow[] = [
  {
    slug: "fixture-private-article",
    title: "A made-up essay about keeping a reading list honest",
    url: "https://example.com/essays/reading-list",
    domain: "example.com",
    saved_date: "2026-09-20",
    kind: "article",
    note: null,
    tldr: "An invented piece used to render the private entry page in development.",
    tags: ["fixture"],
    excerpt: "This paragraph is placeholder text written for the fixture, so the excerpt block has something to show.",
    highlights: [{ text: "A placeholder highlight, quoted from nowhere." }],
    raindrop_note: "Placeholder for the note I would have typed when I saved it.",
    sweep_note: "Placeholder for the note the sweep would have left.",
  },
  {
    slug: "fixture-private-post",
    title: "A second invented row, so the ring has somewhere to go",
    url: "https://example.org/notes/second",
    domain: "example.org",
    saved_date: "2026-08-02",
    kind: "article",
    note: "An invented one-liner.",
    raindrop_note: null,
    sweep_note: null,
  },
];
