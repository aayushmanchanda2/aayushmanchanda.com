/**
 * The private library's gates and row handling (VET-274), against synthetic
 * rows only. Nothing here comes from the private archive.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { isOwner, sameSecret } from "../../convex/owner.ts";
import { isMePath, meEnv } from "./me.ts";
import { libraryJson, mergeBlocks, ownNote, raindropHighlights, swapMedia, toEntries, toEntry, whyOf } from "./private.ts";

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
  assert.deepEqual(Object.keys(libraryJson(row({ why_saved: "x", telegram_note: "t", raindrop_highlights: [] }))).sort(), ["domain", "kind", "saved_date", "slug", "title", "url"]);
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

test("the why card takes his note verbatim, line breaks and all, and drops what is empty", () => {
  const why = whyOf(row({ raindrop_note: "line one\n  line two ", note: "Filed.", why_saved: " ", raindrop_highlights: [{ _id: "h1", text: "A passage.", note: "", color: "yellow" }, "Plain.", { text: "" }, null] }));
  assert.deepEqual(why, {
    mine: "line one\n  line two ",
    telegram: null,
    filed: "Filed.",
    why: null,
    sweep: null,
    highlights: [{ text: "A passage.", note: null }, { text: "Plain.", note: null }],
  });
  assert.deepEqual(raindropHighlights(undefined), []);
  assert.deepEqual(whyOf(row({ raindrop_note: "" })).mine, null);
  assert.equal(whyOf(row({ telegram_note: "Sent with the link." })).telegram, "Sent with the link.");
});

test("blocks merge by slug onto the entry, and a slug that matches nothing is reported", () => {
  const archive = [{ entry: { slug: "a" }, raindrop_note: "" }, { entry: { slug: "b" }, raindrop_note: "" }];
  const block = { best_for: "Me.", tip: "Do it.", needs: [], start_here: ["Go."], next_step: "Open it." };
  const { rows, unmatched } = mergeBlocks(archive, [{ slug: "a", why_saved: "Because.", also_saved: true, block }, { slug: "zzz", block: null }]);
  assert.deepEqual(rows[0], { entry: { slug: "a", block, also_saved: true }, raindrop_note: "", why_saved: "Because." });
  assert.equal(rows[1], archive[1]);
  assert.deepEqual(unmatched, ["zzz"]);
  assert.equal(toEntry(row({ block, also_saved: true })).block?.next_step, "Open it.");
});

test("Hermes's sweep-hold lines are not his note: stripped, and a note of nothing else is no note", () => {
  assert.equal(ownNote("sweep-hold: page won't fetch"), null);
  assert.equal(ownNote("sweep-hold: a\n  sweep-hold: b\n"), null);
  assert.equal(ownNote("Read this before the call.\nsweep-hold: paywalled"), "Read this before the call.");
  assert.equal(ownNote("sweep-hold: x\nFirst line\n\nSecond, after a blank"), "First line\n\nSecond, after a blank");
  assert.equal(ownNote("Mentions sweep-hold: mid-line, which is his"), "Mentions sweep-hold: mid-line, which is his");
  assert.equal(ownNote(null), null);
  assert.equal(whyOf(row({ raindrop_note: "sweep-hold: timeout" })).mine, null);
});
