/**
 * The private library's gates and row handling (VET-274), against synthetic
 * rows only. Nothing here comes from the private archive.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { isOwner, sameSecret } from "../../convex/owner.ts";
import { isMePath, meEnv } from "./me.ts";
import { libraryJson, swapMedia, toEntries, toEntry } from "./private.ts";

const row = (extra = {}) => ({
  slug: "synthetic-row",
  title: "A synthetic row",
  url: "https://example.com/a",
  domain: "example.com",
  saved_date: "2026-01-02",
  kind: "article",
  raindrop_id: 1,
  bucket: "private",
  raindrop_note: "mine",
  sweep_note: null,
  ...extra,
});

test("only ALLOWED_EMAIL is the owner; a mocked wrong or missing identity is refused", () => {
  assert.equal(isOwner("owner@example.com", "owner@example.com"), true);
  assert.equal(isOwner(" Owner@Example.com ", "owner@example.com"), true);
  assert.equal(isOwner("someone@example.com", "owner@example.com"), false);
  assert.equal(isOwner(undefined, "owner@example.com"), false);
  assert.equal(isOwner("owner@example.com", undefined), false, "unset ALLOWED_EMAIL fails closed");
  assert.equal(isOwner("", ""), false);
});

test("the ingest secret must match exactly, and an unset one matches nothing", async () => {
  assert.equal(await sameSecret("s3cret", "s3cret"), true);
  assert.equal(await sameSecret("s3cret!", "s3cret"), false);
  assert.equal(await sameSecret("", ""), false);
});

test("/me is configured only with all four values, and only /me paths are private", () => {
  const all = { PUBLIC_CLERK_PUBLISHABLE_KEY: "pk", CLERK_SECRET_KEY: "sk", PUBLIC_CONVEX_URL: "https://x.convex.cloud", ALLOWED_EMAIL: "a@b.c" };
  assert.deepEqual(meEnv(all), { convexUrl: "https://x.convex.cloud", allowed: "a@b.c" });
  assert.equal(meEnv({ ...all, CLERK_SECRET_KEY: undefined }), null);
  assert.equal(meEnv({}), null);
  assert.deepEqual(["/me", "/me/library", "/me/library/x", "/media", "/library"].map(isMePath), [true, true, true, false, false]);
});

test("a row parses as a library entry, private keys stripped, a posterless video read as an article", () => {
  assert.deepEqual(Object.keys(libraryJson(row())).sort(), ["domain", "kind", "saved_date", "slug", "title", "url"]);
  assert.equal(toEntry(row({ kind: "video" })).kind, "article");
  assert.equal(toEntry(row()).title, "A synthetic row");
});

test("media paths become storage URLs at any depth, and nothing else changes", () => {
  const media = { "/posts/1/a.webp": "https://files.example/a" };
  assert.deepEqual(swapMedia({ a: ["/posts/1/a.webp", { b: "/posts/1/a.webp" }], c: "/posts/1/b.webp", n: 2 }, media), {
    a: ["https://files.example/a", { b: "https://files.example/a" }],
    c: "/posts/1/b.webp",
    n: 2,
  });
});

test("a bad row is left out of the list, newest save first", () => {
  const rows = toEntries([row({ slug: "older", saved_date: "2026-01-01" }), row({ slug: "BAD SLUG" }), row({ slug: "newer", saved_date: "2026-03-01" })]);
  assert.deepEqual(rows.map((entry) => entry.slug), ["newer", "older"]);
});
