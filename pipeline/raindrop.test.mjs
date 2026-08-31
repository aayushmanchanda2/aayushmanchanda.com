/**
 * The Raindrop boundary: what it refuses, and what it promises not to destroy.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { RaindropError, createClient, fetchBookmarks, tagBookmark } from "./raindrop.mjs";
import { bookmark } from "./fixtures.mjs";

/** @param {(url: URL, init: RequestInit) => Response} handler */
function client(handler) {
  /** @type {{ url: URL, init: RequestInit }[]} */
  const calls = [];

  /** @type {typeof globalThis.fetch} */
  const fetch = async (input, init = {}) => {
    calls.push({ url: new URL(String(input)), init });
    return handler(new URL(String(input)), init);
  };

  return { client: createClient({ token: "t", fetch }), calls };
}

/** @param {unknown} payload @param {number} [status] */
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("a rejected token says which secret to fix, not just '401'", async () => {
  const { client: api } = client(() => new Response("Unauthorized", { status: 401 }));

  await assert.rejects(
    () => api.request("/collections"),
    (error) => {
      assert.ok(error instanceof RaindropError);
      assert.match(error.message, /RAINDROP_TOKEN/);
      assert.match(error.message, /App Console/);
      return true;
    },
  );
});

test("a 200 carrying `result: false` is still a failure", async () => {
  const { client: api } = client(() => json({ result: false, errorMessage: "collection removed" }));

  await assert.rejects(() => api.request("/collections"), /collection removed/);
});

test("an unreachable API names the URL it could not reach", async () => {
  const api = createClient({
    token: "t",
    fetch: async () => {
      throw new TypeError("fetch failed");
    },
  });

  await assert.rejects(() => api.request("/collections"), /unreachable.*fetch failed/);
});

test("a bookmark with no link is a boundary failure, not a half-built entry", async () => {
  const { client: api } = client(() => json({ result: true, items: [{ _id: 1, title: "no link" }] }));

  await assert.rejects(() => fetchBookmarks(api, 11, "sites"), /has no "link"/);
});

test("fetchBookmarks parses items into our shape and stops when a page is short", async () => {
  const { client: api, calls } = client(() =>
    json({
      result: true,
      items: [bookmark(5, "https://linear.app", { title: " Linear ", excerpt: " tracker ", tags: ["saved"] })],
    }),
  );

  const [parsed] = await fetchBookmarks(api, 11, "tools");

  assert.deepEqual(parsed, {
    id: "5",
    url: "https://linear.app",
    title: "Linear",
    excerpt: "tracker",
    note: "",
    domain: "linear.app",
    collection: "tools",
    tags: ["saved"],
  });
  assert.equal(calls.length, 1, "a short page ends the walk");
});

test("the private note is a different field from the excerpt, and both come through", async () => {
  // Raindrop hands back two text fields that look interchangeable and are not.
  // `excerpt` is the description it scrapes off the page when nobody types one;
  // `note` is the private field only the account holder sees, which is where a
  // sweep leaves a draft blob. Reading the wrong one would put machine JSON
  // where a reader's sentence goes, and a sentence where JSON was expected.
  const { client: api } = client(() =>
    json({
      result: true,
      items: [
        {
          ...bookmark(6, "https://x.com/someone/status/1", { excerpt: "scraped off the page" }),
          note: '  {"why":"because"}  ',
        },
      ],
    }),
  );

  const [parsed] = await fetchBookmarks(api, 13, "reading");

  assert.equal(parsed?.excerpt, "scraped off the page");
  assert.equal(parsed?.note, '{"why":"because"}', "trimmed, and otherwise untouched");
});

test("a bookmark with no note reads as an empty one, never as undefined", async () => {
  // Most bookmarks have no private note at all, and `draftFrom` is handed this
  // string directly — so an undefined here would be a TypeError on the ordinary
  // path rather than on the rare one.
  const { client: api } = client(() =>
    json({ result: true, items: [{ _id: 7, link: "https://a.example" }] }),
  );

  const [parsed] = await fetchBookmarks(api, 11, "tools");

  assert.equal(parsed?.note, "");
});

test("tagging merges rather than replacing the user's own tags", async () => {
  const { client: api, calls } = client(() => json({ result: true, item: {} }));

  const tags = await tagBookmark(
    api,
    { id: "9", url: "https://a.example", title: "", excerpt: "", note: "", domain: "", collection: "sites", tags: ["design", "read-later"] },
    "published",
  );

  assert.deepEqual(tags, ["design", "read-later", "published"]);
  assert.deepEqual(JSON.parse(String(calls[0].init.body)).tags, [
    "design",
    "read-later",
    "published",
  ]);
});

test("a bookmark already carrying the tag costs no request", async () => {
  const { client: api, calls } = client(() => json({ result: true }));

  await tagBookmark(
    api,
    { id: "9", url: "https://a.example", title: "", excerpt: "", note: "", domain: "", collection: "sites", tags: ["published"] },
    "published",
  );

  assert.equal(calls.length, 0);
});
