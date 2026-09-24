/**
 * Synthetic private rows for the dev-only /me fixture (VET-274). Made up
 * whole: nothing here comes from the private archive. The post and the video
 * borrow committed public files (a post's picture, a video's poster) so the
 * parser accepts them; every word is invented.
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
    note: "An invented filed note, one line long.",
    tldr: "An invented piece used to render the private entry page in development.",
    tags: ["fixture", "reading"],
    excerpt: "This paragraph is placeholder text written for the fixture, so the excerpt block has something to show.",
    highlights: [{ text: "A placeholder highlight, quoted from nowhere.", color: "amber" }],
    block: {
      best_for: "Anyone testing this page.",
      tip: "Keep one list, and read from the top.",
      time: { text: "Ten minutes.", source: "estimate" },
      needs: ["A browser"],
      prompt: { text: "Summarise this placeholder in one line.", ours: true },
      start_here: ["Read the tip.", "Open the full article."],
      next_step: "Open the full article and read the first section tonight.",
    },
    raindrop_note: "Placeholder for the note I typed when I saved it.\nA second line, kept as its own line.\nsweep-hold: placeholder bookkeeping the card must not show",
    raindrop_highlights: [{ text: "A placeholder passage I highlighted in Raindrop.", note: "A placeholder note on it." }],
    why_saved: "A placeholder reason this was saved.",
    telegram_note: "A placeholder for what I sent Hermes with the link.",
    sweep_note: null,
  },
  {
    slug: "fixture-private-post",
    title: "An invented post with a picture",
    url: "https://x.com/example/status/2093028643261792292",
    domain: "x.com",
    saved_date: "2026-09-12",
    kind: "post",
    note: "An invented one-liner.",
    tags: ["fixture"],
    post: {
      id: "2093028643261792292",
      author: "Fixture Author",
      handle: "example",
      date: "2026-09-12",
      text: "Placeholder post text for the fixture.\n\nA second paragraph, so the post has some shape.",
      avatar: "/posts/2093028643261792292/avatar.webp",
      media: [{ type: "photo", src: "/posts/2093028643261792292/1.webp", w: 626, h: 276 }],
    },
    raindrop_note: "sweep-hold: placeholder bookkeeping only",
    sweep_note: null,
  },
  {
    slug: "fixture-private-video",
    title: "An invented talk with two moments",
    url: "https://www.youtube.com/watch?v=mR-WAvEPRwE",
    domain: "youtube.com",
    saved_date: "2026-08-02",
    kind: "video",
    note: "An invented note on the talk.",
    tldr: "A placeholder summary of a talk.",
    video: { provider: "youtube", id: "mR-WAvEPRwE", thumb: "/shots/anthropic-agents-that-run-for-hours-thumb.webp" },
    moments: [
      { t: 90, text: "A placeholder moment near the start." },
      { t: 600, text: "A placeholder moment ten minutes in." },
    ],
    raindrop_note: null,
    sweep_note: null,
  },
  {
    slug: "fixture-private-also",
    title: "An invented row kept without a block",
    url: "https://example.org/notes/also",
    domain: "example.org",
    saved_date: "2026-07-30",
    kind: "article",
    note: "An invented one-liner.",
    also_saved: true,
    raindrop_note: null,
    sweep_note: null,
  },
];
