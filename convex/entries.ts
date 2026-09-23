import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { isOwner } from "./owner";
import { entryFields } from "./schema";

/** Every public function here starts with this: a Clerk identity whose email is ALLOWED_EMAIL. */
async function requireOwner(ctx: QueryCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!isOwner(identity?.email, process.env.ALLOWED_EMAIL)) throw new ConvexError("Not allowed");
}

const plain = ({ _id, _creationTime, ...row }: Doc<"entries">) => row;

const bySlug = (ctx: QueryCtx, slug: string) =>
  ctx.db.query("entries").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();

const MEDIA_PATH = /\/(?:posts|shots)\/[A-Za-z0-9/_.-]+\.(?:webp|mp4)/g;

/** Every private entry, whole. ponytail: one read of ~100 rows; page it past a few thousand. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    return (await ctx.db.query("entries").collect()).map(plain);
  },
});

/** One entry, and a signed file-storage URL for every media path it mentions. */
export const get = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    await requireOwner(ctx);
    const row = await bySlug(ctx, slug);
    if (row === null) return null;
    const media: Record<string, string> = {};
    for (const path of new Set(JSON.stringify(row).match(MEDIA_PATH) ?? [])) {
      const file = await ctx.db.query("media").withIndex("by_path", (q) => q.eq("path", path)).unique();
      const url = file && (await ctx.storage.getUrl(file.storageId));
      if (url) media[path] = url;
    }
    return { row: plain(row), media };
  },
});

/**
 * `upsert` replaces by slug (the archive import, safe to re-run). `insert`
 * only adds a row whose slug and raindrop id are both new (the publish cron,
 * which must never overwrite an enriched archive row with a bare bookmark).
 */
export const importRows = internalMutation({
  args: {
    rows: v.array(v.object(entryFields)),
    mode: v.union(v.literal("upsert"), v.literal("insert")),
  },
  handler: async (ctx, { rows, mode }) => {
    const out = { inserted: 0, updated: 0, skipped: 0 };
    for (const row of rows) {
      const existing = await bySlug(ctx, row.slug);
      if (mode === "insert") {
        const known =
          existing ??
          (row.raindrop_id == null
            ? null
            : await ctx.db.query("entries").withIndex("by_raindrop", (q) => q.eq("raindrop_id", row.raindrop_id)).first());
        if (known) out.skipped++;
        else (await ctx.db.insert("entries", row), out.inserted++);
      } else if (existing) {
        await ctx.db.replace(existing._id, row);
        out.updated++;
      } else {
        await ctx.db.insert("entries", row);
        out.inserted++;
      }
    }
    return out;
  },
});

export const mediaSha = internalQuery({
  args: { path: v.string() },
  handler: async (ctx, { path }) =>
    (await ctx.db.query("media").withIndex("by_path", (q) => q.eq("path", path)).unique())?.sha256 ?? null,
});

/** Point a path at a new stored file, deleting the file it pointed at before. */
export const putMedia = internalMutation({
  args: { path: v.string(), storageId: v.id("_storage"), sha256: v.string() },
  handler: async (ctx, file) => {
    const existing = await ctx.db.query("media").withIndex("by_path", (q) => q.eq("path", file.path)).unique();
    if (existing === null) return void (await ctx.db.insert("media", file));
    await ctx.storage.delete(existing.storageId);
    await ctx.db.replace(existing._id, file);
  },
});

export const counts = internalQuery({
  args: {},
  handler: async (ctx) => ({
    entries: (await ctx.db.query("entries").collect()).length,
    media: (await ctx.db.query("media").collect()).length,
  }),
});
