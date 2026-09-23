import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { httpAction } from "./_generated/server";
import { sameSecret } from "./owner";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** `Authorization: Bearer <INGEST_SECRET>`, compared in constant time; unset secret refuses all. */
const guarded = (handler: (ctx: ActionCtx, request: Request) => Promise<Response>) =>
  httpAction(async (ctx, request) => {
    const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!(await sameSecret(given, process.env.INGEST_SECRET ?? ""))) return json({ error: "unauthorized" }, 401);
    return handler(ctx, request);
  });

const MEDIA_PATH = /^\/(?:posts|shots|previews)\/[A-Za-z0-9/_.-]+\.(?:webp|mp4)$/;

const sha256 = async (bytes: ArrayBuffer) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");

const http = httpRouter();

/** `{ rows, mode: "upsert" | "insert" }`. Idempotent: rows are keyed by slug. */
http.route({
  path: "/import",
  method: "POST",
  handler: guarded(async (ctx, request) => {
    try {
      return json(await ctx.runMutation(internal.entries.importRows, await request.json()));
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  }),
});

/** The file's bytes, at `?path=/posts/<id>/<name>.webp`. Skipped when the stored copy has the same hash. */
http.route({
  path: "/import/media",
  method: "POST",
  handler: guarded(async (ctx, request) => {
    const path = new URL(request.url).searchParams.get("path") ?? "";
    if (!MEDIA_PATH.test(path) || path.includes("..")) return json({ error: "bad path" }, 400);
    const bytes = await request.arrayBuffer();
    const hash = await sha256(bytes);
    if ((await ctx.runQuery(internal.entries.mediaSha, { path })) === hash) return json({ stored: false });
    const type = request.headers.get("content-type") ?? "application/octet-stream";
    const storageId = await ctx.storage.store(new Blob([bytes], { type }));
    await ctx.runMutation(internal.entries.putMedia, { path, storageId, sha256: hash });
    return json({ stored: true });
  }),
});

/** Row and file counts, for the import script's closing line. */
http.route({
  path: "/import",
  method: "GET",
  handler: guarded(async (ctx) => json(await ctx.runQuery(internal.entries.counts, {}))),
});

export default http;
