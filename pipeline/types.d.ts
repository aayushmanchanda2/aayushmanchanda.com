/**
 * Shared shapes for the publish pipeline.
 *
 * The pipeline is plain `.mjs`, so this file is the one place the domain model
 * is written down as types. The modules pull it in through JSDoc
 * (`import("./types.js")` — TypeScript resolves that to this declaration file),
 * which keeps the runtime dependency-free while the editor still knows what a
 * state row is.
 *
 * `ItemState` is a discriminated union on purpose. A row is never "published
 * with an attempt count" or "failed with a slug"; each kind carries exactly the
 * fields that kind can justify, and every branch on `kind` ends in a `never`
 * arm so a fourth kind cannot be added silently.
 */

/** Which gallery a bookmark belongs to. Decided by the Raindrop collection. */
export type Section = "tools" | "sites" | "reading";

/** What a /library entry points at, derived from its host. */
export type ReadingKind = "article" | "post" | "video";

/**
 * Where a published shot came from, when it was not the runner's own browser.
 *
 * Absent is the ordinary case and the only other value is `"firecrawl"`, so this
 * is a note about one exception rather than a general provenance field. It lives
 * in `pipeline/state.json` and never in `src/data/`: which service took the
 * picture is operational trivia, and a reader looking at /sites is owed the
 * screenshot, not the story of how many tries it took.
 */
export type CaptureVia = "firecrawl";

export type ItemState =
  | { kind: "published"; slug: string; section: Section; at: string; via?: CaptureVia }
  | { kind: "failed"; attempts: number; lastError: string; at: string }
  | { kind: "pending"; attempts: number; lastError?: string };

/** `pipeline/state.json` — Raindrop bookmark id to what we know about it. */
export type StateMap = Record<string, ItemState>;

/**
 * A Raindrop API item, parsed at the fetch boundary. Nothing downstream of
 * `raindrop.mjs` ever touches the raw API JSON.
 */
export interface Bookmark {
  /** Raindrop `_id`, stringified: it is a JSON object key from here on. */
  id: string;
  url: string;
  /** May be empty; the slug falls back to the domain when it is. */
  title: string;
  /** May be empty. Becomes the /tools note when present. */
  excerpt: string;
  /**
   * Raindrop's PRIVATE note field, distinct from `excerpt` above.
   *
   * The two are not interchangeable and the difference is why this field exists.
   * `excerpt` is the description Raindrop shows in its own list and scrapes off
   * the page when nobody types one, so it is public-ish and often not a
   * sentence anyone wrote. The note is the field only the account holder sees,
   * which makes it the one place a sweep can leave structured JSON for the
   * pipeline without putting machine output where a human is reading.
   *
   * May be empty, and empty is the ordinary case.
   */
  note: string;
  /** Raindrop's own domain field. Advisory only — entries recompute it. */
  domain: string;
  collection: Section;
  /** Existing tags, so a tag write can merge rather than overwrite. */
  tags: string[];
}

export interface Collection {
  id: number;
  title: string;
  /** null for a root collection. */
  parentId: number | null;
}

/**
 * An x.com post, as read back out of Firecrawl's markdown.
 *
 * Everything a post card can render, and nothing else. The engagement counts
 * Firecrawl also hands back are still dropped on the floor: a like count is a
 * number that is wrong by the time it is committed, and this file is a git
 * repository rather than a live view.
 *
 * All five fields or none. `parsePost` returns null rather than a partial one,
 * because the caller's fallback — publish the row with Raindrop's own title —
 * is a good answer, and a card missing its author or its date is not.
 */
export interface Post {
  /** Display name, as the poster spells it. The handle when they have none. */
  author: string;
  /** The @handle, without the @. */
  handle: string;
  /** ISO calendar date (YYYY-MM-DD) the post was posted, in UTC. */
  date: string;
  /** The post's own words, decoration stripped and collapsed to one line. */
  text: string;
  /**
   * The photos attached to the post, as REMOTE `pbs.twimg.com` URLs, in order.
   *
   * Not the same field `library.ts › Post.media` holds, and deliberately so.
   * This is what the document said; that is what the repo committed. The write
   * side fetches each of these and swaps in a `/shots` path, which is the same
   * split `Video` makes about its thumbnail — a boundary reports, a writer
   * decides what ends up on disk.
   *
   * Empty for a post whose attachment is a video: the clip arrives as a `t.co`
   * shortlink with no frame behind it.
   */
  media: string[];
}

/**
 * A video's provider and id, read out of the saved URL.
 *
 * No thumbnail here. This is what a URL can tell us, and the thumbnail is a
 * file that has to be fetched, re-encoded and written before an entry can name
 * it — so it belongs to the write, and it is `pipeline/thumb.mjs`'s answer.
 */
export interface Video {
  provider: "youtube";
  id: string;
}

/**
 * A drafted opinion, as it arrives from Hermes in the bookmark's private note.
 *
 * `bullets` and `why` are each optional and at least one is required, the same
 * rule `library.ts › readDraft` holds the committed shape to. `drafted` is the
 * day it was written when the sweep said so, and the run date when it did not.
 */
export interface Draft {
  bullets: string[] | null;
  why: string | null;
  drafted: string;
}

/**
 * One edit to one published /library entry, as `pipeline/patch.mjs` takes it.
 *
 * Everything but the selector is optional and absent means "leave it alone",
 * which is the difference between this and the entry shape: a patch says what
 * changes, so there is no way to spell "and blank everything I did not
 * mention". `null` on a field is how you clear one.
 */
export interface Patch {
  /** The entry to edit, by URL or by slug. Exactly one of the two. */
  url?: string;
  slug?: string;
  tags?: string[] | null;
  note?: string | null;
  why?: string | null;
  /**
   * Looser than `Draft` in the two places a caller is allowed to be. Each of
   * `bullets` and `why` may be left out, and at least one has to be there — a
   * rule no type can carry, so `patch.mjs` enforces it and says so when it does.
   */
  draft?: { bullets?: string[] | null; why?: string | null; drafted: string } | null;
  digest?: {
    bullets: string[];
    verdict: string;
    why: string;
    digested: string;
  } | null;
}

/** What `plan()` decided to do about one bookmark. */
export type PlannedItem =
  | { kind: "capture"; bookmark: Bookmark; attempts: number }
  | { kind: "adopt"; bookmark: Bookmark; slug: string }
  | { kind: "reject"; bookmark: Bookmark; reason: string }
  | { kind: "dead-letter"; bookmark: Bookmark; attempts: number; lastError: string };

/** Every path the pipeline reads or writes, resolved once from the repo root. */
export interface Paths {
  root: string;
  statePath: string;
  sitesJson: string;
  toolsJson: string;
  libraryJson: string;
  shotsDir: string;
  tmpDir: string;
}

/** The last stdout line, and what the CI step summary parses. */
export interface Summary {
  published: number;
  failed: number;
  skipped: number;
  pending: number;
}

export interface ReconcileReport {
  state: StateMap;
  /** Ids whose `published` row lost its JSON entry and went back to pending. */
  downgraded: string[];
  /** Shot filenames deleted because no entry pointed at them. */
  orphans: string[];
}
