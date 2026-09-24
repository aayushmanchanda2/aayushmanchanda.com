/*
 * Removed library entries and tools 308 to their section through one rule placed after
 * `handle: filesystem`, so it only fires when no built page matched. Listing the
 * removed slugs instead would publish their names in this public repo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** @type {{ src?: string, handle?: string, status?: number, headers?: Record<string, string> }[]} */
const routes = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")).routes;

test("library and tools fallback 308 sits after the filesystem and names no slug", () => {
  const fs = routes.findIndex((r) => r.handle === "filesystem");
  const fallback = routes.findIndex((r) => r.src?.startsWith("^/(library|tools)/") && r.status === 308);
  assert.ok(fs >= 0 && fallback > fs, "fallback must come after handle: filesystem");
  const to = (/** @type {string} */ path) => {
    const hit = new RegExp(/** @type {string} */ (routes[fallback].src)).exec(path);
    return hit ? routes[fallback].headers?.Location?.replace("$1", hit[1] ?? "") : undefined;
  };
  assert.equal(to("/library/gone"), "/library");
  assert.equal(to("/tools/gone"), "/tools");
  assert.equal(to("/tools/gone/"), "/tools");
  assert.equal(to("/tools/category/agent-skills"), undefined, "category pages are two segments deep");
  assert.ok(!routes.some((r) => r.src?.startsWith("^/library/(?:")), "no per-slug redirect list");
});

test("an old tag page and its .md 308 to /library filtered by that tag, before the slash rule", () => {
  const at = routes.findIndex((r) => r.src?.startsWith("^/library/tag/"));
  const slash = routes.findIndex((r) => r.src === "^/(.+)/$");
  assert.ok(at >= 0 && at < slash, "the tag rule must come before the trailing-slash 308, so it is one hop");
  const rule = routes[at];
  assert.equal(rule.status, 308);
  const to = (/** @type {string} */ path) => {
    const hit = new RegExp(/** @type {string} */ (rule.src)).exec(path);
    return hit ? rule.headers?.Location?.replace("$1", hit[1] ?? "") : undefined;
  };
  assert.equal(to("/library/tag/agents"), "/library?tags=agents");
  assert.equal(to("/library/tag/go-to-market.md"), "/library?tags=go-to-market");
  assert.equal(to("/library/tag/agents/"), "/library?tags=agents");
  assert.equal(to("/library/kind/post"), undefined);
});

test("a tag chip on an entry opens /library filtered to it", () => {
  const chips = readFileSync(new URL("../components/TagChips.astro", import.meta.url), "utf8");
  assert.match(chips, /href=\{`\/library\?tags=\$\{slug\}`\}/);
});
