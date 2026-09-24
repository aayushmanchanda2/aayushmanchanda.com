/**
 * private.ts — a private library row (VET-274) as the site renders it.
 *
 * The rows live in Convex, never in this repo. Each one is a library entry in
 * the `library.json` shape plus what only the private copy keeps (the
 * Raindrop note and highlights, his Telegram note, why he saved it, the sweep
 * note, the Raindrop id and bucket), and it goes through `parseLibrary`, the
 * same parser the public build runs, so a private page renders exactly what a
 * public one would. Media paths come back from
 * Convex as file-storage URLs and are swapped in after the parse, because the
 * parser (rightly) refuses any picture that is not a committed path.
 */
import { isOwner } from "../../convex/owner.ts";
import { formatDay, formatMonth } from "./date.ts";
import type { Kind, LibraryEntry } from "./library.ts";
import { entryHref, library, parseLibrary, rowSummary } from "./library.ts";
import { clipText } from "./post.ts";
import { tagLabel } from "./tags.ts";

export { isOwner };

/** A row as `convex/entries.ts` returns it. */
export type PrivateRow = Record<string, unknown> & {
  slug: string;
  raindrop_note: string | null;
  sweep_note: string | null;
  why_saved?: string | null;
  telegram_note?: string | null;
  raindrop_highlights?: unknown[];
};

export interface RaindropHighlight {
  text: string;
  note: string | null;
}

/** A private entry's own parts, which `EntryDetail.astro` splits by who wrote them; every part may be empty. */
export interface Why {
  mine: string | null;
  /** What he wrote Hermes on Telegram with the link, verbatim. */
  telegram: string | null;
  filed: string | null;
  why: string | null;
  sweep: string | null;
  highlights: RaindropHighlight[];
}

const words = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

/**
 * His Raindrop note without Hermes's bookkeeping: every line that starts
 * `sweep-hold:` is the sweep's, not his. The rest stays verbatim; null when
 * nothing of his is left. The import stores this, and the card reads through
 * it again, so a row the cron adds is clean too.
 */
export const ownNote = (value: unknown): string | null =>
  typeof value === "string" ? words(value.split("\n").filter((line) => !line.trimStart().startsWith("sweep-hold:")).join("\n")) : null;

/**
 * Raindrop's highlights as `{ text, note }`, whatever else the API put on them.
 * Convex refuses a field named `_id`, which Raindrop's highlights carry, so the
 * import stores this shape and nothing more. Anything without text is dropped.
 */
export function raindropHighlights(value: unknown): RaindropHighlight[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const raw = typeof item === "string" ? { text: item } : (item as Record<string, unknown> | null);
    const text = words(raw?.["text"]);
    return text ? [{ text, note: words(raw?.["note"]) }] : [];
  });
}

/** The card's parts, straight off the row: his words verbatim, nothing trimmed or joined. */
export const whyOf = (row: PrivateRow): Why => ({
  mine: ownNote(row.raindrop_note),
  telegram: words(row.telegram_note),
  filed: words(row["note"]),
  why: words(row.why_saved),
  sweep: words(row.sweep_note),
  highlights: raindropHighlights(row.raindrop_highlights),
});

/** One row of `private-blocks.json`, drafted beside the archive. */
export interface BlockRow {
  slug: string;
  why_saved?: string | null;
  also_saved?: boolean;
  block?: unknown;
}

/**
 * The archive with `private-blocks.json` merged in by slug: the block and
 * `also_saved` go on the entry, where `parseLibrary` checks them, and
 * `why_saved` beside it. Returns the slugs that matched nothing, so a typo is
 * reported rather than dropped.
 */
export function mergeBlocks<T extends { entry: Record<string, unknown> }>(
  archive: T[],
  blocks: BlockRow[],
): { rows: (T & { why_saved?: string | null })[]; unmatched: string[] } {
  const bySlug = new Map(blocks.map((row) => [row.slug, row]));
  const rows = archive.map((item) => {
    const extra = bySlug.get(String(item.entry["slug"]));
    if (extra === undefined) return item;
    bySlug.delete(extra.slug);
    return {
      ...item,
      why_saved: extra.why_saved ?? null,
      entry: { ...item.entry, block: extra.block ?? null, also_saved: extra.also_saved ?? false },
    };
  });
  return { rows, unmatched: [...bySlug.keys()] };
}

