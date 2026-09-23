/** The Internal/* → Convex sync (VET-274), with a synthetic bookmark and no network. */
import test from "node:test";
import assert from "node:assert/strict";

import { sync, toPrivateRow } from "./private-sync.mjs";

/** @param {Partial<import("./types.js").Bookmark>} extra @returns {import("./types.js").Bookmark} */
const bookmark = (extra = {}) => ({
  id: "42",
  url: "https://example.com/post",
  title: "A Synthetic Save",
  excerpt: "",
  note: "",
  domain: "example.com",
  collection: "reading",
  tags: ["research"],
  ...extra,
});

test("a bookmark becomes a minimal private row keyed by its Raindrop id", () => {
  const row = toPrivateRow(bookmark({ note: "why I kept it", cover: "https://img.example/c.jpg" }), "Internal/Reading", "2026-09-23");
  assert.equal(row.slug, "a-synthetic-save-42");
  assert.equal(row.raindrop_id, 42);
  assert.equal(row.saved_date, "2026-09-23");
  assert.equal(row.raindrop_note, "why I kept it");
  assert.equal(row.sweep_note, null);
  assert.equal(row.cover, "https://img.example/c.jpg");
  assert.deepEqual(row.tags, ["research"]);
});

test("a sweep blob in the note splits into his why and the drafted why", () => {
  const note = JSON.stringify({ why: "drafted by the sweep", author: "hermes" });
  const row = toPrivateRow(bookmark({ note }), "Internal/Tools", "2026-09-23");
  assert.equal(row.raindrop_note, null);
  assert.equal(row.sweep_note, "drafted by the sweep");
});

test("with a secret missing it skips cleanly and makes no request", async () => {
  let calls = 0;
  const result = await sync({ RAINDROP_TOKEN: "t", CONVEX_SITE_URL: "https://x.convex.site" }, /** @type {any} */ (() => calls++));
  assert.deepEqual(result, { sent: 0 });
  assert.equal(calls, 0);
});
