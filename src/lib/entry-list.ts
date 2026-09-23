import type { CollectionEntry } from "astro:content";

/** One row of `components/EntryList.astro`. */
export interface Entry {
  title: string;
  href: string;
  /** The section and ISO day printed under the title. */
  meta?: { label: string; date: string };
  /** A small picture after the title. */
  thumb?: string;
}

/** A note as a row: a scratch note keeps its picture, because the picture is most of it. */
export function noteEntry(note: CollectionEntry<"notes">): Entry {
  const entry: Entry = { title: note.data.title, href: `/notes/${note.id}` };
  if (note.data.type === "scratch") entry.thumb = note.data.image;
  return entry;
}
