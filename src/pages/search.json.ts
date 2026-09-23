/**
 * The command palette's index as one static file, fetched the first time the
 * palette opens (`lib/palette.ts`). It holds the full text of every post, so
 * it is a request on demand rather than bytes inline on all 400 pages.
 *
 * ponytail: one file with every body (457 KB raw, 153 KB gzipped at VET-247).
 * Past ~1 MB, split the bodies into a second file fetched on the first query.
 */
import type { APIRoute } from "astro";

import { buildSearchIndex } from "../lib/search-index";

export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await buildSearchIndex()), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
