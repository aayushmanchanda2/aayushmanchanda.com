/**
 * VET-65: a post or video whose files are copied here says when they were
 * copied, so a takedown claim can be answered with a date.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { library, parseLibrary } from "./library.ts";

const base = { slug: "a", title: "A", url: "https://example.com/a", domain: "example.com", saved_date: "2026-08-26", kind: "article" };

test("media_retrieved is an optional real date", () => {
  assert.equal(parseLibrary([base])[0].media_retrieved, null);
  assert.equal(parseLibrary([{ ...base, media_retrieved: "2026-09-24" }])[0].media_retrieved, "2026-09-24");
  assert.throws(() => parseLibrary([{ ...base, media_retrieved: "Sep 24" }]), /media_retrieved/);
});

test("every committed video, and every post with a copied file, carries it", () => {
  const copied = library.filter((e) => e.video || JSON.stringify(e.post).includes('"/posts/'));
  assert.ok(copied.length > 0);
  for (const entry of copied) assert.ok(entry.media_retrieved, `${entry.slug} has media but no media_retrieved`);
});
