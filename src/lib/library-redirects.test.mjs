/**
 * The removed-library 308s in `vercel.json` (`scripts/library-redirects.mjs`)
 * must never catch a page that still exists.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isLibraryRedirect } from "../../scripts/library-redirects.mjs";

const routes = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")).routes;
const library = JSON.parse(readFileSync(new URL("../data/library.json", import.meta.url), "utf8"));
const redirects = routes.filter(isLibraryRedirect);

test("no 308 in vercel.json catches a live library page or its .md", () => {
  const live = library.flatMap((/** @type {{ slug: string }} */ e) => [`/library/${e.slug}`, `/library/${e.slug}/`, `/library/${e.slug}.md`]);
  for (const route of routes.filter((/** @type {{ status?: number }} */ r) => r.status === 308)) {
    const src = new RegExp(route.src);
    for (const url of live) assert.ok(!src.test(url), `${route.src.slice(0, 60)}… redirects live ${url}`);
  }
});

test("each removed-library rule sends a slug, its slash and its .md to /library, and fits Vercel's src cap", () => {
  assert.ok(redirects.length > 0);
  for (const { src } of redirects) {
    assert.ok(src.length <= 4096, `src is ${src.length} chars`);
    const slug = src.slice("^/library/(?:".length).split(/[|)]/)[0];
    for (const url of [`/library/${slug}`, `/library/${slug}/`, `/library/${slug}.md`]) assert.match(url, new RegExp(src));
    for (const url of ["/library", "/library/rss.xml", `/library/tag/${slug}`, `/library/${slug}-x`]) {
      assert.doesNotMatch(url, new RegExp(src));
    }
  }
});

test("the removed-library rules sit before the filesystem handler", () => {
  const filesystem = routes.findIndex((/** @type {{ handle?: string }} */ r) => r.handle === "filesystem");
  for (const rule of redirects) assert.ok(routes.indexOf(rule) < filesystem);
});
