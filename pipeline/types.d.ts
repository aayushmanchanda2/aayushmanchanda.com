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
 * Only the two fields a /library row can use. Firecrawl's post-processed
 * document also carries a display name, a posted date and an engagement count,
 * and none of them is written anywhere: the row's date is the day it was saved
 * by contract, and a like count is a number that is wrong by the time it is
 * committed.
 */
export interface Post {
  /** The @handle, without the @. */
  handle: string;
  /** The post's own words, decoration stripped and collapsed to one line. */
  text: string;
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
