import type { CollectionEntry } from "astro:content";

/** One row of `components/EntryList.astro`. */
export interface Entry {
  title: string;
  href: string;
  /** The section and ISO day printed under the title. */
  meta?: { label: string; date: string };
  /** A small picture after the title. */
  thumb?: string;
  /** A tip's emoji, in a tile before the title, with its summary under it. */
  tip?: { emoji: string; summary: string };
}

/** A note as a row: a scratch note keeps its picture, because the picture is most of it. */
export function noteEntry(note: CollectionEntry<"notes">): Entry {
  const entry: Entry = { title: note.data.title, href: `/notes/${note.id}` };
  if (note.data.type === "scratch") entry.thumb = note.data.image;
  return entry;
}

/** A tip as a row: its emoji tile, the title, and the summary under it. */
export function tipEntry(tip: CollectionEntry<"computer">): Entry {
  const { title, emoji, summary } = tip.data;
  return { title, href: `/notes/${tip.id}`, tip: { emoji, summary } };
}
