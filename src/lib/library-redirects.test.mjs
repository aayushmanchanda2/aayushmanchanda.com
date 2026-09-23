/*
 * Removed library entries 308 to /library through one rule placed after
 * `handle: filesystem`, so it only fires when no built page matched. Listing the
 * removed slugs instead would publish their names in this public repo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** @type {{ src?: string, handle?: string, status?: number, headers?: Record<string, string> }[]} */
const routes = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")).routes;

test("library fallback 308 sits after the filesystem and names no slug", () => {
  const fs = routes.findIndex((r) => r.handle === "filesystem");
  const fallback = routes.findIndex((r) => r.src?.startsWith("^/library/") && r.status === 308);
  assert.ok(fs >= 0 && fallback > fs, "fallback must come after handle: filesystem");
  assert.equal(routes[fallback].headers?.Location, "/library");
  assert.ok(!routes.some((r) => r.src?.startsWith("^/library/(?:")), "no per-slug redirect list");
});