export const privateHref = (slug: string): string => `/me/library/${slug}`;

/**
 * The entry half of a row, in the shape `parseLibrary` reads.
 *
 * ponytail: two archived videos lost their poster with the public copy, and a
 * video with nothing to play is refused; they read as articles here. Restore
 * the `video` object on the row and they are videos again.
 */
export function libraryJson(row: Record<string, unknown>): Record<string, unknown> {
  const {
    raindrop_id: _id,
    bucket: _bucket,
    raindrop_note: _note,
    sweep_note: _sweep,
    why_saved: _why,
    telegram_note: _telegram,
    raindrop_highlights: _highlights,
    ...entry
  } = row;
  return entry["kind"] === "video" && entry["video"] == null ? { ...entry, kind: "article" } : entry;
}

/** Every string that is a key of `media` becomes its value, however deep. */
export function swapMedia<T>(value: T, media: Record<string, string>): T {
  if (typeof value === "string") return (media[value] ?? value) as T;
  if (Array.isArray(value)) return value.map((item) => swapMedia(item, media)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, swapMedia(item, media)])) as T;
  }
  return value;
}

/** A row, parsed as a library entry, with its media pointed at file storage. Throws on a bad row. */
export function toEntry(row: Record<string, unknown>, media: Record<string, string> = {}): LibraryEntry {
  const [entry] = parseLibrary([libraryJson(row)]);
  if (entry === undefined) throw new Error("private.ts: parseLibrary returned nothing");
  return swapMedia(entry, media);
}

/** The rows that parse, newest save first. A bad row is logged by slug and left out of the list. */
export function toEntries(rows: PrivateRow[]): LibraryEntry[] {
  return rows
    .flatMap((row) => {
      try {
        return [toEntry(row)];
      } catch (error) {
        console.error(`private row ${row.slug}: ${error instanceof Error ? error.message : String(error)}`);
        return [];
      }
    })
    .sort((a, b) => b.saved_date.localeCompare(a.saved_date));
}

/**
 * A private row as the signed-in module draws it on a public page
 * (`lib/pane-merge.ts`, VET-276): what `LibraryPane.astro` renders for it,
 * worked out here so the browser needs no library code.
 */
export interface PaneRow {
  slug: string;
  href: string;
  title: string;
  domain: string;
  kind: Kind;
  date: string;
  /** "Sep 22, 2026", for an "Also saved" row. */
  day: string;
  /** Its month header, "September 2026". */
  month: string;
  tags: { slug: string; label: string }[];
  also: boolean;
  /** The line under the title, cut at 110 like the pane's; a block's tip when it has one. */
  summary: string | null;
  tip: boolean;
  /**
   * The public row it sits above (its href), or null for the end of its group,
   * in the order the pane on /me sorts them: newest first, public before
   * private on the same day, "Also saved" after the main feed.
   */
  before: string | null;
  /** The TLDR, the note and the tip, for the command palette. */
  lead: string;
}

export function paneRows(rows: LibraryEntry[], pub: LibraryEntry[] = library): PaneRow[] {
  const own = new Set(rows);
  const merged = [...pub, ...rows].sort((a, b) => b.saved_date.localeCompare(a.saved_date));
  return rows.map((entry) => {
    const also = Boolean(entry.also_saved);
    const next = merged.slice(merged.indexOf(entry) + 1).find((other) => !own.has(other) && Boolean(other.also_saved) === also);
    const summary = also ? null : (entry.block?.tip ?? rowSummary(entry));
    return {
      slug: entry.slug,
      href: privateHref(entry.slug),
      title: entry.title,
      domain: entry.domain,
      kind: entry.kind,
      date: entry.saved_date,
      day: formatDay(entry.saved_date),
      month: formatMonth(entry.saved_date),
      tags: entry.tags.map((slug) => ({ slug, label: tagLabel(slug) })),
      also,
      summary: summary ? clipText(summary, 110) : null,
      tip: Boolean(entry.block),
      before: next ? entryHref(next) : null,
      lead: [entry.tldr, entry.note, entry.block?.tip].filter(Boolean).join(" "),
    };
  });
}
