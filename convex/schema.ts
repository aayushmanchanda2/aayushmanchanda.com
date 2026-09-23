import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const text = v.optional(v.union(v.string(), v.null()));
/**
 * Nested objects stay `v.any()` on purpose: `src/lib/library.ts › parseLibrary`
 * is the one validator for their shape, run by the import script before a row
 * is sent and by the page before a row is rendered. A second copy here would
 * drift from it.
 */
const nested = v.optional(v.any());

/** A library entry (`src/lib/library.ts › LibraryEntry`) plus what only the private copy keeps. */
export const entryFields = {
    slug: v.string(),
    title: v.string(),
    url: v.string(),
    domain: v.string(),
    saved_date: v.string(),
    kind: v.union(v.literal("article"), v.literal("post"), v.literal("video")),
    note: text,
    tldr: text,
    excerpt: text,
    keyline: text,
    why: text,
    tags: v.optional(v.array(v.string())),
    post: nested,
    video: nested,
    digest: nested,
    draft: nested,
    block: nested,
    highlights: v.optional(v.array(v.any())),
    moments: v.optional(v.array(v.any())),
    also_saved: v.optional(v.boolean()),
    raindrop_id: v.optional(v.union(v.number(), v.null())),
    bucket: text,
    raindrop_note: v.union(v.string(), v.null()),
    sweep_note: v.union(v.string(), v.null()),
};

export default defineSchema({
  entries: defineTable(entryFields)
    .index("by_slug", ["slug"])
    .index("by_raindrop", ["raindrop_id"]),

  /** A file under the entry's original public path (`/posts/<id>/1.webp`), kept in file storage. */
  media: defineTable({
    path: v.string(),
    storageId: v.id("_storage"),
    sha256: v.string(),
  }).index("by_path", ["path"]),
});
