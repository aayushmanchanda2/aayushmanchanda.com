/**
 * private.ts — a private library row (VET-274) as the site renders it.
 *
 * The rows live in Convex, never in this repo. Each one is a library entry in
 * the `library.json` shape plus what only the private copy keeps (the
 * Raindrop note, the sweep note, the Raindrop id and bucket), and it goes
 * through `parseLibrary`, the same parser the public build runs, so a private
 * page renders exactly what a public one would. Media paths come back from
 * Convex as file-storage URLs and are swapped in after the parse, because the
 * parser (rightly) refuses any picture that is not a committed path.
 */
import { isOwner } from "../../convex/owner.ts";
import type { LibraryEntry } from "./library.ts";
import { parseLibrary } from "./library.ts";

export { isOwner };

/** A row as `convex/entries.ts` returns it. */
export type PrivateRow = Record<string, unknown> & {
  slug: string;
  raindrop_note: string | null;
  sweep_note: string | null;
};

export const privateHref = (slug: string): string => `/me/library/${slug}`;

/**
 * The entry half of a row, in the shape `parseLibrary` reads.
 *
 * ponytail: two archived videos lost their poster with the public copy, and a
 * video with nothing to play is refused; they read as articles here. Restore
 * the `video` object on the row and they are videos again.
 */
export function libraryJson(row: Record<string, unknown>): Record<string, unknown> {
  const { raindrop_id: _id, bucket: _bucket, raindrop_note: _note, sweep_note: _sweep, ...entry } = row;
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
